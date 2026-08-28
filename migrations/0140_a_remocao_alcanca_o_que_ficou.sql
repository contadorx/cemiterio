-- ============================================================================
-- 0140 — A REMOCAO ALCANCA O QUE FICOU, E SE PROVA
-- ============================================================================
--
-- COMO ISTO APARECEU
--
-- O caminho da remocao a pedido existia desde a 0010, foi reforcado na 0078 e
-- de novo na 0135 — e NUNCA TINHA RODADO. O item estava no backlog como
-- "exercitar a remocao com uma familia de teste".
--
-- Rodei. Em producao, dentro de um bloco desfeito: anonimizei uma cliente real
-- e depois varri TODA coluna de texto do schema publico atras do nome e do
-- telefone dela. Ler a funcao nao teria bastado — o que ela esquece nao
-- aparece nela.
--
-- O QUE SOBROU, MEDIDO
--
--   leads.telefone            1   o numero dela, inteiro
--   leads.nome_wa             2   (uma e ela; a outra e OUTRA pessoa)
--   interacoes_ia.rascunho    3   rascunhos que a chamam pelo nome, com valores
--   eventos_webhook.telefone  3   o numero no log cru do WhatsApp
--   familias.nome             1   "Familia Katia"
--   familias.observacoes      1   "Criada automaticamente a partir do cadastro de Katia"
--
-- O PIOR DELES E UM BUG DE ORDEM, e ele estava escondido em codigo que PARECE
-- certo. A funcao fazia:
--
--     update clientes set telefone = 'anon:...' where id = p_cliente;
--     ...
--     update leads ... where telefone in (select telefone from clientes where id = p_cliente);
--
-- Quando o segundo update roda, a subconsulta ja le 'anon:cd2a22148280'. Medido
-- no ensaio: ela casa ZERO linhas. A limpeza dos leads nunca funcionou, desde
-- que foi escrita — e nao havia como saber lendo, porque a linha esta la.
--
-- O CONSERTO TEM DUAS PARTES, e a segunda importa mais que a primeira.
--
-- (1) Alcancar o que ficou: os telefones sao CAPTURADOS ANTES de qualquer
--     escrita, os rascunhos da IA e o log do webhook entram na limpeza, e o
--     nome da familia derivado do nome dela deixa de carrega-lo.
--
-- (2) A REMOCAO PASSA A SE PROVAR. `sureya_anonimizar_cliente` agora devolve o
--     que sobrou — ela mesma roda a varredura, com o nome e o telefone que
--     ainda tem na mao. Consertar a funcao resolve os seis casos de hoje;
--     devolver a varredura resolve o setimo, que vai aparecer na tabela que
--     alguem criar mes que vem e esquecer de incluir aqui.
--
-- A DIFERENCA ENTRE DEFEITO E MENCAO
--
-- O telefone e inequivoco: se ele aparece, sobrou dado dela. O nome nao —
-- "Katia" tambem e o comeco de "Katia C. Lima", que e OUTRA pessoa e nao pediu
-- nada. Por isso a varredura separa os dois, e so o telefone conta como falha.
-- Alarme que grita por mencao de terceiro ensina a ignorar alarme, e ai o dia
-- em que ele estiver certo passa batido tambem.
-- ============================================================================

-- ---------------------------------------------------------------- 0
-- UMA DERIVA, ACHADA DE RASPAO
--
-- `interacoes_ia.motivo_retencao` EXISTE em producao e NENHUMA migration a
-- cria — alguem a acrescentou pelo painel do Supabase. A 0120 ja a LE, mas
-- dentro do corpo de uma funcao, que o Postgres nao valida na criacao: num
-- banco reconstruido do zero a trilha passa e a funcao explode na primeira
-- chamada.
--
-- Apareceu porque o teste desta migration precisou limpar essa coluna e o
-- banco de ensaio nao a tinha. Entra aqui: a trilha tem de reproduzir a
-- producao, e `if not exists` faz a producao nao sentir nada.
-- ----------------------------------------------------------------------------
alter table interacoes_ia add column if not exists motivo_retencao text;

