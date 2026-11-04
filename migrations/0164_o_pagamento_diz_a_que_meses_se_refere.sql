-- ===========================================================================
-- 0164 — O PAGAMENTO DIZ A QUE MESES SE REFERE
--
-- MEDIDO no extrato real de outubro/2026: 248 PIX, R$ 19.805,00 recebidos. O
-- sistema cobrou R$ 3.400 no mes e registrou R$ 0 — porque identificar uma
-- entrada do banco jogava o valor inteiro como credito solto e deixava a
-- quitacao por conta do FIFO, sem ninguem dizer a que se referia.
--
-- E muita gente pagou o ANUAL. Um Pix de R$ 480 nao e "um credito de R$ 480":
-- sao doze competencias. Quem olha a ficha depois precisa ver os doze meses
-- quitados, nao um numero grande sem endereco.
--
-- O QUE MUDA
--
-- 1. `sureya_debitos_em_aberto` passa a devolver a COMPETENCIA de cada debito.
--    A coluna entra no fim: quem le por nome nao quebra, e a tela finalmente
--    consegue agrupar o que deve por mes em vez de por lancamento.
--
-- 2. Nasce `sureya_identificar_entrada_meses`, que recebe QUAIS debitos este
--    dinheiro paga, pode apontar um SERVICO (a acao de flores, um avulso), e
--    tem `p_ensaio`: calcula a distribuicao e devolve sem escrever nada.
--
-- 3. `sureya_identificar_entrada` — a porta antiga, de dois argumentos —
--    passa a DELEGAR para ela. Duas implementacoes da mesma regra e o defeito
--    de forma que ja nos custou nove migrations (0092, 0105, 0106, 0115, 0137,
--    0140, 0141, 0142, 0148); aqui a regra de quitar tem um lugar so.
--
-- O ENSAIO EXISTE PORQUE A ORDEM E "VOCE SUGERE, EU CONFIRMO, SEMPRE". A tela
-- mostra os doze meses que o valor cobre ANTES de gravar, e quem decide e
-- gente.
--
-- NADA AQUI ENVIA NADA, e nenhum dado foi tocado.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. A COMPETENCIA ENTRA NA LISTA DO QUE SE DEVE
--
-- Corpo identico ao da 0073, com `l.competencia` acrescentado NO FIM. Trocar a
-- ordem das colunas quebraria em silencio quem le por posicao.
-- ---------------------------------------------------------------------------
-- E `p_org` ENTRA, porque sem ele esta funcao MENTE fora de sessao.
--
-- `current_org_id()` e nulo quando nao ha sessao do painel (licao da 0103), e
-- o `where` com org nula nao da erro: devolve ZERO debitos. Quem chamasse
-- daqui — a conciliacao, com p_org na mao — veria a familia sem nada em
-- aberto e jogaria o Pix inteiro como adiantamento. Errado, e calado.
drop function if exists public.sureya_debitos_em_aberto(uuid);
drop function if exists public.sureya_debitos_em_aberto(uuid, uuid);
create or replace function public.sureya_debitos_em_aberto(
  p_cliente uuid, p_org uuid default null
)
returns table(lancamento_id uuid, servico_id uuid, descricao text, data date,
              valor numeric, ja_quitado numeric, em_aberto numeric,
              jazigo text, data_lavagem date, competencia date)
language sql
security definer
set search_path to 'public'
as $function$
  select l.id, l.servico_id, l.descricao, l.data, l.valor,
         coalesce((select sum(q.valor) from quitacoes q where q.debito_id = l.id), 0),
         l.valor - coalesce((select sum(q.valor) from quitacoes q where q.debito_id = l.id), 0),
         coalesce(t.identificacao, '—'),
         s.data_executada::date,
         l.competencia
    from conta_corrente l
    left join servicos s on s.id = l.servico_id
    left join tumulos  t on t.id = s.tumulo_id
   where l.org_id = coalesce(p_org, current_org_id())
     and (auth.uid() is null or is_admin())      -- guarda (migration 0060)
     and l.familia_id = (select c.familia_id from clientes c where c.id = p_cliente)
     and l.tipo = 'debito'
     and l.status_conc = 'confirmado'
     -- Abertura NAO entra no funil de quitacao: ela e um saldo consolidado, nao
     -- um debito individual a ser casado com um pagamento.
     and l.origem <> 'abertura'::sureya_origem_lancamento
     and l.valor > coalesce((select sum(q.valor) from quitacoes q where q.debito_id = l.id), 0)
   order by l.competencia nulls last, l.data, l.created_at;
