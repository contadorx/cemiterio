-- 0120 — O PAINEL DA OPERAÇÃO, E OS NÚMEROS QUE ABREM
--
-- O PEDIDO
--   "revise todo o painel e audite se os números são os mais adequados para o
--    negócio e se são acionáveis, abrem relatórios de gestão. Preciso de
--    operacionais com números de lavagens, disparos de mensagem, mensagens
--    enviadas sugeridas por ia etc… Tem que ser a gestão do negócio, serviços
--    extras de flores"
--
-- O QUE A AUDITORIA MEDIU (agosto/2026, produção)
--
--   jazigos contratados                 78
--   jazigos ATENDIDOS no mês             2      ← 3% de cobertura
--   lavagens executadas                  5
--   sem foto                             4 de 5 ← a prova do serviço
--
--   sugestões da IA                    159
--   descartadas                        157      ← 1,3% de aproveitamento
--   custo                          R$ 3,92 / 138 mil tokens
--
--   mensagens que saíram                12
--   saíram pela FILA DE LIBERAÇÃO        0      ← a fila nunca foi usada
--   conversas sem resposta             147 de 159
--
-- O QUE ESTAVA ERRADO NO PAINEL
--
--   1. "Lavagens executadas: 5" SEM DENOMINADOR. Cinco de quantas? O número
--      que dirige o negócio é 2 de 78 jazigos atendidos — e ele não existia.
--
--   2. A FOTO NÃO ERA CONTADA. O painel separava "pelo campo" de "anotadas",
--      que é sobre quem registrou. Não dizia quantas têm a prova que a família
--      recebe. Quatro de cinco não tinham.
--
--   3. MENSAGEM E IA NÃO EXISTIAM NO PAINEL. A casa gastou R$ 3,92 e 159
--      sugestões para aproveitar duas, e não havia onde ver isso.
--
--   4. NADA ABRIA. "Cobrada e não entregue: 2 jazigos" não levava aos dois.
--      Número que não abre não é gestão, é placar.
--
--   5. A MARGEM MENTIA. `lancamentos` tem ZERO linhas desde sempre, então
--      "custos" é R$ 0,00 e "margem = receita − 0" devolvia a receita inteira
--      com cara de lucro. Ausência de registro apresentada como medição é
--      pior do que não mostrar nada — e esta é a única correção deste arquivo
--      que MUDA um número que já estava na tela.

begin;

