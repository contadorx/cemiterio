-- 0105 — O PAINEL DO MÊS
--
-- O PEDIDO
--   "vamos desenhar um painel financeiro e operacional. Com receita mes
--    competência, valores recebidos, valores em aberto, famílias inadimplentes,
--    aging de inadimplência, lavagens realizadas (real, campo e registradas),
--    custos de mão de obra, materiais... e veja o que mais dá para fazer como
--    contratos/jazigos quantidade e valor entre outros."
--
-- UMA FUNÇÃO, NÃO SEIS CONSULTAS NA TELA
--   Todo número do painel sai daqui. A alternativa — cada cartão com a sua
--   consulta no TypeScript — é como a agenda ficou quebrada por meses: o
--   contador e o movedor usavam definições diferentes de "fora do lugar", e o
--   aviso nunca zerava (0092). Um painel em que "em aberto" e "inadimplente"
--   discordam por meio real é pior que nenhum painel: ele ensina a não confiar.
--
-- O QUE SE MEDIU ANTES DE DESENHAR (produção, 23/08)
--   Vale registrar porque metade dos cartões vai nascer VAZIA, e vazio precisa
--   dizer por quê:
--
--     lancamentos            0     ← custos de mão de obra e material
--     categorias_financeiras 11    ← "Materiais", "Pagamento da ajudante"…
--     conta_equipe           0
--     compras_material       0
--     remuneracao_regras     0
--     servicos executados    5     (1 pelo campo)
--     tumulos              270     (5 contratados, 2 com valor)
--     competencias lançadas  0     (as duas primeiras vencem em 01/09)
--
--   A estrutura de custo existe inteira e NUNCA foi usada. O painel não pode
--   mostrar "R$ 0,00 de material" como se fosse medição — é ausência de
--   registro, e a tela tem de dizer isso com o caminho para resolver.
--
-- O RISCO INVERTEU NA 0104
--   Enquanto a limpeza gerava a cobrança, o risco era *lavagem sem cobrança* —
--   serviço entregue e não faturado. Agora que o contrato cobra sozinho, o
--   risco virou o contrário e é mais grave: **cobrança sem lavagem**. A casa
--   debita o mês e pode não ter ido ao jazigo. Isso não existia antes e não
--   tem quem avise — por isso é um número de primeira linha aqui.

begin;

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
  -- Por COMPETÊNCIA, não por data de lançamento: é a diferença entre
  -- "o mês rendeu" e "o dia em que alguém apertou o botão".
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
  -- RECEBIDO — por DATA, porque dinheiro entra no dia em que entra.
  recebido as (
    select coalesce(sum(valor), 0) as total, count(*) as pagamentos
    from conta_corrente
    where org_id = v_org and tipo = 'credito' and origem = 'pagamento'
      and data between v_ini and v_fim and status_conc = 'confirmado'
  ),
  -- ------------------------------------------------------------------
  -- SALDO POR FAMÍLIA — a base de "em aberto" e de toda a inadimplência
  -- Acumulado até o fim do mês, não só do mês: quem deve, deve o histórico.
  -- ------------------------------------------------------------------
  saldos as (
    select familia_id,
           sum(case when tipo = 'debito' then valor else -valor end) as saldo,
           min(competencia) filter (where tipo = 'debito') as primeira_competencia
      from conta_corrente
     where org_id = v_org and status_conc = 'confirmado' and data <= v_fim
     group by familia_id
  ),
  devedores as (
    select s.familia_id, s.saldo, s.primeira_competencia, f.nome,
           -- A IDADE DA DÍVIDA é a da competência em aberto mais ANTIGA, e
           -- não a do último lançamento. Uma família que deve desde março e
           -- pagou parte em agosto continua com dívida de março.
           greatest(0, (v_fim - coalesce(
             (select min(cc.competencia) from conta_corrente cc
               where cc.familia_id = s.familia_id and cc.org_id = v_org
                 and cc.tipo = 'debito' and cc.status_conc = 'confirmado'),
             v_fim))) as dias
      from saldos s join familias f on f.id = s.familia_id
     where s.saldo > 0.009
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
  -- `mensal_contratado` é o que a casa fatura por mês se ninguém sair: o
  -- número que diz se o negócio cresce, e que nenhuma tela mostrava.
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
  from receita r, recebido rc, aging a, lavagens lv, sem_entrega se,
       custos cu, carteira ca, familias_n fn;

  return v_out;
end $$;

revoke all on function public.sureya_painel_do_mes(date, uuid) from public, anon;
grant execute on function public.sureya_painel_do_mes(date, uuid) to authenticated, service_role;

commit;
