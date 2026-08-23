-- 0114 — COMPETÊNCIA, VENCIMENTO E INADIMPLÊNCIA SÃO TRÊS COISAS
--
-- A PERGUNTA
--   "da Anninha não deveria lançar os períodos na competência e somente não
--    deixar ela inadimplente?"
--
--   Sim. E era uma falha do modelo, não um detalhe.
--
-- O QUE ESTAVA ERRADO
--   A Anninha paga em dezembro pelo semestre jul–dez (pós-pago). Hoje é agosto:
--   julho e agosto JÁ FORAM PRESTADOS. A receita deles é de julho e agosto —
--   mesmo que o dinheiro só venha em dezembro. E o razão dela estava VAZIO.
--
--   É a mesma distorção que a 0112 disse ter corrigido, invertida: em vez de
--   seis meses empilhados em dezembro, cinco meses SUMIDOS até lá. O Painel do
--   mês mostrava R$ 0 de receita dessa família em julho e agosto.
--
--   E a razão de eu não ter lançado antes: ela apareceria INADIMPLENTE. O
--   painel calcula "em aberto" pelo saldo, sem perguntar se aquilo já venceu.
--
-- AS TRÊS COISAS QUE ERAM DUAS
--   competência    o mês em que o serviço foi PRESTADO      → é a receita
--   vencimento     quando o dinheiro é DEVIDO               → é `conta_corrente.data`
--   inadimplência  vencido E não pago                       → nunca antes do vencimento
--
--   Enquanto vencimento fosse derivado da competência, "prestado" e "devido"
--   eram a mesma data — e um contrato pós-pago não cabe nisso.
--
-- O QUE MUDA
--   1. `data` passa a ser O VENCIMENTO, escrito pelo cobrador com o dia da casa
--   2. no PÓS-PAGO cada mês nasce quando é prestado, com vencimento lá na frente
--   3. inadimplência e aging só olham o que JÁ VENCEU, e contam do VENCIMENTO
--   4. a régua conta os degraus a partir de `data`, não de uma data derivada
--
--   No PRÉ-PAGO nada muda: quem paga adiantado deve o período inteiro na data
--   da cobrança, e as N linhas nascem juntas ali. A diferença entre os dois não
--   é de valor nem de ritmo — é de QUANDO a linha existe.

begin;

-- ---------------------------------------------------------------------------
-- 1. O COBRADOR
-- ---------------------------------------------------------------------------
create or replace function public.sureya_cobrar_competencias(
  p_ate date default null, p_org uuid default null, p_familia uuid default null)