-- ---------------------------------------------------------------------------
-- 1. O PAINEL GANHA OPERAÇÃO, MENSAGENS, IA E FLORES
-- ---------------------------------------------------------------------------
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
  receita as (
    select
      coalesce(sum(valor) filter (where origem = 'competencia' and tipo = 'debito'), 0) as contratos,
      coalesce(sum(valor) filter (where origem = 'avulso'      and tipo = 'debito'), 0) as avulsos,
      coalesce(sum(valor) filter (where origem = 'abertura'    and tipo = 'debito'), 0) as abertura,
      count(*) filter (where origem = 'competencia' and tipo = 'debito') as cobrancas
    from conta_corrente
    where org_id = v_org and competencia = v_ini and status_conc = 'confirmado'
  ),
  recebido as (
    select coalesce(sum(valor), 0) as total, count(*) as pagamentos
    from conta_corrente
    where org_id = v_org and tipo = 'credito' and origem = 'pagamento'
      and data between v_ini and v_fim and status_conc = 'confirmado'
  ),
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
  -- OPERAÇÃO — agora COM DENOMINADOR e COM A PROVA
  -- ------------------------------------------------------------------
  -- `iniciado_em` só é preenchido pelo botão "Começar" do campo: é a única
  -- prova de que alguém esteve no jazigo. `foto_depois_url` é a prova que a
  -- FAMÍLIA recebe — e são coisas diferentes, por isso as duas são contadas.
  lavagens as (
    select
      count(*) filter (where status = 'executado' and estornado_em is null) as executadas,
      count(*) filter (where status = 'executado' and estornado_em is null
                         and iniciado_em is not null) as pelo_campo,
      count(*) filter (where status = 'executado' and estornado_em is null
                         and iniciado_em is null) as anotadas,
      count(*) filter (where status = 'executado' and estornado_em is null
                         and foto_depois_url is not null) as com_foto,
      count(*) filter (where status = 'executado' and estornado_em is null
                         and foto_depois_url is null) as sem_foto,
      count(*) filter (where estornado_em is not null) as estornadas,
      count(*) filter (where status in ('pendente','agendado')) as em_aberto,
      count(distinct tumulo_id) filter (where status = 'executado'
                                          and estornado_em is null) as jazigos_atendidos
    from servicos
    where org_id = v_org
      and coalesce(data_executada::date, data_prevista) between v_ini and v_fim
  ),
  carteira_op as (
    select count(*) filter (where contratado) as contratados,
           count(*) filter (where contratado
                              and not sureya_tumulo_parado(id, v_fim)) as em_servico,
           count(*) filter (where contratado
                              and sureya_tumulo_parado(id, v_fim)) as parados
      from tumulos where org_id = v_org
  ),
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
  -- MENSAGENS — o que saiu, por onde, e o que a família respondeu
  -- ------------------------------------------------------------------
  -- `pela_fila` separado de propósito: a fila de liberação é a porta que a
  -- casa decidiu usar, e medir quanto passa por ela é medir se a decisão
  -- pegou. Em agosto: 12 mensagens saíram e NENHUMA pela fila.
  msgs as (
    select
      count(*) filter (where direcao = 'saida')   as saidas,
      count(*) filter (where direcao = 'entrada') as entradas,
      count(*) filter (where direcao = 'saida' and autor = 'ia') as por_ia
    from mensagens
    where org_id = v_org and created_at::date between v_ini and v_fim
  ),
  fila as (
    select
      count(*) filter (where status = 'aguardando') as aguardando,
      count(*) filter (where status = 'enviado')    as enviadas,
      count(*) filter (where status = 'descartado') as descartadas,
      count(*) as total
    from fila_liberacao
    where org_id = v_org and criado_em::date between v_ini and v_fim
  ),
  envios as (
    select count(*) filter (where status = 'falhou')   as falharam,
           count(*) filter (where status = 'pendente') as na_espera
      from fila_envios
     where org_id = v_org and created_at::date between v_ini and v_fim
  ),
  conversas_m as (
    select count(*) as total,
           count(*) filter (where estado = 'sem_movimento') as sem_resposta,
           count(*) filter (where estado = 'respondida')    as respondidas
      from conversas
     where org_id = v_org and created_at::date between v_ini and v_fim
  ),
  -- ------------------------------------------------------------------
  -- A IA — quanto ela sugeriu, quanto foi usado, e quanto custou
  -- ------------------------------------------------------------------
  -- A pergunta é uma só: ela está ajudando? Em agosto sugeriu 159 e duas
  -- foram usadas. Sem este bloco, isso não aparecia em lugar nenhum.
  ia as (
    select
      count(*) as sugestoes,
      count(*) filter (where acao_humana in ('aprovou','editou','enviou_direto')) as usadas,
      count(*) filter (where acao_humana = 'descartou') as descartadas,
      count(*) filter (where acao_humana is null) as sem_decisao
    from interacoes_ia
    where org_id = v_org and created_at::date between v_ini and v_fim
  ),
  ia_custo as (
    select coalesce(sum(custo), 0) as custo,
           coalesce(sum(tokens_entrada + tokens_saida), 0) as tokens,
           count(*) as chamadas
      from chamadas_ia
     where org_id = v_org and created_at::date between v_ini and v_fim
  ),
  -- ------------------------------------------------------------------
  -- FLORES E EXTRAS — o serviço novo, separado do resto (0117)
  -- ------------------------------------------------------------------
  flores as (
    select
      count(*) filter (where status = 'entregue') as entregues,
      count(*) filter (where status = 'prevista') as previstas,
      count(*) filter (where status = 'pulada')   as puladas,
      count(*) filter (where status = 'entregue' and foto_url is not null) as com_foto,
      coalesce(sum(quantidade * preco_unit) filter (where status = 'entregue'), 0) as receita,
      coalesce(sum(quantidade * custo_unit) filter (where status = 'entregue'), 0) as custo,
      count(distinct tumulo_id) filter (where status = 'entregue') as jazigos
    from entregas_extras
    where org_id = v_org and data_prevista between v_ini and v_fim
  ),
  assinaturas as (
    select count(*) filter (where ativo) as ativas,
           coalesce(sum(quantidade * preco_unit) filter (where ativo), 0) as por_entrega
      from assinaturas_extras where org_id = v_org
  ),
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
    'a_vencer', jsonb_build_object('valor', fu.a_vencer, 'familias', fu.familias),
    'devedores', coalesce((
      select jsonb_agg(jsonb_build_object('familia_id', d.familia_id, 'nome', d.nome,
                                          'saldo', d.saldo, 'dias', d.dias)
                       order by d.saldo desc)
        from (select * from devedores order by saldo desc limit 30) d), '[]'::jsonb),
    'lavagens', jsonb_build_object(
      'executadas', lv.executadas, 'pelo_campo', lv.pelo_campo,
      'anotadas', lv.anotadas, 'com_foto', lv.com_foto, 'sem_foto', lv.sem_foto,
      'estornadas', lv.estornadas, 'em_aberto', lv.em_aberto,
      'jazigos_atendidos', lv.jazigos_atendidos),
    'cobertura', jsonb_build_object(
      'contratados', co.contratados, 'em_servico', co.em_servico, 'parados', co.parados,
      'atendidos', lv.jazigos_atendidos,
      -- SOBRE O QUE ESTÁ EM SERVIÇO, e não sobre o total: quem pediu para
      -- parar não é jazigo que a casa deixou de atender.
      'nao_atendidos', greatest(0, co.em_servico - lv.jazigos_atendidos)),
    'sem_entrega', jsonb_build_object('tumulos', se.tumulos, 'valor', se.valor),
    'mensagens', jsonb_build_object(
      'saidas', ms.saidas, 'entradas', ms.entradas, 'por_ia', ms.por_ia,
      'pela_fila', fl.enviadas, 'aguardando', fl.aguardando,
      'descartadas', fl.descartadas, 'falharam', ev.falharam, 'na_espera', ev.na_espera,
      'conversas', cv.total, 'sem_resposta', cv.sem_resposta, 'respondidas', cv.respondidas),
    'ia', jsonb_build_object(
      'sugestoes', ia.sugestoes, 'usadas', ia.usadas, 'descartadas', ia.descartadas,
      'sem_decisao', ia.sem_decisao, 'custo', round(ic.custo, 2),
      'tokens', ic.tokens, 'chamadas', ic.chamadas,
      'aproveitamento', case when ia.sugestoes > 0
                             then round(100.0 * ia.usadas / ia.sugestoes, 1) else null end),
    'flores', jsonb_build_object(
      'entregues', fo.entregues, 'previstas', fo.previstas, 'puladas', fo.puladas,
      'com_foto', fo.com_foto, 'jazigos', fo.jazigos,
      'receita', fo.receita, 'custo', fo.custo, 'margem', fo.receita - fo.custo,
      'assinaturas', asg.ativas, 'por_entrega', asg.por_entrega),
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
      -- A MARGEM SÓ EXISTE SE HOUVER CUSTO LANÇADO.
      --
      -- `lancamentos` está vazio desde sempre. "Margem = receita − 0" devolvia
      -- a receita inteira com cara de lucro — ausência de registro
      -- apresentada como medição. Nulo obriga a tela a dizer "não dá para
      -- saber", que é a verdade.
      'margem', case when cu.lancamentos > 0
                     then (r.contratos + r.avulsos + r.abertura) - cu.total
                     else null end,
      'tem_custo', cu.lancamentos > 0)
  ) into v_out
  from receita r, recebido rc, aging a, futuro fu, lavagens lv, carteira_op co,
       sem_entrega se, msgs ms, fila fl, envios ev, conversas_m cv,
       ia, ia_custo ic, flores fo, assinaturas asg,
       custos cu, carteira ca, familias_n fn;

  return v_out;
