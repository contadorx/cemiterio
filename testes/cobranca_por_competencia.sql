-- ============================================================================
-- A COBRANÇA É DO CONTRATO, NÃO DA LAVAGEM (0104)
--
-- O que se mediu antes: o razão inteiro tinha 11 lançamentos, 5 deles débitos
-- gerados por limpeza. A competência — o caminho certo, que o próprio código
-- já apontava — nunca foi alimentada. E um indice unico de grao de FAMILIA
-- impedia que uma familia com dois tumulos tivesse duas cobrancas no mes.
--
-- Este arquivo cobra:
--   1. familia com N tumulos tem N cobrancas por mes
--   2. o valor segue a periodicidade de pagamento
--   3. rodar duas vezes nao cobra duas vezes
--   4. meses atrasados sao cobrados UM A UM, com a competencia certa
--   5. a limpeza NAO encosta mais no dinheiro
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci15(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'COBRANCA FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into orgs (id, nome) values ('aaaaaaaa-0000-0000-0000-000000000015','CI Cobranca')
on conflict do nothing;
insert into cemiterios (id, org_id, nome)
values ('dddddddd-0000-0000-0000-000000000015','aaaaaaaa-0000-0000-0000-000000000015','CI Cem Cobranca')
on conflict do nothing;
insert into quadras (id, org_id, cemiterio_id, codigo, ordem)
values ('eeeeeeee-0000-0000-0000-000000000015','aaaaaaaa-0000-0000-0000-000000000015',
        'dddddddd-0000-0000-0000-000000000015','Q Cobranca', 1)
on conflict do nothing;

-- Uma família com DOIS túmulos — o caso que o índice velho proibia.
insert into familias (id, org_id, nome, freq_pagamento, contratado)
values ('ff000000-0000-0000-0000-000000000151','aaaaaaaa-0000-0000-0000-000000000015',
        'Familia Dois Jazigos','mensal', true)
on conflict do nothing;

insert into clientes (id, org_id, familia_id, nome, telefone, responsavel_financeiro)
values ('cc000000-0000-0000-0000-000000000151','aaaaaaaa-0000-0000-0000-000000000015',
        'ff000000-0000-0000-0000-000000000151','Quem Paga','5511900000151', true)
on conflict do nothing;
update familias set responsavel_id='cc000000-0000-0000-0000-000000000151'
 where id='ff000000-0000-0000-0000-000000000151';

insert into tumulos (id, org_id, quadra_id, familia_id, identificacao,
                     contratado, valor_mensal, proxima_cobranca, periodicidade)
values
  ('11100000-0000-0000-0000-000000000151','aaaaaaaa-0000-0000-0000-000000000015',
   'eeeeeeee-0000-0000-0000-000000000015','ff000000-0000-0000-0000-000000000151','CI-COB-A',
   true, 25, date_trunc('month', current_date)::date, 'semanal'),
  ('11100000-0000-0000-0000-000000000152','aaaaaaaa-0000-0000-0000-000000000015',
   'eeeeeeee-0000-0000-0000-000000000015','ff000000-0000-0000-0000-000000000151','CI-COB-B',
   true, 40, date_trunc('month', current_date)::date, 'mensal')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 1 · N TÚMULOS, N COBRANÇAS
-- ---------------------------------------------------------------------------
select ci15('a familia com dois jazigos recebe DUAS cobrancas',
  (select lancados = 2 from sureya_cobrar_competencias(current_date, 'aaaaaaaa-0000-0000-0000-000000000015')),
  'o indice de grao de familia ainda esta prendendo em uma');

select ci15('e cada uma carrega o valor do SEU jazigo',
  (select count(*) = 2 from conta_corrente
    where familia_id='ff000000-0000-0000-0000-000000000151'
      and origem='competencia'
      and valor in (25, 40)),
  'os valores nao seguiram cada tumulo');

select ci15('a divida e do contrato, e diz de qual jazigo',
  (select bool_and(tumulo_id is not null) from conta_corrente
    where familia_id='ff000000-0000-0000-0000-000000000151' and origem='competencia'),
  'sem tumulo_id nao da para responder "esse esta pago e aquele nao"');

-- ---------------------------------------------------------------------------
-- 2 · RODAR DE NOVO NÃO COBRA DE NOVO
-- ---------------------------------------------------------------------------
-- O cron roda toda manha. Sem convergencia, a familia receberia uma divida
-- nova por dia — o erro mais caro que este arquivo poderia deixar passar.
select ci15('rodar de novo no mesmo dia nao lanca nada',
  (select lancados = 0 from sureya_cobrar_competencias(current_date, 'aaaaaaaa-0000-0000-0000-000000000015')),
  'o cobrador duplicaria a divida a cada manha');

select ci15('e o razao continua com duas linhas de competencia',
  (select count(*) = 2 from conta_corrente
    where familia_id='ff000000-0000-0000-0000-000000000151' and origem='competencia'),
  'apareceu cobranca repetida');

-- ---------------------------------------------------------------------------
-- 3 · A PERIODICIDADE DE PAGAMENTO MULTIPLICA
-- ---------------------------------------------------------------------------
-- O valor guardado e MENSAL. Quem paga trimestral paga tres meses de uma vez.
insert into familias (id, org_id, nome, freq_pagamento, contratado)
values ('ff000000-0000-0000-0000-000000000152','aaaaaaaa-0000-0000-0000-000000000015',
        'Familia Trimestral','trimestral', true)
on conflict do nothing;
insert into tumulos (id, org_id, quadra_id, familia_id, identificacao,
                     contratado, valor_mensal, proxima_cobranca)
values ('11100000-0000-0000-0000-000000000153','aaaaaaaa-0000-0000-0000-000000000015',
        'eeeeeeee-0000-0000-0000-000000000015','ff000000-0000-0000-0000-000000000152','CI-COB-C',
        true, 30, date_trunc('month', current_date)::date)
on conflict do nothing;

select ci15('trimestral cobra tres meses de uma vez',
  (select valor_total = 90 from sureya_cobrar_competencias(current_date, 'aaaaaaaa-0000-0000-0000-000000000015')),
  'R$30/mes em trimestral tinha de dar R$90');

select ci15('e a proxima cobranca anda TRES meses',
  (select proxima_cobranca = (date_trunc('month', current_date) + interval '3 months')::date
     from tumulos where id='11100000-0000-0000-0000-000000000153'),
  'a data nao andou o periodo inteiro — o proximo ciclo sairia errado');

-- ---------------------------------------------------------------------------
-- 4 · MESES ATRASADOS SAEM UM A UM
-- ---------------------------------------------------------------------------
-- Se a casa passar meses sem rodar o cron, somar tudo num lancamento so com a
-- data de hoje perderia a competencia de cada mes — e o relatorio por
-- competencia, que e o que a Sureya confere, ficaria mentindo.
insert into familias (id, org_id, nome, freq_pagamento, contratado)
values ('ff000000-0000-0000-0000-000000000153','aaaaaaaa-0000-0000-0000-000000000015',
        'Familia Atrasada','mensal', true)
on conflict do nothing;
insert into tumulos (id, org_id, quadra_id, familia_id, identificacao,
                     contratado, valor_mensal, proxima_cobranca)
values ('11100000-0000-0000-0000-000000000154','aaaaaaaa-0000-0000-0000-000000000015',
        'eeeeeeee-0000-0000-0000-000000000015','ff000000-0000-0000-0000-000000000153','CI-COB-D',
        true, 50, (date_trunc('month', current_date) - interval '3 months')::date)
on conflict do nothing;

select ci15('tres meses parados viram QUATRO cobrancas',
  (select lancados = 4 from sureya_cobrar_competencias(current_date, 'aaaaaaaa-0000-0000-0000-000000000015')),
  'os meses atrasados nao foram cobrados um a um');

select ci15('e cada uma na sua competencia, nao todas em hoje',
  (select count(distinct competencia) = 4 from conta_corrente
    where familia_id='ff000000-0000-0000-0000-000000000153' and origem='competencia'),
  'somou tudo numa competencia so — o relatorio por competencia mentiria');

-- ---------------------------------------------------------------------------
-- 5 · A LIMPEZA NÃO ENCOSTA MAIS NO DINHEIRO
-- ---------------------------------------------------------------------------
-- Era isto que se pediu: "o conta corrente não deve mais responder por
-- lavagens". Uma limpeza adiada nao pode baratear o mes, e uma anotada em
-- atraso nao pode virar divida retroativa.
select ci15('sureya_concluir_lavagem nao escreve mais lavagem no razao',
  (select pg_get_functiondef(oid) not like '%''lavagem''%'
     from pg_proc where proname='sureya_concluir_lavagem'
       and pronamespace='public'::regnamespace),
  'a funcao ainda lanca origem=lavagem no conta corrente');

select ci15('e nenhum debito de lavagem sobrou sem estorno',
  not exists (
    select 1 from conta_corrente l
     where l.origem='lavagem' and l.tipo='debito' and l.valor > 0
       and not exists (select 1 from conta_corrente e where e.estorna_lancamento = l.id)),
  'ficou debito de lavagem de pe — a familia seria cobrada duas vezes pelo mes');

-- ---------------------------------------------------------------------------
-- 6 · SÓ COBRA QUEM TEM CONTRATO E VALOR
-- ---------------------------------------------------------------------------
insert into familias (id, org_id, nome, freq_pagamento)
values ('ff000000-0000-0000-0000-000000000154','aaaaaaaa-0000-0000-0000-000000000015',
        'Familia Sem Contrato','mensal')
on conflict do nothing;
insert into tumulos (id, org_id, quadra_id, familia_id, identificacao,
                     contratado, valor_mensal, proxima_cobranca)
values ('11100000-0000-0000-0000-000000000155','aaaaaaaa-0000-0000-0000-000000000015',
        'eeeeeeee-0000-0000-0000-000000000015','ff000000-0000-0000-0000-000000000154','CI-COB-E',
        false, 60, date_trunc('month', current_date)::date)
on conflict do nothing;

select ci15('jazigo sem contrato nao gera cobranca',
  (select lancados = 0 from sureya_cobrar_competencias(current_date, 'aaaaaaaa-0000-0000-0000-000000000015')),
  'avulso virou mensalidade sem ninguem combinar');
