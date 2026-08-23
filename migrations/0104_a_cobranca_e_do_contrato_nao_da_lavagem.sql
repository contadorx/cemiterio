-- 0104 — A COBRANÇA É DO CONTRATO, NÃO DA LAVAGEM
--
-- O PEDIDO
--   "a cobrança é pela periodicidade... o conta corrente não deve mais
--    responder por lavagens mas o valor total da competência do contrato.
--    Assim tiramos todo o registro de lavagens no conta corrente. Podemos
--    manter o controle de lavagens na ficha separada, não no financeiro...
--    isso simplifica a cobrança que caminha em separado dos registros de
--    serviços."
--
-- DUAS COISAS ESTAVAM NO MESMO LUGAR
--   O razão respondia por duas perguntas diferentes:
--
--     dinheiro   quanto a família deve pelo contrato, mês a mês
--     serviço    quais limpezas aconteceram
--
--   Enquanto a lavagem lançava o débito, a segunda pergunta escrevia na
--   primeira. Uma limpeza adiada virava um mês mais barato; uma limpeza
--   registrada em atraso virava dívida retroativa. O contrato — que é o que a
--   família combinou pagar — ficava sendo o RESULTADO da operação, quando é o
--   contrário: ele é o combinado, e a operação é o que a casa entrega por ele.
--
--   O código já sabia disso. Dentro de `sureya_concluir_lavagem`, no bloco 4:
--       "-- Quem gera a dívida é a competência. Se a lavagem também lançasse
--        -- valor, a família seria cobrada duas vezes pelo mesmo serviço."
--   O caminho da competência existia, era o certo, e NADA O ALIMENTAVA.
--
-- MEDIDO ANTES (produção, 23/08)
--   O razão inteiro tem 11 lançamentos, todos na competência 2026-08:
--     5 débitos de lavagem  R$ 121,25
--     4 pagamentos          R$ 215,00
--     1 abertura            R$ 240,00
--     1 avulso              R$  40,00
--   Nenhuma competência lançada. É o momento mais barato que existe para
--   trocar o modelo: 5 linhas a estornar, e nenhum histórico longo a
--   reinterpretar.
--
-- O TETO QUE NINGUÉM VIA
--   Havia DOIS índices únicos para o mesmo `origem='competencia'`:
--     idx_cc_competencia_familia   (familia_id, competencia)
--     idx_cc_competencia_unica     (tumulo_id,  competencia)
--   O primeiro limita a família a UMA cobrança por mês — e a decisão D-24 diz
--   que contrato, pagamento e lavagem são POR TÚMULO, "pois tem famílias com N
--   túmulos". Ensaiado em produção e desfeito: a segunda cobrança do mesmo mês
--   volta com `duplicate key ... idx_cc_competencia_familia`. Com ele de pé, o
--   modelo novo não teria como existir.

begin;

-- ---------------------------------------------------------------------------
-- 1. O RAZÃO PASSA A CABER N TÚMULOS
-- ---------------------------------------------------------------------------
-- Sai o de grão de família; fica o de grão de túmulo, que é o que dá
-- convergência ao cobrador (rodar duas vezes não cobra duas vezes).
drop index if exists idx_cc_competencia_familia;

-- ---------------------------------------------------------------------------
-- 2. DUAS DATAS QUE ERAM UMA
-- ---------------------------------------------------------------------------
-- `inicio_cobranca` respondia por duas perguntas ao mesmo tempo: quando o
-- dinheiro começa e quando a rota começa. Elas não coincidem — a família
-- assina hoje, a primeira limpeza é na semana que vem, e a cobrança pode
-- começar no mês que vem. Misturadas, mexer numa mexia na outra.
-- DERIVA: `tumulos.inicio_cobranca` existe em produção e NENHUMA migration a
-- cria — a 0061 criou a de `familias`, e a do túmulo entrou pelo painel do
-- Supabase em algum momento. O banco reconstruído do repositório não a tinha,
-- e a linha de herança abaixo quebrava só no ambiente limpo. Criada aqui para
-- que produção e repositório voltem a dizer a mesma coisa.
alter table tumulos add column if not exists inicio_cobranca date;