end $$;

revoke all on function public.sureya_painel_do_mes(date, uuid) from public, anon;
grant execute on function public.sureya_painel_do_mes(date, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. O NÚMERO QUE ABRE — o relatório por trás de cada cartão
-- ---------------------------------------------------------------------------
-- "audite se os números são acionáveis, abrem relatórios de gestão"
--
-- Não abriam. O painel era um placar: dizia "cobrada e não entregue: 2
-- jazigos" e não levava aos dois. Para agir era preciso sair da tela,
-- adivinhar quais eram e procurar um por um — e é assim que um número vira
-- enfeite, olhado todo mês e nunca usado.
--
-- Uma função só, com um parâmetro que diz QUAL lista. A alternativa era uma
-- rota por bloco, e aí a lista e o cartão passariam a contar o mesmo fato de
-- dois jeitos — o defeito de forma que já apareceu cinco vezes neste banco.
-- Aqui o cartão e a lista saem da MESMA regra escrita uma vez.
create or replace function public.sureya_painel_detalhe(
  p_bloco text, p_mes date default null, p_org uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_org uuid; v_ini date; v_fim date; v_out jsonb;
begin
  v_org := coalesce(p_org, current_org_id());
  if v_org is null then
    raise exception 'sem_organizacao' using errcode = '42501';
  end if;

  v_ini := date_trunc('month', coalesce(p_mes, current_date))::date;
  v_fim := (v_ini + interval '1 month' - interval '1 day')::date;

  -- AS LAVAGENS DO MÊS, uma linha por serviço, com quem registrou e se tem a
  -- prova. É a lista que responde "o que a casa entregou".
  if p_bloco = 'lavagens' then
    select coalesce(jsonb_agg(x order by x->>'data' desc), '[]'::jsonb) into v_out
      from (
        select jsonb_build_object(
          'id', s.id, 'data', coalesce(s.data_executada::date, s.data_prevista),
          'familia', f.nome, 'familia_id', f.id,
          'jazigo', coalesce(t.identificacao, t.codigo),
          'local', nullif(concat_ws(' · ', q.codigo, coalesce(ru.nome, t.rua)), ''),
          'pelo_campo', s.iniciado_em is not null,
          'com_foto', s.foto_depois_url is not null,
          'foto', s.foto_depois_url) as x
        from servicos s
        left join tumulos t on t.id = s.tumulo_id
        left join familias f on f.id = t.familia_id
        left join quadras q on q.id = t.quadra_id
        left join ruas ru on ru.id = t.rua_id
       where s.org_id = v_org and s.status = 'executado' and s.estornado_em is null
         and s.data_executada::date between v_ini and v_fim) y;

  -- OS JAZIGOS QUE NÃO FORAM ATENDIDOS. É a lista mais acionável do painel:
  -- contratado, em serviço, e ninguém foi lá este mês.
  elsif p_bloco = 'nao_atendidos' then
    select coalesce(jsonb_agg(x order by x->>'familia'), '[]'::jsonb) into v_out
      from (
        select jsonb_build_object(
          'id', t.id, 'familia', f.nome, 'familia_id', f.id,
          'jazigo', coalesce(t.identificacao, t.codigo),
          'local', nullif(concat_ws(' · ', q.codigo, coalesce(ru.nome, t.rua)), ''),
          'periodicidade', t.periodicidade::text,
          'mensal', t.valor_mensal,
          'ultima_lavagem', (select max(s2.data_executada::date) from servicos s2
                              where s2.tumulo_id = t.id and s2.status = 'executado'
                                and s2.estornado_em is null)) as x
        from tumulos t
        left join familias f on f.id = t.familia_id
        left join quadras q on q.id = t.quadra_id
        left join ruas ru on ru.id = t.rua_id
       where t.org_id = v_org and t.contratado
         and not sureya_tumulo_parado(t.id, v_fim)
         and not exists (
           select 1 from servicos s
            where s.tumulo_id = t.id and s.status = 'executado'
              and s.estornado_em is null
              and s.data_executada::date between v_ini and v_fim)) y;

  -- LAVAGEM SEM FOTO — feita e sem o que mandar para a família.
  elsif p_bloco = 'sem_foto' then
    select coalesce(jsonb_agg(x order by x->>'data' desc), '[]'::jsonb) into v_out
      from (
        select jsonb_build_object(
          'id', s.id, 'data', s.data_executada::date,
          'familia', f.nome, 'familia_id', f.id,
          'jazigo', coalesce(t.identificacao, t.codigo),
          'pelo_campo', s.iniciado_em is not null) as x
        from servicos s
        left join tumulos t on t.id = s.tumulo_id
        left join familias f on f.id = t.familia_id
       where s.org_id = v_org and s.status = 'executado' and s.estornado_em is null
         and s.foto_depois_url is null
         and s.data_executada::date between v_ini and v_fim) y;

  -- COBRADA E NÃO ENTREGUE — o risco que a 0104 criou ao separar cobrança de
  -- lavagem. Dinheiro lançado no mês sem limpeza nenhuma naquele jazigo.
  elsif p_bloco = 'sem_entrega' then
    select coalesce(jsonb_agg(x order by (x->>'valor')::numeric desc), '[]'::jsonb) into v_out
      from (
        select jsonb_build_object(
          'id', cc.tumulo_id, 'familia', f.nome, 'familia_id', f.id,
          'jazigo', coalesce(t.identificacao, t.codigo),
          'valor', cc.valor, 'descricao', cc.descricao) as x
        from conta_corrente cc
        left join tumulos t on t.id = cc.tumulo_id
        left join familias f on f.id = cc.familia_id
       where cc.org_id = v_org and cc.origem = 'competencia'
         and cc.competencia = v_ini and cc.tipo = 'debito'
         and cc.tumulo_id is not null
         and not exists (
           select 1 from servicos s
            where s.tumulo_id = cc.tumulo_id and s.status = 'executado'
              and s.estornado_em is null
              and s.data_executada::date between v_ini and v_fim)) y;

  -- AS MENSAGENS QUE SAÍRAM, e por onde.
  elsif p_bloco = 'mensagens' then
    select coalesce(jsonb_agg(x order by x->>'quando' desc), '[]'::jsonb) into v_out
      from (
        select jsonb_build_object(
          'id', m.id, 'quando', m.created_at, 'autor', m.autor::text,
          'familia', f.nome, 'familia_id', f.id,
          'texto', left(m.texto, 160)) as x
        from mensagens m
        left join clientes c on c.id = m.cliente_id
        left join familias f on f.id = c.familia_id
       where m.org_id = v_org and m.direcao = 'saida'
         and m.created_at::date between v_ini and v_fim) y;

  -- O QUE A IA SUGERIU E FOI DESCARTADO. Cento e cinquenta e sete em agosto:
  -- ler isso é o único jeito de saber se o problema é o texto, o momento, ou
  -- se a sugestão nunca deveria ter sido feita.
  elsif p_bloco = 'ia_descartadas' then
    select coalesce(jsonb_agg(x order by x->>'quando' desc), '[]'::jsonb) into v_out
      from (
        select jsonb_build_object(
          'id', i.id, 'quando', i.created_at, 'assunto', i.assunto::text,
          'familia', f.nome, 'familia_id', f.id,
          'texto', left(coalesce(i.rascunho, ''), 200),
          -- POR QUE FOI SEGURADA. Sem o motivo, ler 157 descartes não ensina
          -- nada: a lista vira uma pilha de textos parecidos.
          'motivo', i.motivo_retencao) as x
        from interacoes_ia i
        left join clientes c on c.id = i.cliente_id
        left join familias f on f.id = c.familia_id
       where i.org_id = v_org and i.acao_humana = 'descartou'
         and i.created_at::date between v_ini and v_fim
       limit 100) y;

  -- CONVERSAS SEM RESPOSTA — a família escreveu ou recebeu e nada aconteceu.
  elsif p_bloco = 'sem_resposta' then
    select coalesce(jsonb_agg(x order by x->>'quando' desc), '[]'::jsonb) into v_out
      from (
        select jsonb_build_object(
          'id', cv.id, 'quando', cv.created_at,
          'familia', f.nome, 'familia_id', f.id,
          'telefone', c.telefone) as x
        from conversas cv
        left join clientes c on c.id = cv.cliente_id
        left join familias f on f.id = c.familia_id
       where cv.org_id = v_org and cv.estado = 'sem_movimento'
         and cv.created_at::date between v_ini and v_fim
       limit 100) y;

  -- AS ENTREGAS DE FLORES DO MÊS.
  elsif p_bloco = 'flores' then
    select coalesce(jsonb_agg(x order by x->>'data'), '[]'::jsonb) into v_out
      from (
        select jsonb_build_object(
          'id', e.id, 'data', e.data_prevista, 'status', e.status,
          'familia', f.nome, 'familia_id', f.id,
          'jazigo', coalesce(t.identificacao, t.codigo),
          'item', e.nome, 'quantidade', e.quantidade,
          'receita', e.quantidade * e.preco_unit,
          'custo', e.quantidade * e.custo_unit,
          'com_foto', e.foto_url is not null) as x
        from entregas_extras e
        left join tumulos t on t.id = e.tumulo_id
        left join familias f on f.id = e.familia_id
       where e.org_id = v_org and e.data_prevista between v_ini and v_fim) y;

  -- OS DEVEDORES, com o vencimento mais antigo em aberto.
  elsif p_bloco = 'devedores' then
    select coalesce(jsonb_agg(x order by (x->>'saldo')::numeric desc), '[]'::jsonb) into v_out
      from (
        select jsonb_build_object(
          'id', s.familia_id, 'familia_id', s.familia_id, 'familia', f.nome,
          'saldo', s.vencido,
          'desde', (select min(cc.data) from conta_corrente cc
                     where cc.familia_id = s.familia_id and cc.org_id = v_org
                       and cc.tipo = 'debito' and cc.status_conc = 'confirmado'
                       and cc.data <= v_fim)) as x
        from (
          select familia_id,
                 sum(case when data <= v_fim
                          then case when tipo = 'debito' then valor else -valor end
                          else 0 end) as vencido
            from conta_corrente
           where org_id = v_org and status_conc = 'confirmado'
           group by familia_id) s
        join familias f on f.id = s.familia_id
       where s.vencido > 0.009) y;

  else
    raise exception 'bloco_desconhecido' using
      errcode = 'P0001',
      hint = 'Blocos: lavagens, nao_atendidos, sem_foto, sem_entrega, mensagens, ia_descartadas, sem_resposta, flores, devedores.';
  end if;

  return coalesce(v_out, '[]'::jsonb);
end $$;

revoke all on function public.sureya_painel_detalhe(text, date, uuid) from public, anon;
grant execute on function public.sureya_painel_detalhe(text, date, uuid) to authenticated, service_role;

commit;
