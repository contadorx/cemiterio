-- ============================================================================
-- FLORES E EXTRAS (0117)
--
-- O risco deste arquivo tem nome: comprar buque a mais toda semana, ou deixar
-- a familia sem flor no sabado que ela espera. Os dois somem em silencio — um
-- vira prejuizo miudo, o outro vira telefonema.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci19(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'FLORES FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into orgs (id, nome, dia_vencimento) values
  ('aaaaaaaa-0000-0000-0000-000000000019','CI Flores', 10)
on conflict do nothing;
insert into cemiterios (id, org_id, nome)
values ('dddddddd-0000-0000-0000-000000000019','aaaaaaaa-0000-0000-0000-000000000019','CI Cem Flores')
on conflict do nothing;
insert into quadras (id, org_id, cemiterio_id, codigo, ordem)
values ('eeeeeeee-0000-0000-0000-000000000019','aaaaaaaa-0000-0000-0000-000000000019',
        'dddddddd-0000-0000-0000-000000000019','Q Flores', 1)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 1 · A ARITMETICA DO CALENDARIO
-- ---------------------------------------------------------------------------
-- "Ultimo sabado" NAO e "quarto sabado". Este e o erro que o cadastro nao
-- pega, porque em tres meses de cada quatro os dois dao a mesma data.
--
--   agosto/2026   sabados: 01, 08, 15, 22, 29   -> CINCO
--   setembro/2026 sabados: 05, 12, 19, 26       -> quatro
select ci19('o ultimo sabado de agosto/2026 e dia 29, e nao 22',
  sureya_proxima_data_extra(6::smallint, '{-1}'::smallint[], '2026-08-01'::date) = '2026-08-29'::date,
  'contar do comeco daria 22 num mes de cinco sabados — a familia esperaria flor no dia errado');

select ci19('e o quarto sabado desse mesmo mes e o dia 22',
  sureya_proxima_data_extra(6::smallint, '{4}'::smallint[], '2026-08-01'::date) = '2026-08-22'::date,
  'se -1 e 4 dessem o mesmo dia, a distincao seria enfeite');

select ci19('num mes de quatro sabados os dois coincidem',
  sureya_proxima_data_extra(6::smallint, '{-1}'::smallint[], '2026-09-01'::date)
    = sureya_proxima_data_extra(6::smallint, '{4}'::smallint[], '2026-09-01'::date),
  'setembro/2026 tem quatro sabados: aqui os dois TEM de bater');

-- PEDIR DEPOIS QUE A DATA PASSOU PULA PARA O MES SEGUINTE, e nao devolve nulo.
select ci19('pedido no dia 30 de agosto, o proximo ultimo sabado e o de setembro',
  sureya_proxima_data_extra(6::smallint, '{-1}'::smallint[], '2026-08-30'::date) = '2026-09-26'::date,
  'devolver nulo aqui pararia a esteira em silencio no fim de todo mes');

select ci19('no proprio dia, o dia ainda vale',
  sureya_proxima_data_extra(6::smallint, '{-1}'::smallint[], '2026-08-29'::date) = '2026-08-29'::date,
  'gerar a esteira na manha do sabado nao pode pular o sabado');

select ci19('primeiro e terceiro sabado dao o primeiro que vier',
  sureya_proxima_data_extra(6::smallint, '{1,3}'::smallint[], '2026-08-10'::date) = '2026-08-15'::date,
  'com o dia 01 ja passado, o proximo e o terceiro sabado');

select ci19('toda semana da o sabado seguinte',
  sureya_proxima_data_extra(6::smallint, '{1,2,3,4,5}'::smallint[], '2026-08-10'::date) = '2026-08-15'::date,
  'o combinado semanal e o que mais gera compra: errar aqui erra o mes inteiro');

-- A 5a SEMANA PEDIDA NUM MES QUE NAO TEM.
select ci19('pedir a 5a semana pula o mes que nao tem cinco',
  sureya_proxima_data_extra(6::smallint, '{5}'::smallint[], '2026-09-01'::date) = '2026-10-31'::date,
  'setembro nao tem cinco sabados; outubro tem — nao pode devolver nulo nem inventar');

-- ---------------------------------------------------------------------------
-- 2 · O COMBINADO VIRA ESTEIRA
-- ---------------------------------------------------------------------------
insert into familias (id, org_id, nome, contratado)
values ('ff000000-0000-0000-0000-000000000191','aaaaaaaa-0000-0000-0000-000000000019','Familia Das Flores', true)
on conflict do nothing;
insert into clientes (id, org_id, familia_id, nome, telefone, responsavel_financeiro)
values ('cc000000-0000-0000-0000-000000000191','aaaaaaaa-0000-0000-0000-000000000019',
        'ff000000-0000-0000-0000-000000000191','Dona Flor','5511900000191', true)
on conflict do nothing;
update familias set responsavel_id='cc000000-0000-0000-0000-000000000191'
 where id='ff000000-0000-0000-0000-000000000191';

insert into tumulos (id, org_id, quadra_id, familia_id, identificacao, contratado,
                     valor_mensal, inicio_cobranca, proxima_cobranca, cobranca_no_fim)
values ('11100000-0000-0000-0000-000000000191','aaaaaaaa-0000-0000-0000-000000000019',
        'eeeeeeee-0000-0000-0000-000000000019','ff000000-0000-0000-0000-000000000191','CI-FLOR-01',
        true, 30, '2026-08-01', '2026-10-01', false)
on conflict do nothing;

insert into servicos_extras (id, org_id, nome, categoria, preco, custo, unidade)
values ('99900000-0000-0000-0000-000000000191','aaaaaaaa-0000-0000-0000-000000000019',
        'Flores frescas','flores', 35, 18, 'buque')
on conflict do nothing;

-- O CASO REAL: flores no ULTIMO SABADO do mes, cobradas junto com o contrato.
insert into assinaturas_extras
  (id, org_id, tumulo_id, familia_id, extra_id, quantidade,
   dia_semana, semanas, cobranca, preco_unit, custo_unit, inicio)
values ('a5510000-0000-0000-0000-000000000191','aaaaaaaa-0000-0000-0000-000000000019',
        '11100000-0000-0000-0000-000000000191','ff000000-0000-0000-0000-000000000191',
        '99900000-0000-0000-0000-000000000191', 1,
        6::smallint, '{-1}'::smallint[], 'recorrente', 35, 18, '2026-08-01')
on conflict do nothing;

select * from sureya_gerar_entregas_extras('2026-10-31'::date, 'aaaaaaaa-0000-0000-0000-000000000019');

select ci19('a esteira nasce com um sabado por mes',
  (select count(*) = 3 from entregas_extras
    where tumulo_id='11100000-0000-0000-0000-000000000191'),
  'agosto, setembro e outubro — tres ultimos sabados no horizonte pedido');

select ci19('e sao 29/08, 26/09 e 31/10',
  (select array_agg(data_prevista order by data_prevista) = array['2026-08-29','2026-09-26','2026-10-31']::date[]
     from entregas_extras where tumulo_id='11100000-0000-0000-0000-000000000191'),
  'as tres datas sao o ultimo sabado de cada mes, e nao o quarto');

select ci19('a entrega guarda o preco e o CUSTO do combinado',
  (select bool_and(preco_unit = 35 and custo_unit = 18) from entregas_extras
    where tumulo_id='11100000-0000-0000-0000-000000000191'),
  'sem o custo copiado, a previsao de compra dependeria do catalogo de hoje');

-- CONVERGENTE: o cron roda todo dia.
select * from sureya_gerar_entregas_extras('2026-10-31'::date, 'aaaaaaaa-0000-0000-0000-000000000019');
select ci19('rodar de novo nao duplica a esteira',
  (select count(*) = 3 from entregas_extras
    where tumulo_id='11100000-0000-0000-0000-000000000191'),
  'o gerador roda no cron diario: repetir tem de ser inofensivo');

-- ---------------------------------------------------------------------------
-- 3 · A PREVISAO DA COMPRA
-- ---------------------------------------------------------------------------
-- Um segundo jazigo, com dois buques, no MESMO sabado — para a previsao ter
-- de somar em vez de listar.
insert into familias (id, org_id, nome, contratado)
values ('ff000000-0000-0000-0000-000000000192','aaaaaaaa-0000-0000-0000-000000000019','Familia Dois Buques', true)
on conflict do nothing;
insert into tumulos (id, org_id, quadra_id, familia_id, identificacao, contratado, valor_mensal)
values ('11100000-0000-0000-0000-000000000192','aaaaaaaa-0000-0000-0000-000000000019',
        'eeeeeeee-0000-0000-0000-000000000019','ff000000-0000-0000-0000-000000000192','CI-FLOR-02', true, 30)
on conflict do nothing;
insert into assinaturas_extras
  (org_id, tumulo_id, familia_id, extra_id, quantidade,
   dia_semana, semanas, cobranca, preco_unit, custo_unit, inicio)
values ('aaaaaaaa-0000-0000-0000-000000000019','11100000-0000-0000-0000-000000000192',
        'ff000000-0000-0000-0000-000000000192','99900000-0000-0000-0000-000000000191', 2,
        6::smallint, '{-1}'::smallint[], 'avulso', 35, 18, '2026-08-01')
on conflict do nothing;

select * from sureya_gerar_entregas_extras('2026-08-31'::date, 'aaaaaaaa-0000-0000-0000-000000000019');

select ci19('a previsao soma os buques do sabado, e nao lista as entregas',
  (select (d->'itens'->0->>'quantidade')::numeric = 3
     from jsonb_array_elements(
            sureya_compras_de_extras('2026-08-01'::date, '2026-08-31'::date,
                                     'aaaaaaaa-0000-0000-0000-000000000019') -> 'datas') d
    where (d->>'data') = '2026-08-29'),
  'e o papel que se leva para a floricultura: um numero por item, nao uma linha por jazigo');

select ci19('e diz quantos JAZIGOS sao, que e outra pergunta',
  (select (d->>'jazigos')::int = 2
     from jsonb_array_elements(
            sureya_compras_de_extras('2026-08-01'::date, '2026-08-31'::date,
                                     'aaaaaaaa-0000-0000-0000-000000000019') -> 'datas') d
    where (d->>'data') = '2026-08-29'),
  'tres buques em dois jazigos: quem faz a rota precisa do segundo numero');

select ci19('o custo e o preco andam lado a lado',
  (select (c->>'custo')::numeric = 54 and (c->>'preco')::numeric = 105
     from (select sureya_compras_de_extras('2026-08-01'::date, '2026-08-31'::date,
                                           'aaaaaaaa-0000-0000-0000-000000000019') as c) x),
  '3 x R$18 de custo e 3 x R$35 de preco');

select ci19('e a margem vem pronta, sem ninguem fazer a conta',
  (select (c->>'margem')::numeric = 51
     from (select sureya_compras_de_extras('2026-08-01'::date, '2026-08-31'::date,
                                           'aaaaaaaa-0000-0000-0000-000000000019') as c) x),
  'era a pergunta do Leandro: o servico novo paga?');

-- ---------------------------------------------------------------------------
-- 4 · SO SE COBRA O QUE FOI ENTREGUE
-- ---------------------------------------------------------------------------
select ci19('entrega PREVISTA nao e dinheiro',
  (select count(*) = 0 from conta_corrente
    where familia_id='ff000000-0000-0000-0000-000000000191' and origem='avulso'),
  'a mesma regra da lavagem: previsto nao vira receita');

select * from sureya_registrar_entrega(
  (select id from entregas_extras
    where tumulo_id='11100000-0000-0000-0000-000000000191' and data_prevista='2026-08-29'),
  'https://exemplo/foto.jpg', 'flor branca, como ela pediu');

select ci19('entregar lanca o debito de R$ 35',
  (select count(*) = 1 and sum(valor) = 35 from conta_corrente
    where familia_id='ff000000-0000-0000-0000-000000000191' and origem='avulso'),
  'a entrega e o fato que vira dinheiro');

-- RECORRENTE: vence junto com a fatura do contrato (proxima_cobranca out/2026).
select ci19('no RECORRENTE ela vence junto com a fatura do contrato',
  (select data = '2026-10-10'::date from conta_corrente
    where familia_id='ff000000-0000-0000-0000-000000000191' and origem='avulso'),
  'a familia tem de receber UMA conta, e nao duas no mesmo mes');

select ci19('e a competencia e o mes em que a flor foi POSTA',
  (select competencia = '2026-08-01'::date from conta_corrente
    where familia_id='ff000000-0000-0000-0000-000000000191' and origem='avulso'),
  'competencia e vencimento sao coisas diferentes (0114) — tambem aqui');

select ci19('a entrega guarda a foto e a observacao',
  (select foto_url is not null and observacao like 'flor branca%' and status='entregue'
     from entregas_extras
    where tumulo_id='11100000-0000-0000-0000-000000000191' and data_prevista='2026-08-29'),
  'sem a foto guardada, a prova do servico depende do WhatsApp ter dado certo');

select ci19('e ela aponta para o lancamento que gerou',
  (select lancamento_id is not null from entregas_extras
    where tumulo_id='11100000-0000-0000-0000-000000000191' and data_prevista='2026-08-29'),
  'sem o vinculo, estornar uma entrega errada vira caca ao debito no razao');

-- ENTREGAR DUAS VEZES DOBRARIA A CONTA DA FAMILIA.
do $$
declare v_id uuid; v_erro text;
begin
  select id into v_id from entregas_extras
   where tumulo_id='11100000-0000-0000-0000-000000000191' and data_prevista='2026-08-29';
  begin
    perform sureya_registrar_entrega(v_id, null, null);
    v_erro := 'passou';
  exception when others then
    v_erro := sqlerrm;
  end;
  perform ci19('entregar a mesma duas vezes e RECUSADO',
    v_erro = 'entrega_ja_registrada',
    'um clique repetido no sabado dobraria a conta da familia');
end $$;

-- AVULSO: vence sozinha, no dia da casa do mes da entrega.
select * from sureya_registrar_entrega(
  (select id from entregas_extras
    where tumulo_id='11100000-0000-0000-0000-000000000192' and data_prevista='2026-08-29'));

select ci19('no AVULSO ela vence sozinha, no mes da entrega',
  (select data = '2026-09-10'::date and valor = 70 from conta_corrente
    where familia_id='ff000000-0000-0000-0000-000000000192' and origem='avulso'),
  'entregue em 29/08, o dia 10 de agosto ja passou: cobrar com data de ontem a faria nascer inadimplente');

select ci19('e a previsao para de contar o que ja foi entregue',
  (select (c->>'entregas')::int = 0
     from (select sureya_compras_de_extras('2026-08-01'::date, '2026-08-31'::date,
                                           'aaaaaaaa-0000-0000-0000-000000000019') as c) x),
  'comprar de novo o que ja foi posto e o prejuizo miudo que ninguem ve');