alter table tumulos add column if not exists proxima_cobranca date;
alter table tumulos add column if not exists inicio_agendamento date;

comment on column tumulos.proxima_cobranca is
  'Data do PRÓXIMO lançamento de competência deste túmulo. O cobrador anda com ela.';
comment on column tumulos.inicio_agendamento is
  'Quando a agenda passa a gerar limpezas para este túmulo. Não tem relação com a cobrança.';

-- Estado inicial: as duas herdam o que havia, para ninguém começar em branco.
update tumulos
   set proxima_cobranca   = coalesce(proxima_cobranca, inicio_cobranca),
       inicio_agendamento = coalesce(inicio_agendamento, inicio_cobranca)
 where inicio_cobranca is not null
   and (proxima_cobranca is null or inicio_agendamento is null);

-- ---------------------------------------------------------------------------
-- 3. QUANTOS MESES CABEM NUMA COBRANÇA
-- ---------------------------------------------------------------------------
-- O valor guardado é MENSAL (`tumulos.valor_mensal`). Quem paga trimestral
-- paga três meses de uma vez — a conta é essa, e fica num lugar só para a
-- tela, o cobrador e o relatório darem sempre o mesmo número.
create or replace function public.sureya_meses_da_cobranca(p_freq text)
returns integer
language sql
immutable
as $$
  select case coalesce(p_freq, 'mensal')
           when 'mensal'     then 1
           when 'trimestral' then 3
           when 'semestral'  then 6
           when 'anual'      then 12
           else 1
         end;
$$;

-- ---------------------------------------------------------------------------
-- 4. O COBRADOR
-- ---------------------------------------------------------------------------
-- Lança a competência de cada túmulo contratado cuja `proxima_cobranca` já
-- chegou, e ANDA a data para o período seguinte.
--
-- CONVERGENTE POR CONSTRUÇÃO, em duas travas independentes:
--   · `on conflict do nothing` sobre (tumulo_id, competencia) — dois toques
--     simultâneos não geram duas dívidas;
--   · a data só anda quando a linha entra, então uma falha no meio não pula
--     um mês em silêncio (que é o erro que ninguém descobre até o fechamento).
--
-- O laço `while` existe para o caso de a casa passar meses sem rodar o cron:
-- ele cobra as competências atrasadas UMA A UMA, com a competência certa em
-- cada linha, em vez de somar tudo num lançamento só com a data de hoje.
create or replace function public.sureya_cobrar_competencias(
  p_ate date default null, p_org uuid default null)
returns table(lancados integer, valor_total numeric, tumulos_tocados integer)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid; v_ate date; r record;
  v_lanc int := 0; v_total numeric := 0; v_toc int := 0;
  v_meses int; v_valor numeric; v_comp date; v_andou boolean; v_entrou int;