$function$;

comment on function public.sureya_debitos_em_aberto(uuid, uuid) is
  'O que a familia desta pessoa ainda deve, debito por debito, com a competencia (0164).';

revoke execute on function public.sureya_debitos_em_aberto(uuid, uuid) from public, anon;
grant  execute on function public.sureya_debitos_em_aberto(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. IDENTIFICAR DIZENDO A QUE MESES O DINHEIRO SE REFERE
--
-- `p_debitos` nulo = o comportamento de sempre: paga o mais antigo primeiro
-- ate o dinheiro acabar. Uma lista = paga exatamente aqueles, na ordem da
-- competencia — e o caso do anual.
--
-- `p_ensaio` NAO ESCREVE NADA e devolve a mesma distribuicao que gravaria.
-- Nao e uma segunda conta parecida: e o MESMO laco, com a escrita desligada.
-- Uma previa calculada por outro caminho mentiria exatamente no dia em que os
-- dois divergissem.
-- ---------------------------------------------------------------------------
create or replace function public.sureya_identificar_entrada_meses(
  p_entrada  uuid,
  p_cliente  uuid,
  p_debitos  uuid[]  default null,
  p_servico  uuid    default null,
  p_ensaio   boolean default false,
  p_org      uuid    default null
)
returns table (
  debito_id   uuid,      -- nulo na linha da sobra
  descricao   text,
  competencia date,
  jazigo      text,
  valor       numeric,   -- quanto DESTE pagamento vai para este debito
  quitou      boolean    -- fecha o debito, ou so abate parte dele
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_org    uuid;
  v_e      record;
  v_lanc   uuid;
  v_resta  numeric;
  v_parte  numeric;
  v_comp   date;
  v_texto  text;
  v_fam    uuid;
  d        record;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  -- p_org explicito: `current_org_id()` e nulo fora de sessao (licao da 0103).
  v_org := coalesce(p_org, current_org_id());
  if v_org is null then
    raise exception 'sem_org' using hint = 'Sem sessao do painel: passe p_org.';
  end if;

  select * into v_e from entradas_banco e where e.id = p_entrada and e.org_id = v_org;
  if v_e is null then raise exception 'entrada_nao_encontrada'; end if;

  -- JA IDENTIFICADA NAO SE IDENTIFICA DE NOVO. Sem esta trava, confirmar duas
  -- vezes criaria dois creditos para o mesmo Pix e a familia apareceria
  -- adiantada sem ter pago nada a mais.
  if v_e.lancamento_id is not null then
    raise exception 'entrada_ja_identificada' using
      hint = 'Esta entrada ja virou credito. Desfaca antes de refazer.';
  end if;

  -- O CLIENTE TEM DE SER DESTA ORG: SECURITY DEFINER ignora RLS, e so o
  -- GRANT protege a porta (licao da 0129). A conferencia do dono fica aqui.
  select c.familia_id into v_fam from clientes c
   where c.id = p_cliente and c.org_id = v_org;
  if not found then raise exception 'cliente_de_outra_org'; end if;

  -- O SERVICO APONTADO TEM DE SER DESTA FAMILIA. A acao de flores de outubro e
  -- de uma familia especifica; deixar passar o id de outra gravaria o dinheiro
  -- de uma apontando para o servico da outra, e nenhuma tela mostraria isso.
  if p_servico is not null then
    if not exists (
      select 1 from servicos s
       left join tumulos t on t.id = s.tumulo_id
       where s.id = p_servico and s.org_id = v_org
         and (t.familia_id is null or t.familia_id = v_fam)
    ) then
      raise exception 'servico_de_outra_familia' using
        hint = 'Este servico nao e desta familia.';
    end if;
  end if;

  v_resta := v_e.valor;

  -- A COMPETENCIA DO CREDITO E A MAIS ANTIGA QUE ELE PAGA. Um Pix do anual
  -- entra datado em novembro e paga de novembro a outubro; carimbar o credito
  -- com o mes do extrato faria o relatorio de competencia mentir.
  select min(x.competencia) into v_comp
    from sureya_debitos_em_aberto(p_cliente, v_org) x
   where (p_debitos is null or x.lancamento_id = any(p_debitos));

  if not p_ensaio then
    v_texto := 'Pix recebido' || coalesce(' de ' || v_e.remetente, '');
    v_lanc := sureya_lancar(
      p_cliente := p_cliente, p_tipo := 'credito', p_valor := v_e.valor,
      p_origem := 'pagamento', p_descricao := v_texto, p_data := v_e.data,
      p_status := 'confirmado', p_servico := p_servico,
      p_competencia := v_comp, p_org := v_org);

    update entradas_banco set
      cliente_id = p_cliente, lancamento_id = v_lanc,
      identificada_em = clock_timestamp(), identificada_por = auth.uid()
    where id = p_entrada;

    -- Pagou: a regua de cobranca volta ao comeco.
    update clientes set cobranca_nivel = 0, cobranca_em = null where id = p_cliente;
  end if;

  -- O MESMO LACO, com a escrita desligada no ensaio.
  for d in
    select * from sureya_debitos_em_aberto(p_cliente, v_org) x
     where p_debitos is null or x.lancamento_id = any(p_debitos)
     order by x.competencia nulls last, x.data
  loop
    exit when v_resta <= 0.004;
    v_parte := least(v_resta, d.em_aberto);

    if not p_ensaio then
      insert into quitacoes (org_id, credito_id, debito_id, valor)
      values (v_org, v_lanc, d.lancamento_id, v_parte)
      on conflict do nothing;
    end if;

    debito_id   := d.lancamento_id;
    descricao   := d.descricao;
    competencia := d.competencia;
    jazigo      := d.jazigo;
    valor       := round(v_parte, 2);
    quitou      := v_parte >= d.em_aberto - 0.004;
    return next;

    v_resta := round(v_resta - v_parte, 2);
  end loop;

  -- SOBRA E ADIANTAMENTO, E TEM DE APARECER. R$ 480 numa familia que devia
  -- R$ 440 deixa R$ 40 a favor dela; esconder isso faria a conta nao fechar na
  -- tela e a pessoa procurar o erro onde nao tem.
  if v_resta > 0.004 then
    debito_id   := null;
    descricao   := 'Adiantamento — sobra deste pagamento';
    competencia := null;
    jazigo      := '—';
    valor       := round(v_resta, 2);
    quitou      := false;
    return next;
  end if;

  return;
end $function$;

comment on function public.sureya_identificar_entrada_meses(uuid, uuid, uuid[], uuid, boolean, uuid) is
  'Diz de quem e uma entrada do banco e a QUE MESES ela se refere (0164). p_ensaio calcula sem escrever.';

-- ---------------------------------------------------------------------------
-- 3. A PORTA ANTIGA DELEGA
--
-- `sureya_identificar_entrada(p_entrada, p_cliente)` continua existindo com a
-- mesma assinatura e o mesmo retorno — a rota `api/financeiro/entradas` chama
-- ela no PUT. O que muda e que ela nao tem mais regra propria: pede o mesmo
-- trabalho a funcao de cima, sem lista de debitos, que e o "paga o mais antigo
-- primeiro" de sempre.
-- ---------------------------------------------------------------------------
create or replace function public.sureya_identificar_entrada(p_entrada uuid, p_cliente uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid; v_lanc uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;

  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;

  -- IDEMPOTENTE COMO ANTES: chamada duas vezes, devolve o credito de antes em
  -- vez de estourar. Era este o comportamento da 0073 e a tela conta com ele.
  select e.lancamento_id into v_lanc from entradas_banco e
   where e.id = p_entrada and e.org_id = v_org;
  if v_lanc is not null then return v_lanc; end if;

  perform * from sureya_identificar_entrada_meses(
    p_entrada := p_entrada, p_cliente := p_cliente,
    p_debitos := null, p_servico := null, p_ensaio := false, p_org := v_org);

  select e.lancamento_id into v_lanc from entradas_banco e
   where e.id = p_entrada and e.org_id = v_org;
  return v_lanc;
end $function$;

comment on function public.sureya_identificar_entrada(uuid, uuid) is
  'Diz de quem e uma entrada do banco. Delega para sureya_identificar_entrada_meses (0164).';

-- ---------------------------------------------------------------------------
-- A PORTA. SECURITY DEFINER ignora RLS; so o GRANT protege (licao da 0129).
-- ---------------------------------------------------------------------------
revoke execute on function public.sureya_identificar_entrada_meses(uuid, uuid, uuid[], uuid, boolean, uuid) from public, anon;
grant  execute on function public.sureya_identificar_entrada_meses(uuid, uuid, uuid[], uuid, boolean, uuid) to authenticated, service_role;
revoke execute on function public.sureya_identificar_entrada(uuid, uuid) from public, anon;
grant  execute on function public.sureya_identificar_entrada(uuid, uuid) to authenticated, service_role;

select 'sureya_identificar_entrada_meses pronta' as feito;