returns table(lancados integer, valor_total numeric, tumulos_tocados integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid; v_ate date; v_mes_ate date; v_dia_venc int; r record;
  v_lanc int := 0; v_total numeric := 0; v_toc int := 0;
  v_meses int; v_comp date; v_andou boolean; v_entrou int;
  v_ini date; v_fim date; v_mes date; v_venc date; v_rotulo text; v_tocou boolean;
begin
  v_org := coalesce(p_org, current_org_id());
  if v_org is null then
    raise exception 'sem_organizacao' using
      errcode = '42501',
      hint = 'Sem sessao do painel: passe p_org (e o cron sempre passa).';
  end if;
  v_ate := coalesce(p_ate, current_date);
  v_mes_ate := date_trunc('month', v_ate)::date;

  select coalesce(dia_vencimento, 10) into v_dia_venc from orgs where id = v_org;

  for r in
    select t.id, t.familia_id, t.valor_mensal, t.proxima_cobranca, t.identificacao,
           t.meses_entre_cobrancas, t.cobranca_no_fim, f.freq_pagamento::text as freq
      from tumulos t
      join familias f on f.id = t.familia_id
     where t.org_id = v_org
       and t.contratado
       and t.familia_id is not null
       and coalesce(t.valor_mensal, 0) > 0
       and t.proxima_cobranca is not null
       and (p_familia is null or t.familia_id = p_familia)
       -- PÓS-PAGO ENTRA ANTES DE VENCER: os meses já prestados viram receita
       -- mesmo com a cobrança lá na frente. Pré-pago só quando a data chega.
       and (t.cobranca_no_fim
            or t.proxima_cobranca <= v_ate)
  loop
    v_meses := coalesce(r.meses_entre_cobrancas, sureya_meses_da_cobranca(r.freq));
    v_comp  := date_trunc('month', r.proxima_cobranca)::date;
    v_tocou := false;
    -- Zerado AQUI, e nao depois do update: um tumulo cujo periodo nao fechou
    -- herdaria o `true` do tumulo anterior e teria a proxima_cobranca
    -- reescrita com o valor que ela ja tinha.
    v_andou := false;

    loop
      -- O PERÍODO desta cobrança.
      --   pós-pago  termina na cobrança:  P-N+1 .. P
      --   pré-pago  começa na cobrança:   P     .. P+N-1
      v_ini := case when r.cobranca_no_fim
                    then (v_comp - ((v_meses - 1) || ' months')::interval)::date
                    else v_comp end;
      v_fim := (v_ini + ((v_meses - 1) || ' months')::interval)::date;

      -- Nada deste período começou ainda: para.
      exit when v_ini > v_mes_ate;

      -- O VENCIMENTO é a data da cobrança com o dia combinado da casa.
      -- Escrito, não derivado: é dele que a inadimplência e a régua contam.
      v_venc := (v_comp + (v_dia_venc - 1))::date;

      v_rotulo := case
        when v_meses = 1 then to_char(v_ini, 'MM/YYYY')
        else to_char(v_ini, 'MM/YYYY') || ' a ' || to_char(v_fim, 'MM/YYYY')
      end;

      v_mes := v_ini;
      while v_mes <= v_fim loop
        -- SÓ O QUE JÁ FOI PRESTADO, no pós-pago. No pré-pago o período inteiro
        -- é devido na data da cobrança, então sai junto.
        exit when r.cobranca_no_fim and v_mes > v_mes_ate;

        insert into conta_corrente
          (org_id, familia_id, cliente_id, tumulo_id, tipo, origem,
           competencia, valor, descricao, data, canal)
        select v_org, r.familia_id, f.responsavel_id, r.id, 'debito', 'competencia',
               v_mes, round(r.valor_mensal, 2),
               'Contrato · ' || to_char(v_mes, 'MM/YYYY')
                 || coalesce(' · ' || r.identificacao, '')
                 || case when v_meses > 1
                         then ' (parte de ' || v_rotulo || ', vence em '
                              || to_char(v_venc, 'DD/MM/YYYY') || ')'
                         else '' end,
               v_venc, 'automatico'
          from familias f where f.id = r.familia_id
        on conflict do nothing;

        get diagnostics v_entrou = row_count;
        if v_entrou > 0 then
          v_lanc := v_lanc + 1;
          v_total := v_total + round(r.valor_mensal, 2);
          v_tocou := true;
        end if;

        v_mes := (v_mes + interval '1 month')::date;
      end loop;

      -- A DATA SÓ ANDA QUANDO O PERÍODO FECHA. No pós-pago isso é a cobrança
      -- ter chegado; enquanto ela não chega, o período continua aberto
      -- recebendo os meses que forem sendo prestados.
      exit when v_comp > v_mes_ate;

      v_comp := (v_comp + (v_meses || ' months')::interval)::date;
      v_andou := true;
    end loop;

    if v_andou then
      update tumulos set proxima_cobranca = v_comp where id = r.id;
      v_andou := false;
    end if;
    if v_tocou then v_toc := v_toc + 1; end if;
  end loop;

  return query select v_lanc, v_total, v_toc;
end $$;

revoke all on function public.sureya_cobrar_competencias(date, uuid, uuid) from public, anon;
grant execute on function public.sureya_cobrar_competencias(date, uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. A RÉGUA CONTA DO VENCIMENTO ESCRITO
-- ---------------------------------------------------------------------------
-- Ela derivava `competencia + dia_vencimento`, que só valia enquanto os dois
-- fossem a mesma coisa. Num contrato pós-pago a competência de julho vence em
-- dezembro, e a régua cobraria em julho.
do $migra$
declare v_src text; v_novo text;
begin
  v_src := pg_get_functiondef('public.sureya_regua_do_dia(date,uuid)'::regprocedure);
  v_novo := replace(v_src,
    '(v_dia - (cc.competencia + (v_dia_venc - 1))) as dias_do_vencimento',
    '(v_dia - cc.data) as dias_do_vencimento');
  if v_novo = v_src then
    raise exception 'ALVO NAO ENCONTRADO na regua: a derivacao do vencimento';
  end if;
  execute v_novo;
end $migra$;

-- ---------------------------------------------------------------------------
-- 3. O SALDO DA FAMILIA SEPARA O QUE VENCEU DO QUE AINDA VAI VENCER
-- ---------------------------------------------------------------------------
-- `saldo_familia` (0049) somava tudo o que existe no razao. Enquanto todo
-- debito vencia no mes da competencia isso era a mesma coisa que "deve"; com
-- o pos-pago deixa de ser: a Anninha passa a ter seis meses lancados e zero
-- vencido, e a coluna `saldo` diria que ela deve.
--
-- `saldo` continua existindo e continua significando o mesmo (a posicao
-- inteira da familia, usada na ficha e no fechamento). Quem pergunta
-- "inadimplente?" passa a ler `vencido`.
create or replace view saldo_familia as
select
  familia_id,
  org_id,
  sum(case when tipo = 'debito' then valor else -valor end) as saldo,
  max(data) filter (where tipo = 'credito')                 as ultimo_pagamento,
  -- VENCIDO: o que ja era devido hoje, menos tudo o que ela pagou.
  sum(case when data <= current_date
           then case when tipo = 'debito' then valor else -valor end
           else 0 end)                                      as vencido,
  -- A VENCER: competencia ja prestada e lancada, com a data la na frente.
  sum(case when tipo = 'debito' and data > current_date then valor else 0 end)
                                                            as a_vencer
from conta_corrente
group by familia_id, org_id;

alter view saldo_familia set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- 4. O PAINEL SO CHAMA DE INADIMPLENTE O QUE JA VENCEU
-- ---------------------------------------------------------------------------
-- Duas mudancas dentro da mesma funcao:
--   . `em aberto` e o aging passam a olhar `data` (o vencimento) e nao a
--     existencia do lancamento;
--   . o aging conta a idade a partir do VENCIMENTO mais antigo em aberto, e
--     nao da competencia mais antiga. Um contrato pos-pago tem competencia de
--     julho vencendo em dezembro: pela competencia ele nasceria com 150 dias
--     de atraso no dia em que fosse lancado.
--
-- E aparece um numero que nao existia: `a_vencer`. E a receita ja reconhecida
-- que ainda vai entrar. Sem ele, tirar a Anninha da inadimplencia a faria
-- sumir do painel inteiro — e ela nao sumiu, ela so nao esta atrasada.
create or replace function public.sureya_painel_do_mes(
  p_mes date default null, p_org uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
  v_ini date; v_fim date;
  v_out jsonb;
begin
  v_org := coalesce(p_org, current_org_id());
  if v_org is null then
    raise exception 'sem_organizacao' using errcode = '42501';
  end if;

  v_ini := date_trunc('month', coalesce(p_mes, current_date))::date;
  v_fim := (v_ini + interval '1 month' - interval '1 day')::date;

  with
  -- ------------------------------------------------------------------
  -- RECEITA DA COMPETÊNCIA — o que o mês gerou de direito
  -- Por COMPETÊNCIA, não por data de lançamento nem por vencimento: é a
  -- diferença entre "o mês rendeu" e "o mês recebeu". A competência de julho
  -- da Anninha é receita de julho, mesmo vencendo em dezembro.
  -- ------------------------------------------------------------------
  receita as (
    select
      coalesce(sum(valor) filter (where origem = 'competencia' and tipo = 'debito'), 0) as contratos,
      coalesce(sum(valor) filter (where origem = 'avulso'      and tipo = 'debito'), 0) as avulsos,
      coalesce(sum(valor) filter (where origem = 'abertura'    and tipo = 'debito'), 0) as abertura,
      count(*) filter (where origem = 'competencia' and tipo = 'debito') as cobrancas
    from conta_corrente
    where org_id = v_org and competencia = v_ini and status_conc = 'confirmado'
  ),
  -- RECEBIDO — por DATA de pagamento, porque dinheiro entra no dia em que entra.
  recebido as (
    select coalesce(sum(valor), 0) as total, count(*) as pagamentos
    from conta_corrente
    where org_id = v_org and tipo = 'credito' and origem = 'pagamento'
      and data between v_ini and v_fim and status_conc = 'confirmado'
  ),
  -- ------------------------------------------------------------------
  -- POSIÇÃO POR FAMÍLIA — vencido de um lado, a vencer do outro
  -- `data` é o VENCIMENTO desde a 0114. Acumulado até o fim do mês, não só
  -- do mês: quem deve, deve o histórico.
  -- ------------------------------------------------------------------
  saldos as (
    select familia_id,
           sum(case when data <= v_fim
                    then case when tipo = 'debito' then valor else -valor end
                    else 0 end) as vencido,
           sum(case when tipo = 'debito' and data > v_fim then valor else 0 end) as a_vencer
      from conta_corrente
     where org_id = v_org and status_conc = 'confirmado'
     group by familia_id
  ),
  futuro as (
    select coalesce(sum(a_vencer), 0) as a_vencer,
           count(*) filter (where a_vencer > 0.009) as familias
      from saldos
  ),
  devedores as (
    select s.familia_id, s.vencido as saldo, f.nome,
           -- A IDADE DA DÍVIDA é a do VENCIMENTO em aberto mais antigo. Uma
           -- família que devia desde março e pagou parte em agosto continua
           -- com dívida de março.
           greatest(0, (v_fim - coalesce(
             (select min(cc.data) from conta_corrente cc
               where cc.familia_id = s.familia_id and cc.org_id = v_org
                 and cc.tipo = 'debito' and cc.status_conc = 'confirmado'
                 and cc.data <= v_fim),
             v_fim))) as dias
      from saldos s join familias f on f.id = s.familia_id
     where s.vencido > 0.009
  ),
  aging as (
    select
      coalesce(sum(saldo) filter (where dias <= 30), 0)               as ate_30,
      coalesce(sum(saldo) filter (where dias > 30 and dias <= 60), 0) as d31_60,
      coalesce(sum(saldo) filter (where dias > 60 and dias <= 90), 0) as d61_90,
      coalesce(sum(saldo) filter (where dias > 90), 0)                as acima_90,
      coalesce(sum(saldo), 0) as em_aberto,
      count(*) as familias
    from devedores
  ),
  -- ------------------------------------------------------------------
  -- OPERAÇÃO — as limpezas, e DE ONDE veio cada registro
  -- `iniciado_em` só é preenchido pelo botão "Começar" do campo: é a única
  -- prova de que alguém esteve no jazigo. O resto foi anotado depois.
  -- ------------------------------------------------------------------
  lavagens as (
    select
      count(*) filter (where status = 'executado' and estornado_em is null) as executadas,
      count(*) filter (where status = 'executado' and estornado_em is null
                         and iniciado_em is not null) as pelo_campo,
      count(*) filter (where status = 'executado' and estornado_em is null
                         and iniciado_em is null) as anotadas,
      count(*) filter (where estornado_em is not null) as estornadas,
      count(*) filter (where status in ('pendente','agendado')) as em_aberto
    from servicos
    where org_id = v_org
      and coalesce(data_executada::date, data_prevista) between v_ini and v_fim
  ),
  -- COBRANÇA SEM LAVAGEM — o risco que a 0104 criou.
  -- Túmulo que teve competência lançada no mês e nenhuma limpeza executada.
  sem_entrega as (
    select count(*) as tumulos, coalesce(sum(cc.valor), 0) as valor
      from conta_corrente cc
     where cc.org_id = v_org and cc.origem = 'competencia'
       and cc.competencia = v_ini and cc.tipo = 'debito'
       and cc.tumulo_id is not null
       and not exists (
         select 1 from servicos s
          where s.tumulo_id = cc.tumulo_id and s.status = 'executado'
            and s.estornado_em is null
            and s.data_executada::date between v_ini and v_fim)
  ),
  -- ------------------------------------------------------------------
  -- CUSTOS — de `lancamentos`, que hoje está VAZIO
  -- As categorias existem desde sempre; ninguém lançou uma despesa.
  -- ------------------------------------------------------------------
  custos as (
    select
      coalesce(sum(l.valor) filter (where c.nome ilike '%ajudante%'
                                       or c.nome ilike '%equipe%'), 0) as mao_de_obra,
      coalesce(sum(l.valor) filter (where c.nome ilike '%material%'), 0) as materiais,
      coalesce(sum(l.valor) filter (where c.nome not ilike '%ajudante%'
                                     and c.nome not ilike '%equipe%'
                                     and c.nome not ilike '%material%'), 0) as outros,
      coalesce(sum(l.valor), 0) as total,
      count(*) as lancamentos
    from lancamentos l
    left join categorias_financeiras c on c.id = l.categoria_id
    where l.org_id = v_org and l.tipo = 'saida' and l.data between v_ini and v_fim
  ),
  -- ------------------------------------------------------------------
  -- CARTEIRA — contratos e jazigos, quantidade e valor
  -- `mensal_contratado` é o que a casa fatura por mês se ninguém sair.
  -- ------------------------------------------------------------------
  carteira as (
    select
      count(*) as jazigos,
      count(*) filter (where contratado) as contratados,
      count(*) filter (where contratado and coalesce(valor_mensal,0) > 0) as com_valor,
      count(*) filter (where contratado and coalesce(valor_mensal,0) > 0
                         and proxima_cobranca is not null) as prontos,
      count(*) filter (where familia_id is null) as sem_familia,
      coalesce(sum(valor_mensal) filter (where contratado), 0) as mensal_contratado,
      coalesce(avg(valor_mensal) filter (where contratado and coalesce(valor_mensal,0) > 0), 0) as ticket
    from tumulos where org_id = v_org
  ),
  familias_n as (
    select count(*) as total,
           count(*) filter (where contratado) as contratadas
      from familias where org_id = v_org
  )
  select jsonb_build_object(
    'mes', to_char(v_ini, 'YYYY-MM'),
    'receita', jsonb_build_object(
      'contratos', r.contratos, 'avulsos', r.avulsos, 'abertura', r.abertura,
      'total', r.contratos + r.avulsos + r.abertura, 'cobrancas', r.cobrancas),
    'recebido', jsonb_build_object('total', rc.total, 'pagamentos', rc.pagamentos),
    'inadimplencia', jsonb_build_object(
      'em_aberto', a.em_aberto, 'familias', a.familias,
      'ate_30', a.ate_30, 'd31_60', a.d31_60, 'd61_90', a.d61_90, 'acima_90', a.acima_90),
    -- A VENCER não é inadimplência e não é receita do mês: é o que já foi
    -- prestado e reconhecido e ainda não chegou a hora de cobrar.
    'a_vencer', jsonb_build_object('valor', fu.a_vencer, 'familias', fu.familias),
    'devedores', coalesce((
      select jsonb_agg(jsonb_build_object('familia_id', d.familia_id, 'nome', d.nome,
                                          'saldo', d.saldo, 'dias', d.dias)
                       order by d.saldo desc)
        from (select * from devedores order by saldo desc limit 30) d), '[]'::jsonb),
    'lavagens', jsonb_build_object(
      'executadas', lv.executadas, 'pelo_campo', lv.pelo_campo,
      'anotadas', lv.anotadas, 'estornadas', lv.estornadas, 'em_aberto', lv.em_aberto),
    'sem_entrega', jsonb_build_object('tumulos', se.tumulos, 'valor', se.valor),
    'custos', jsonb_build_object(
      'mao_de_obra', cu.mao_de_obra, 'materiais', cu.materiais,
      'outros', cu.outros, 'total', cu.total, 'lancamentos', cu.lancamentos),
    'carteira', jsonb_build_object(
      'jazigos', ca.jazigos, 'contratados', ca.contratados, 'com_valor', ca.com_valor,
      'prontos', ca.prontos, 'sem_familia', ca.sem_familia,
      'mensal_contratado', ca.mensal_contratado, 'ticket', round(ca.ticket, 2),
      'familias', fn.total, 'familias_contratadas', fn.contratadas),
    'resultado', jsonb_build_object(
      'receita', r.contratos + r.avulsos + r.abertura,
      'custos', cu.total,
      'margem', (r.contratos + r.avulsos + r.abertura) - cu.total)
  ) into v_out
  from receita r, recebido rc, aging a, futuro fu, lavagens lv, sem_entrega se,
       custos cu, carteira ca, familias_n fn;

  return v_out;
end $$;

revoke all on function public.sureya_painel_do_mes(date, uuid) from public, anon;
grant execute on function public.sureya_painel_do_mes(date, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. AS LINHAS QUE JA EXISTEM PASSAM A DIZER O VENCIMENTO
-- ---------------------------------------------------------------------------
-- Sem isto a mudanca de leitura mentiria sobre o passado: a regua e o painel
-- passariam a ler como VENCIMENTO uma data que foi gravada como LANCAMENTO,
-- e toda cobranca ja lancada envelheceria nove dias de uma vez.
--
-- O cobrador antigo gravava em `data` o primeiro dia do mes da COBRANCA (o
-- mesmo para as N linhas do periodo). O vencimento daquelas linhas e esse dia
-- com o dia combinado da casa — exatamente o que a regua derivava ate aqui
-- para a primeira competencia do periodo.
--
-- Repare no que isso conserta de quebra: as doze linhas da Virginia foram
-- pagas em JANEIRO. A regua velha, derivando o vencimento de cada competencia,
-- cobraria dela em setembro por um ano ja quitado. Agora as doze vencem em
-- 10/01/2026, ela pagou, e ninguem a procura.
--
-- So mexe em `origem = 'competencia'`, so em debito, e so onde `data` e o
-- primeiro do mes (a assinatura do cobrador). Lancamento manual do painel
-- fica como esta.
do $backfill$
declare v_n int;
begin
  update conta_corrente cc
     set data = (cc.data + (coalesce(o.dia_vencimento, 10) - 1))::date
    from orgs o
   where o.id = cc.org_id
     and cc.origem = 'competencia'
     and cc.tipo = 'debito'
     and cc.data = date_trunc('month', cc.data)::date
     and coalesce(o.dia_vencimento, 10) > 1;

  get diagnostics v_n = row_count;
  raise notice 'vencimento escrito em % lancamentos de competencia', v_n;
end $backfill$;

commit;