begin
  v_org := coalesce(p_org, current_org_id());
  if v_org is null then
    raise exception 'sem_organizacao' using
      errcode = '42501',
      hint = 'Sem sessao do painel: passe p_org (e o cron sempre passa).';
  end if;
  v_ate := coalesce(p_ate, current_date);

  for r in
    select t.id, t.familia_id, t.valor_mensal, t.proxima_cobranca, t.identificacao,
           f.freq_pagamento::text as freq
      from tumulos t
      join familias f on f.id = t.familia_id
     where t.org_id = v_org
       and t.contratado
       and t.familia_id is not null
       and coalesce(t.valor_mensal, 0) > 0
       and t.proxima_cobranca is not null
       and t.proxima_cobranca <= v_ate
  loop
    v_meses := sureya_meses_da_cobranca(r.freq);
    v_valor := round(r.valor_mensal * v_meses, 2);
    v_comp  := date_trunc('month', r.proxima_cobranca)::date;
    v_andou := false;

    -- Cobra tudo o que ficou para trás, uma competência por vez.
    while v_comp <= date_trunc('month', v_ate)::date loop
      insert into conta_corrente
        (org_id, familia_id, cliente_id, tumulo_id, tipo, origem,
         competencia, valor, descricao, data, canal)
      select v_org, r.familia_id, f.responsavel_id, r.id, 'debito', 'competencia',
             v_comp, v_valor,
             'Contrato · ' || to_char(v_comp, 'MM/YYYY')
               || coalesce(' · ' || r.identificacao, '')
               || case when v_meses > 1 then ' (' || v_meses || ' meses)' else '' end,
             v_comp, 'automatico'
        from familias f where f.id = r.familia_id
      on conflict do nothing;

      get diagnostics v_entrou = row_count;
      if v_entrou > 0 then
        v_lanc := v_lanc + 1;
        v_total := v_total + v_valor;
      end if;

      v_comp := (v_comp + (v_meses || ' months')::interval)::date;
      v_andou := true;
    end loop;

    if v_andou then
      update tumulos set proxima_cobranca = v_comp where id = r.id;
      v_toc := v_toc + 1;
    end if;
  end loop;

  return query select v_lanc, v_total, v_toc;
end $$;

revoke all on function public.sureya_cobrar_competencias(date, uuid) from public, anon, authenticated;
grant execute on function public.sureya_cobrar_competencias(date, uuid) to service_role;


-- ---------------------------------------------------------------------------
-- 5. A LAVAGEM PARA DE ENCOSTAR NO DINHEIRO
-- ---------------------------------------------------------------------------
-- `sureya_concluir_lavagem` tinha dois blocos que escreviam no razão:
--
--   bloco 3  o DÉBITO da limpeza (quando `modo_cobranca = 'consumo'`)
--   bloco 4  uma linha de valor ZERO só para a limpeza aparecer no extrato
--            (quando o modo era competência)
--
-- Os dois saem. O primeiro porque a dívida passa a ser do contrato; o segundo
-- porque era o "registro de lavagem no conta corrente" que o pedido manda
-- tirar — e porque um lançamento de R$ 0,00 é ruído num extrato de dinheiro:
-- ele não muda saldo nenhum e ainda faz o leitor conferir se mudou.
--
-- O que a limpeza continua fazendo: marcar o serviço como executado, guardar
-- as fotos, calcular remuneração e custo, e entrar na fila de liberação. Ela
-- só não mexe mais no saldo.
--
-- Substituição de texto, e falha alto se o alvo não estiver lá — a função tem
-- ~260 linhas de regra de campo, e recopiá-la para apagar dois blocos é a
-- chance de mudar algo sem querer.
do $migra$
declare
  v_src text; v_novo text;
  v_bloco3 text :=