-- ---------------------------------------------------------------- 1
-- A VARREDURA
--
-- Percorre TODA coluna de texto e jsonb do schema publico. E cara — uma
-- varredura completa por coluna — e isso e aceitavel de proposito: ela roda
-- uma vez por pedido de remocao, que e um evento raro e caro por natureza. O
-- que nao seria aceitavel e uma lista fixa de tabelas, porque ela envelhece em
-- silencio: a tabela nova de mes que vem nao estaria nela, e ninguem
-- descobriria.
--
-- p_org EXPLICITO (licao da 0103). Os identificadores vem do catalogo e vao
-- por %I; os valores vao por %L — nada aqui e concatenado a mao.
-- ----------------------------------------------------------------------------
create or replace function sureya_sobrou_da_remocao(
  p_org uuid, p_nome text, p_tel text
)
returns table (onde text, quantos int, pelo_telefone boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare r record; n bigint;
begin
  for r in
    select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
       and t.table_name  = c.table_name
       and t.table_type  = 'BASE TABLE'
     where c.table_schema = 'public'
       and c.data_type in ('text', 'character varying', 'jsonb')
     order by c.table_name, c.column_name
  loop
    -- PELO TELEFONE — inequivoco. Se aparece, e dado dela.
    if coalesce(btrim(p_tel), '') <> '' then
      begin
        execute format('select count(*) from %I where %I::text like %L',
                       r.table_name, r.column_name, '%' || p_tel || '%')
          into n;
        if n > 0 then
          onde := r.table_name || '.' || r.column_name;
          quantos := n; pelo_telefone := true; return next;
        end if;
      exception when others then null;
      end;
    end if;

    -- PELO NOME — pode ser mencao de terceiro, entao vem separado.
    --
    -- Com fronteira de palavra: sem ela, "Ana" casaria dentro de "Santana" e a
    -- lista viraria ruido. `regexp_replace` escapa o que for metacaractere no
    -- nome — nome de gente tem ponto e parenteses.
    if coalesce(btrim(p_nome), '') <> '' then
      begin
        execute format('select count(*) from %I where %I::text ~* %L',
                       r.table_name, r.column_name,
                       '(^|\W)' || regexp_replace(p_nome, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '($|\W)')
          into n;
        if n > 0 then
          onde := r.table_name || '.' || r.column_name;
          quantos := n; pelo_telefone := false; return next;
        end if;
      exception when others then null;
      end;
    end if;
  end loop;
end $$;

comment on function sureya_sobrou_da_remocao(uuid, text, text) is
  'O que sobrou depois de uma remocao a pedido (0140). So le.';

-- ---------------------------------------------------------------- 2
-- A REMOCAO
--
-- Muda o tipo de retorno (void -> setof), entao precisa cair antes. Nenhum
-- outro lugar a chama: so `api/clientes/[id]/lgpd`.
-- ----------------------------------------------------------------------------
drop function if exists public.sureya_anonimizar_cliente(uuid);

create function public.sureya_anonimizar_cliente(p_cliente uuid)
returns table (onde text, quantos int, pelo_telefone boolean)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org    uuid := current_org_id();
  v_nome   text;
  v_tel    text;
  v_fam    uuid;
  v_tels   text[];
  v_codigo text;
  v_novo   text;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;
  if v_org is null then raise exception 'sem_org'; end if;

  select c.nome, c.telefone, c.familia_id into v_nome, v_tel, v_fam
    from clientes c where c.id = p_cliente and c.org_id = v_org;
  if not found then
    raise exception 'cliente_nao_encontrado';
  end if;

  -- ------------------------------------------------------------------
  -- OS NUMEROS DELA, CAPTURADOS ANTES DE QUALQUER ESCRITA.
  --
  -- E o conserto do bug de ordem: a versao anterior procurava os leads por
  -- `(select telefone from clientes where id = p_cliente)` DEPOIS de ja ter
  -- embaralhado essa coluna. A subconsulta lia 'anon:...' e casava zero
  -- linhas — medido. Quem le o codigo nao ve, porque a linha esta la.
  --
  -- O segundo telefone entra junto: a pessoa pode ter dado dois numeros, e
  -- limpar so o principal deixaria o outro no banco.
  -- ------------------------------------------------------------------
  select coalesce(array_agg(t.telefone), '{}') into v_tels
    from telefones_cliente t where t.cliente_id = p_cliente;
  if coalesce(btrim(v_tel), '') <> '' then
    v_tels := v_tels || v_tel;
  end if;

  update clientes set
    nome = 'Cliente removido',
    telefone = 'anon:' || left(md5(random()::text), 12),
    perfil_ia = null,
    instrucoes_ia = null,
    observacoes = null,
    foto_url = null,
    ativo_ia = false,
    modo = 'copiloto',
    anonimizado_em = now()
  where id = p_cliente;

  update conversas set aberta = false where cliente_id = p_cliente and org_id = v_org;
  update mensagens set texto = '[removido a pedido]', midia_url = null
    where cliente_id = p_cliente and org_id = v_org;

  -- OS RASCUNHOS DA IA — tres deles no ensaio, chamando a pessoa pelo nome e
  -- com valores. Ficavam inteiros: a funcao limpava a mensagem e esquecia o
  -- rascunho que a originou.
  update interacoes_ia
     set rascunho = '[removido a pedido]', texto_final = null, motivo_retencao = null
   where cliente_id = p_cliente and org_id = v_org;

  -- OS LEADS, agora pelos numeros capturados — e tambem pelo vinculo direto,
  -- que existe e ninguem usava.
  --
  -- ACHADO NO SEGUNDO ENSAIO: limpar o lead e esquecer a COLUNA DO NUMERO
  -- deixava o telefone dela inteiro na tabela. `leads.telefone` e NOT NULL,
  -- entao ele leva o mesmo embaralhamento de `clientes.telefone` em vez de
  -- virar nulo — a linha continua existindo, sem dizer de quem era.
  --
  -- Isto so apareceu porque a funcao passou a se conferir sozinha. Lendo o
  -- codigo, "limpei os leads" parecia feito.
  update leads
     set nome_wa = null, nome = null, contexto = null,
         telefone = 'anon:' || left(md5(random()::text), 12),
         mensagens = '[]'::jsonb, status = 'descartado'
   where org_id = v_org
     and (telefone = any(v_tels) or cliente_id = p_cliente or cliente_novo_id = p_cliente);

  -- O LOG CRU DO WHATSAPP. Guarda o numero para responder "chegou?" — e o
  -- numero e justamente o que ela pediu para tirar. O evento continua
  -- existindo, sem dizer de quem era.
  update eventos_webhook set telefone = null
   where org_id = v_org and telefone = any(v_tels);

  delete from telefones_cliente where cliente_id = p_cliente;

  update fila_liberacao
     set texto = '[removido a pedido]', texto_final = null, fotos = '[]'::jsonb
   where cliente_id = p_cliente and org_id = v_org;

  -- A INDICACAO TEM DUAS PESSOAS, E SO UMA PEDIU PARA SAIR (0078).
  update indicacoes set indicador_id = null
   where org_id = v_org and indicador_id = p_cliente;

  update comprovantes set imagem_url = null where cliente_id = p_cliente and org_id = v_org;
  update servicos s set foto_antes_url = null, foto_depois_url = null, foto_inicio_url = null
    from tumulos t
   where t.id = s.tumulo_id and s.org_id = v_org and t.familia_id = v_fam;

  -- ------------------------------------------------------------------
  -- A FAMILIA QUE FOI BATIZADA COM O NOME DELA
  --
  -- O cadastro cria "Familia <primeiro nome>" e escreve "Criada
  -- automaticamente a partir do cadastro de <nome>". Os dois sao dado dela
  -- guardado em outra tabela, e ficavam intactos.
  --
  -- A familia NAO e apagada: ela e o contrato, e pode ter outras pessoas. O
  -- que sai e o nome. O novo rotulo mantem a familia ACHAVEL pelo codigo do
  -- jazigo — renomear para "Familia removida" deixaria a Sureya sem saber de
  -- quem e o jazigo que ela continua lavando.
  --
  -- Fronteira de palavra, para "Ana" nao casar dentro de "Santana".
  -- ------------------------------------------------------------------
  if v_fam is not null and coalesce(btrim(v_nome), '') <> '' then
    select t.codigo into v_codigo from tumulos t
     where t.familia_id = v_fam and coalesce(t.codigo, '') <> '' limit 1;

    v_novo := case when v_codigo is not null
                   then 'Família do jazigo ' || v_codigo
                   else 'Família (nome removido a pedido)' end;

    update familias f
       set nome = v_novo
     where f.id = v_fam and f.org_id = v_org
       and f.nome ~* ('(^|\W)' || regexp_replace(v_nome, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '($|\W)');

    -- Na observacao troca SO o nome: o resto do que estiver escrito ali pode
    -- ser sobre o jazigo ou sobre outra pessoa da familia, e apagar o campo
    -- inteiro removeria o dado de quem nao pediu nada.
    update familias f
       set observacoes = regexp_replace(
             f.observacoes,
             '(^|\W)' || regexp_replace(v_nome, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '($|\W)',
             '\1[removido]\2', 'gi')
     where f.id = v_fam and f.org_id = v_org and f.observacoes is not null;
  end if;

  -- ------------------------------------------------------------------
  -- E AGORA ELA SE PROVA.
  --
  -- Consertar a funcao resolve os seis casos de hoje. Devolver a varredura
  -- resolve o setimo — o que vai aparecer na tabela que alguem criar mes que
  -- vem e esquecer de incluir aqui. E o unico jeito de a remocao continuar
  -- completa depois que eu sair de perto.
  -- ------------------------------------------------------------------
  return query select * from sureya_sobrou_da_remocao(v_org, v_nome, v_tel);
end
$$;

-- ---------------------------------------------------------------- 3
-- QUEM PODE CHAMAR
--
-- SECURITY DEFINER ignora RLS, e o Supabase concede EXECUTE a `anon` POR
-- PADRAO em `public` (licao da 0129). Uma delas APAGA dado de familia; a outra
-- devolve onde o nome e o telefone de uma pessoa aparecem no banco inteiro.
-- ----------------------------------------------------------------------------
revoke execute on function public.sureya_anonimizar_cliente(uuid)            from public, anon;
revoke execute on function public.sureya_sobrou_da_remocao(uuid, text, text) from public, anon;
grant  execute on function public.sureya_anonimizar_cliente(uuid)            to authenticated;
grant  execute on function public.sureya_sobrou_da_remocao(uuid, text, text) to authenticated;
