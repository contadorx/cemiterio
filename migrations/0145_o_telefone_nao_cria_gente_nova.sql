-- ============================================================================
-- 0145 — O TELEFONE NAO CRIA GENTE NOVA
-- ============================================================================
--
-- O QUE SE MEDIU EM 29/08, EM PRODUCAO
--
--   287  clientes com o telefone comecando em 55
--    46  clientes SEM o 55
--     1  com 10 digitos, 5 com lixo (1 a 2 digitos)
--    11  pares de duplicados ja criados por isso
--
-- `acharCliente` comparava com igualdade exata:
--
--     .eq("telefone", telefone)
--
-- O WhatsApp SEMPRE manda com o 55. Quem estava cadastrado sem ele nunca era
-- reconhecido: virava lead, recebia a saudacao de desconhecido, e a IA
-- respondia sem contexto nenhum. Depois alguem cadastrava a pessoa de novo — e
-- nascia a segunda copia, agora com o 55, numa familia nova e vazia.
--
-- O CASO QUE MOSTROU ISSO
--
--   Katia   11988758966  familia Tonellotti      2 jazigos
--   Katia 5511988758966  familia "Familia Katia" 0 jazigos, 1 comprovante
--
-- A mesma pessoa. Ela e responsavel dos Tonellotti e pagou pelos Tonellotti,
-- e os R$ 40 caíram numa familia que nao tem jazigo nenhum.
--
-- ---------------------------------------------------------------------------
-- POR QUE APAGAR AS FAMILIAS SEM JAZIGO NAO RESOLVE — E PIORA
-- ---------------------------------------------------------------------------
-- `clientes.familia_id` e ON DELETE **SET NULL**, nao CASCADE. Apagar a
-- familia NAO apaga a copia da pessoa: ela sobrevive orfa, com o telefone COM
-- o 55 — que e exatamente o que o WhatsApp procura. Entao a copia continua
-- vencendo a busca, e agora sem familia.
--
-- E `sureya_lancar` RECUSA cliente sem familia ('cliente_sem_familia'). Ou
-- seja: todo pagamento dessa pessoa passaria a falhar.
--
-- Medido: 122 familias sem jazigo, 119 clientes que ficariam orfaos. E
-- `conta_corrente.familia_id` e ON DELETE **CASCADE**: apagar levaria junto 1
-- lancamento de R$ 40,00 — justamente o da Katia.
--
-- Por isso a ordem e a inversa: normalizar, fundir, e SO ENTAO apagar o que
-- sobrar vazio de verdade. Esta migration entrega as tres travas.
--
-- NADA AQUI MEXE EM DADO NENHUM. Sao funcoes e um indice.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A REGRA DO NUMERO — explicita, brasileira, e conservadora.
--
-- NAO e "os ultimos 11 digitos". Isso casaria numeros de DDDs diferentes em
-- casos de borda, e num sistema onde telefone identifica QUEM PAGA um falso
-- positivo junta duas familias.
--
-- E NAO MEXE NO NONO DIGITO. `5511988758966` (13) e `551188758966` (12) podem
-- ser a mesma linha ou nao — a operadora sabe, o banco nao. Inventar o 9 aqui
-- criaria uniao errada em silencio; deixar como esta so mantem um duplicado
-- visivel, que a tela de fusao resolve com uma pessoa olhando.
-- ----------------------------------------------------------------------------
create or replace function sureya_telefone_normalizado(p_tel text)
returns text
language sql
immutable
as $$
  with d as (select regexp_replace(coalesce(p_tel, ''), '\D', '', 'g') as n)
  select case
    -- Ja vem com DDI: fica como esta.
    when length(n) in (12, 13) and left(n, 2) = '55' then n
    -- DDD + numero (10 ou 11 digitos): ganha o DDI.
    when length(n) in (10, 11) then '55' || n
    -- Qualquer outra forma NAO SE ADIVINHA. Devolver o que veio deixa o
    -- registro torto visivel em vez de inventar um numero plausivel.
    else n
  end from d;
$$;

comment on function sureya_telefone_normalizado(text) is
  'O telefone na forma que o WhatsApp usa: 55 + DDD + numero (0145). Nao mexe no nono digito.';