'  if v_familia is not null and v_momento <> ''antes'' and v_valor > 0
     and v_modo = ''consumo'' then
    insert into conta_corrente (org_id, familia_id, cliente_id, tumulo_id, servico_id,
                                tipo, origem, valor, status_conc, descricao, data)
    values (v_org, v_familia, v_s.cliente_id, v_s.tumulo_id, p_servico,
            ''debito'', ''lavagem'', v_valor, ''confirmado'',
            ''Limpeza executada'' || coalesce('' · '' || v_codigo, ''''), current_date)
    on conflict do nothing;
    v_deb := found;
    if v_deb and v_ja then
      v_reparos := v_reparos || ''debito estava faltando: lancado agora''::text;
    end if;
  end if;';
  v_bloco4 text :=
'  if v_familia is not null and v_modo <> ''consumo'' then
    insert into conta_corrente (org_id, familia_id, cliente_id, tumulo_id, servico_id,
                                tipo, origem, competencia, valor, descricao, data)
    values (v_org, v_familia, v_s.cliente_id, v_s.tumulo_id, p_servico, ''debito'', ''lavagem'',
            null, 0, ''Limpeza realizada'' || coalesce('' · '' || v_codigo, ''''), current_date)
    on conflict do nothing;
    v_ext := found;
    if v_ext and v_ja then
      v_reparos := v_reparos || ''registro no extrato estava faltando: criado agora''::text;
    end if;
  end if;';
begin
  v_src := pg_get_functiondef('public.sureya_concluir_lavagem'::regproc);

  v_novo := replace(v_src, v_bloco3,
'  -- O DEBITO DA LIMPEZA SAIU NA 0104. Quem gera a divida e o contrato, pela
  -- competencia (sureya_cobrar_competencias). A limpeza e entrega, nao cobranca:
  -- uma adiada nao pode baratear o mes, e uma anotada em atraso nao pode virar
  -- divida retroativa.
  v_deb := false;');
  if v_novo = v_src then
    raise exception 'BLOCO 3 (debito da lavagem) NAO ENCONTRADO em sureya_concluir_lavagem';
  end if;

  v_src := v_novo;
  v_novo := replace(v_src, v_bloco4,
'  -- O REGISTRO DE VALOR ZERO SAIU NA 0104. Ele existia so para a limpeza
  -- aparecer no extrato do dinheiro; o controle de limpezas mora na ficha do
  -- jazigo. Lancamento de R$ 0,00 nao muda saldo e ainda faz conferir se mudou.
  v_ext := false;');
  if v_novo = v_src then
    raise exception 'BLOCO 4 (extrato de valor zero) NAO ENCONTRADO em sureya_concluir_lavagem';
  end if;

  execute v_novo;
end $migra$;

-- ---------------------------------------------------------------------------
-- 6. OS CINCO DÉBITOS QUE O MODELO VELHO DEIXOU
-- ---------------------------------------------------------------------------
-- R$ 121,25 em 5 linhas, todas na competência 2026-08. Elas cobram limpezas
-- que a competência de agosto vai cobrar de novo — deixá-las seria cobrar duas
-- vezes o mesmo mês.
--
-- ESTORNO, NÃO DELETE. Apagar deixaria o saldo certo e a história muda: quem
-- olhasse o extrato em setembro veria um saldo que nunca soube explicar. O
-- estorno diz o que foi lançado, o que foi desfeito, e por quê.
-- DOIS ÍNDICES QUASE ESTRAGARAM ISTO, e nenhum deles apareceu no banco limpo:
--
--   idx_cc_ajuste_mes         único por (familia_id, competencia) where ajuste
--   uq_conta_corrente_lavagem único por (servico_id) where lavagem
--
-- O primeiro derrubou a versão que estornava com `origem='ajuste'`: uma família
-- tinha TRÊS débitos no mesmo mês, e o segundo estorno colidia. O harness não
-- pegou porque lá as famílias do teste eram distintas — a colisão só existe
-- quando a mesma família repete competência, que é o caso real.
--
-- Então o estorno nasce com a MESMA origem do que reverte (`lavagem`), e com
-- `servico_id` NULO: o vínculo certo é `estorna_lancamento`, o ponteiro, e não
-- a repetição da chave do serviço — que é justamente o que o segundo índice
-- proíbe, e com razão (um serviço, um lançamento).
insert into conta_corrente
  (org_id, familia_id, cliente_id, tumulo_id, servico_id, tipo, origem,
   competencia, valor, descricao, data, status_conc, estorna_lancamento, canal)
select l.org_id, l.familia_id, l.cliente_id, l.tumulo_id, null,
       'credito', 'lavagem',
       l.competencia, l.valor,
       'Estorno (0104) · a limpeza deixou de gerar cobranca; quem cobra e o contrato',
       current_date, 'confirmado', l.id, 'automatico'
  from conta_corrente l
 where l.origem = 'lavagem'
   and l.tipo = 'debito'
   and l.valor > 0
   and not exists (select 1 from conta_corrente e where e.estorna_lancamento = l.id);

commit;