-- O indice e funcional: a busca por telefone normalizado deixa de varrer a
-- tabela. Nao e UNICO de proposito — hoje existem 11 pares duplicados, e um
-- indice unico faria esta migration falhar em vez de expor o problema.
create index if not exists ix_clientes_tel_normalizado
  on clientes (org_id, sureya_telefone_normalizado(telefone));
create index if not exists ix_telefones_cliente_normalizado
  on telefones_cliente (org_id, sureya_telefone_normalizado(telefone));

-- ----------------------------------------------------------------------------
-- ACHAR A PESSOA PELO NUMERO — uma porta so.
--
-- Olha o cadastro principal e os telefones extras, sempre pela forma
-- normalizada. p_org explicito (licao da 0103): quem chama e o webhook, sem
-- sessao de painel, e `current_org_id()` seria nulo ali.
-- ----------------------------------------------------------------------------
create or replace function sureya_achar_cliente(p_tel text, p_org uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from (
    select c.id, 1 as ordem
      from clientes c
     where c.org_id = p_org
       and sureya_telefone_normalizado(c.telefone) = sureya_telefone_normalizado(p_tel)
       and sureya_telefone_normalizado(p_tel) <> ''
    union all
    select tc.cliente_id, 2
      from telefones_cliente tc
     where tc.org_id = p_org
       and sureya_telefone_normalizado(tc.telefone) = sureya_telefone_normalizado(p_tel)
       and sureya_telefone_normalizado(p_tel) <> ''
  ) s
  -- O CADASTRO PRINCIPAL GANHA DO TELEFONE EXTRA. Se os dois casarem, e o
  -- principal que carrega a familia, o saldo e a regua.
  order by ordem
  limit 1;
$$;

revoke execute on function sureya_achar_cliente(text, uuid) from public, anon;
grant  execute on function sureya_achar_cliente(text, uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- QUEM ESTA DUPLICADO — e o que cada lado carrega.
--
-- A tela precisa disto para a pessoa escolher qual fica: o par nao se decide
-- pelo nome (um e "Katia", o outro "Kátia"), decide-se pelo que tem preso.
-- ----------------------------------------------------------------------------
create or replace function sureya_clientes_duplicados(p_org uuid)
returns table (
  numero text, cliente_id uuid, nome text, telefone text,
  familia_id uuid, familia text, jazigos int, lancamentos int,
  comprovantes int, conversas int, mensagens int, criado_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with n as (
    select c.id, c.nome, c.telefone, c.familia_id, c.created_at,
           sureya_telefone_normalizado(c.telefone) as chave
      from clientes c
     where c.org_id = p_org and coalesce(c.telefone, '') <> ''
  ),
  d as (select chave from n where chave <> '' group by chave having count(*) > 1)
  select n.chave, n.id, n.nome, n.telefone, n.familia_id, f.nome,
         (select count(*)::int from tumulos t where t.familia_id = n.familia_id),
         (select count(*)::int from conta_corrente x where x.cliente_id = n.id),
         (select count(*)::int from comprovantes cp where cp.cliente_id = n.id),
         (select count(*)::int from conversas cv where cv.cliente_id = n.id),
         (select count(*)::int from mensagens m where m.cliente_id = n.id),
         n.created_at
    from n join d on d.chave = n.chave
    left join familias f on f.id = n.familia_id
   order by n.chave, n.created_at;
$$;

revoke execute on function sureya_clientes_duplicados(uuid) from public, anon;
grant  execute on function sureya_clientes_duplicados(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- FUNDIR DUAS PESSOAS NUMA SO.
--
-- MOVE TUDO ANTES DE APAGAR. Doze das vinte e nove referencias a `clientes`
-- sao ON DELETE CASCADE — entre elas conversas, mensagens, comprovantes e
-- interacoes_ia. Apagar a copia sem mover primeiro nao "limpa duplicata": apaga
-- o historico da familia.
--
-- p_ensaio devolve a contagem do que seria movido, sem escrever. E a MESMA
-- funcao — previa e execucao com contas diferentes e o defeito que este projeto
-- mais repete, e aqui ele apagaria conversa de familia.
-- ----------------------------------------------------------------------------
create or replace function sureya_fundir_clientes(
  p_fica  uuid,
  p_sai   uuid,
  p_org   uuid    default null,
  p_ensaio boolean default false
)
returns table (o_que text, quantos int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_fica record; v_sai record;
  v_n int;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := coalesce(p_org, current_org_id());
  if v_org is null then raise exception 'sem_org'; end if;
  if p_fica = p_sai then
    raise exception 'mesma_pessoa' using hint = 'Escolha duas pessoas diferentes.';
  end if;

  select * into v_fica from clientes where id = p_fica and org_id = v_org;
  if not found then raise exception 'cliente_que_fica_nao_encontrado'; end if;
  select * into v_sai  from clientes where id = p_sai  and org_id = v_org;
  if not found then raise exception 'cliente_que_sai_nao_encontrado'; end if;

  -- QUEM FICA PRECISA DE FAMILIA. Fundir para dentro de um orfao criaria
  -- exatamente o estado que `sureya_lancar` recusa — e o pagamento seguinte
  -- falharia sem ninguem entender por que.
  if v_fica.familia_id is null then
    raise exception 'quem_fica_sem_familia' using
      hint = 'A pessoa que fica precisa estar numa familia.';
  end if;

  -- O RAZAO ANTIGO ESTA CONGELADO DESDE A 0074 (D-01), e `movimentos` e ON
  -- DELETE CASCADE. Ficariam duas saidas ruins: escrever nele — proibido, e o
  -- teste do congelamento pega — ou apagar a copia e deixar o CASCADE levar
  -- historico junto, calado.
  --
  -- Entao a funcao PARA e diz. Medido em 29/08: `movimentos` tem 2 linhas no
  -- total e NENHUMA em cliente duplicado, entao isto nao bloqueia nada hoje.
  -- Se um dia bloquear, e porque ha historico de verdade em jogo — e ai a
  -- decisao tem de ser de uma pessoa.
  if exists (select 1 from movimentos where cliente_id = p_sai) then
    raise exception 'copia_tem_razao_antigo' using
      hint = 'O cadastro que sai tem lancamento no razao antigo, que esta '
           || 'congelado. Nao da para mover nem apagar sem perder historico.';
  end if;

  -- ---- o que se move (na ordem: primeiro o que aponta, depois o que some) --
  if not p_ensaio then
    update conversas       set cliente_id = p_fica where cliente_id = p_sai;
    update mensagens       set cliente_id = p_fica where cliente_id = p_sai;
    update comprovantes    set cliente_id = p_fica where cliente_id = p_sai;
    update interacoes_ia   set cliente_id = p_fica where cliente_id = p_sai;
    update compromissos    set cliente_id = p_fica where cliente_id = p_sai;
    update consentimentos  set cliente_id = p_fica where cliente_id = p_sai;
    update historico_cliente set cliente_id = p_fica where cliente_id = p_sai;
    update pedidos_extras  set cliente_id = p_fica where cliente_id = p_sai;
    update pedidos_conversa set cliente_id = p_fica where cliente_id = p_sai;
    update planos          set cliente_id = p_fica where cliente_id = p_sai;
    update reajustes       set cliente_id = p_fica where cliente_id = p_sai;
    update ativacoes_disparadas set cliente_id = p_fica where cliente_id = p_sai;

    -- O RAZAO VAI JUNTO, e a familia dele tambem: um credito que ficasse com a
    -- familia antiga apontaria para uma familia que vai deixar de existir.
    update conta_corrente
       set cliente_id = p_fica, familia_id = v_fica.familia_id
     where cliente_id = p_sai;

    update servicos        set cliente_id = p_fica where cliente_id = p_sai;
    update tumulos         set cliente_id = p_fica where cliente_id = p_sai;
    update fila_liberacao  set cliente_id = p_fica where cliente_id = p_sai;
    update lancamentos     set cliente_id = p_fica where cliente_id = p_sai;
    update entradas_banco  set cliente_id = p_fica where cliente_id = p_sai;
    update avaliacoes      set cliente_id = p_fica where cliente_id = p_sai;
    update chamadas_ia     set cliente_id = p_fica where cliente_id = p_sai;
    update pedidos_ajuda   set cliente_id = p_fica where cliente_id = p_sai;
    update leads           set cliente_id     = p_fica where cliente_id = p_sai;
    update leads           set cliente_novo_id = p_fica where cliente_novo_id = p_sai;
    update indicacoes      set indicador_id   = p_fica where indicador_id = p_sai;
    update indicacoes      set cliente_novo_id = p_fica where cliente_novo_id = p_sai;
    update familia_responsavel_log set cliente_id = p_fica where cliente_id = p_sai;

    -- O NUMERO DA COPIA VIRA TELEFONE EXTRA DE QUEM FICA.
    -- E o numero por onde a familia escreve hoje: joga-lo fora faria a proxima
    -- mensagem dela cair como desconhecida — o defeito que esta migration
    -- existe para fechar.
    insert into telefones_cliente (org_id, cliente_id, telefone, rotulo)
    select v_org, p_fica, v_sai.telefone, 'do cadastro duplicado'
     where coalesce(v_sai.telefone, '') <> ''
       and sureya_telefone_normalizado(v_sai.telefone)
           <> sureya_telefone_normalizado(v_fica.telefone)
    on conflict (org_id, telefone) do nothing;

    update telefones_cliente set cliente_id = p_fica where cliente_id = p_sai
       and not exists (
         select 1 from telefones_cliente t2
          where t2.org_id = telefones_cliente.org_id
            and t2.telefone = telefones_cliente.telefone
            and t2.cliente_id = p_fica);
    delete from telefones_cliente where cliente_id = p_sai;

    -- Se a copia era a responsavel de alguma familia, o posto passa a quem fica.
    update familias set responsavel_id = p_fica where responsavel_id = p_sai;

    delete from clientes where id = p_sai and org_id = v_org;
  end if;

  -- ---- o relatorio (no ensaio, e a previa; valendo, e o comprovante) -------
  o_que := 'conversas';    select count(*)::int into v_n from conversas where cliente_id = case when p_ensaio then p_sai else p_fica end; quantos := v_n; return next;
  o_que := 'mensagens';    select count(*)::int into v_n from mensagens where cliente_id = case when p_ensaio then p_sai else p_fica end; quantos := v_n; return next;
  o_que := 'comprovantes'; select count(*)::int into v_n from comprovantes where cliente_id = case when p_ensaio then p_sai else p_fica end; quantos := v_n; return next;
  o_que := 'lancamentos';  select count(*)::int into v_n from conta_corrente where cliente_id = case when p_ensaio then p_sai else p_fica end; quantos := v_n; return next;
  return;
end $$;

revoke execute on function sureya_fundir_clientes(uuid, uuid, uuid, boolean) from public, anon;
grant  execute on function sureya_fundir_clientes(uuid, uuid, uuid, boolean) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- A FAMILIA QUE AINDA TEM ALGUEM NAO SE APAGA.
--
-- `conta_corrente.familia_id` e ON DELETE CASCADE: apagar leva o razao junto,
-- em silencio. E `clientes.familia_id` e SET NULL: a pessoa fica orfa, e
-- `sureya_lancar` recusa cliente sem familia — todo pagamento dela passaria a
-- falhar.
--
-- Medido em 29/08: das 122 familias sem jazigo, apenas 3 estao REALMENTE
-- vazias. As outras 119 tem gente, e uma delas tem R$ 40,00 no razao.
--
-- Esta trava nao proibe limpar: proibe limpar SEM VER. Quem quiser apagar move
-- a pessoa e o dinheiro primeiro — que e o trabalho de verdade.
-- ----------------------------------------------------------------------------
create or replace function sureya_familia_vazia_para_apagar()
returns trigger
language plpgsql
as $$
declare v_p int; v_l int; v_t int;
begin
  select count(*) into v_p from clientes       where familia_id = old.id;
  select count(*) into v_l from conta_corrente where familia_id = old.id;
  select count(*) into v_t from tumulos        where familia_id = old.id;

  if v_p > 0 or v_l > 0 or v_t > 0 then
    raise exception
      'familia_nao_esta_vazia'
      using hint = format(
        'A familia "%s" ainda tem %s pessoa(s), %s lancamento(s) e %s jazigo(s). '
        || 'Mova-os antes de apagar — o razao some junto com ela.',
        old.nome, v_p, v_l, v_t);
  end if;
  return old;
end $$;

drop trigger if exists trg_familia_vazia_para_apagar on familias;
create trigger trg_familia_vazia_para_apagar
  before delete on familias
  for each row execute function sureya_familia_vazia_para_apagar();
