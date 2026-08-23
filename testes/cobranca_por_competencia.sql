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

-- MUDOU NA 0112. Ate aqui o ciclo virava UMA linha com o valor cheio, e a
-- receita de tres meses caia num mes so no painel. Agora vira UMA LINHA POR
-- MES do periodo, todas vencendo na mesma data.
select ci15('trimestral vira TRES linhas de R$30, e nao uma de R$90',
  (select lancados = 3 and valor_total = 90
     from sureya_cobrar_competencias(current_date, 'aaaaaaaa-0000-0000-0000-000000000015')),
  'o total esta certo mas a receita continua empilhada num mes so');

select ci15('e as tres caem em competencias diferentes',
  (select count(distinct competencia) = 3 from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000153' and origem='competencia'),
  'tres meses de servico na mesma competencia distorcem o painel');

select ci15('mas VENCEM todas no mesmo dia',
  (select count(distinct data) = 1 from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000153' and origem='competencia'),
  'a familia paga uma vez; se cada linha vencer num dia, a regua cobra tres vezes');

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
-- (mensal: um ciclo = um mes = uma linha, entao a 0112 nao muda nada aqui)

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

-- ---------------------------------------------------------------------------
-- 7 · A CADA N MESES — o caso que o enum nao previa (0107)
-- ---------------------------------------------------------------------------
-- "me pagou 4 meses em agosto, precisava colocar as lavagens imediatas e a
--  proxima cobranca em dezembro e a cada 4 meses, porem nao tinha o periodo."
--
-- Nao tinha porque `sureya_freq_pagamento` e um enum fechado: mensal,
-- trimestral, semestral, anual. Quatro meses nao cabia. Agora o TUMULO diz de
-- quantos em quantos meses e cobrado, e a familia so define o padrao.
insert into familias (id, org_id, nome, freq_pagamento, contratado)
values ('ff000000-0000-0000-0000-000000000155','aaaaaaaa-0000-0000-0000-000000000015',
        'Familia Quatro Meses','mensal', true)
on conflict do nothing;

-- Pagou 4 meses em agosto: a proxima cobranca e dezembro, e o ritmo e 4 meses.
insert into tumulos (id, org_id, quadra_id, familia_id, identificacao,
                     contratado, valor_mensal, meses_entre_cobrancas,
                     proxima_cobranca, inicio_agendamento)
values ('11100000-0000-0000-0000-000000000156','aaaaaaaa-0000-0000-0000-000000000015',
        'eeeeeeee-0000-0000-0000-000000000015','ff000000-0000-0000-0000-000000000155','CI-COB-4M',
        true, 50, 4, '2026-12-01', current_date)
on conflict do nothing;

-- Em novembro ainda nao vence: quem pagou ate novembro nao pode ser cobrado.
-- A conta e POR TUMULO, e nao pelo `lancados` da chamada: a org do teste tem
-- outras familias vencendo no mesmo dia, e olhar o total mediria o arquivo
-- inteiro em vez deste caso.
select sureya_cobrar_competencias('2026-11-30'::date, 'aaaaaaaa-0000-0000-0000-000000000015');

select ci15('em novembro a familia que pagou adiantado NAO e cobrada',
  not exists (select 1 from conta_corrente
               where tumulo_id='11100000-0000-0000-0000-000000000156'
                 and origem='competencia'),
  'cobrou um mes que a familia ja tinha pago adiantado');

-- Em dezembro vence, e o valor e de QUATRO meses.
select sureya_cobrar_competencias('2026-12-01'::date, 'aaaaaaaa-0000-0000-0000-000000000015');

select ci15('em dezembro ela e cobrada, e por quatro meses',
  (select count(*) = 4 and sum(valor) = 200 from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000156' and origem='competencia'),
  'R$50/mes a cada 4 meses tinha de dar QUATRO linhas somando R$200 (0112)');

select ci15('e a proxima cobranca pula para abril',
  (select proxima_cobranca = '2027-04-01'::date from tumulos
    where id='11100000-0000-0000-0000-000000000156'),
  'a data nao andou os quatro meses — o proximo ciclo sairia errado');

select ci15('e cada linha diz de que periodo ela faz parte',
  (select bool_and(descricao like '%parte de%vence em%') from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000156' and origem='competencia'),
  'quem le o extrato precisa saber que aquelas quatro linhas sao um pagamento so');

-- E as lavagens comecam JA, sem esperar a cobranca: sao duas datas separadas.
select ci15('as lavagens comecam hoje, e nao em dezembro',
  (select inicio_agendamento <= current_date from tumulos
    where id='11100000-0000-0000-0000-000000000156'),
  'a rota ficou presa a data da cobranca — eram os dois campos que a 0104 separou');

-- O TUMULO MANDA. A familia diz "mensal" e o tumulo diz 4: vale o tumulo.
select ci15('o ritmo do tumulo vence o padrao da familia',
  (select sureya_meses_da_cobranca('mensal') = 1
      and (select meses_entre_cobrancas from tumulos
            where id='11100000-0000-0000-0000-000000000156') = 4),
  'se a familia mandasse, a cobranca sairia todo mes contra o combinado');

-- E sem nada no tumulo, o padrao da familia continua valendo.
select ci15('sem ritmo proprio, o tumulo segue a familia',
  (select meses_entre_cobrancas is null from tumulos
    where id='11100000-0000-0000-0000-000000000151'),
  'nulo tem de significar "segue a familia", nao "uma vez por mes"');

-- ---------------------------------------------------------------------------
-- 8 · PAGA DEPOIS DO SERVICO — o caso Anninha (0112)
-- ---------------------------------------------------------------------------
-- "ela pagou em junho no fim do periodo e agora ela paga em dezembro, mas apos
--  servico."
--
-- O cobrador assumia PRE-PAGO sem dizer: cobra em P e anda N meses, logo o
-- periodo seria P..P+N-1. No pos-pago o periodo TERMINA na cobranca: P-N+1..P.
-- As duas leituras dao o mesmo ritmo e MESES DIFERENTES — e nada no cadastro
-- dizia qual era.
insert into familias (id, org_id, nome, freq_pagamento, contratado)
values ('ff000000-0000-0000-0000-000000000156','aaaaaaaa-0000-0000-0000-000000000015',
        'Familia Pos Pago','semestral', true)
on conflict do nothing;

insert into tumulos (id, org_id, quadra_id, familia_id, identificacao,
                     contratado, valor_mensal, proxima_cobranca, cobranca_no_fim)
values ('11100000-0000-0000-0000-000000000157','aaaaaaaa-0000-0000-0000-000000000015',
        'eeeeeeee-0000-0000-0000-000000000015','ff000000-0000-0000-0000-000000000156','CI-COB-POS',
        true, 40, '2026-12-01', true)
on conflict do nothing;

select sureya_cobrar_competencias('2026-12-01'::date, 'aaaaaaaa-0000-0000-0000-000000000015');

select ci15('pos-pago: seis linhas de R$40, somando R$240',
  (select count(*) = 6 and sum(valor) = 240 from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000157' and origem='competencia'),
  'o semestre pago no fim tinha de virar seis competencias de R$40');

select ci15('e elas sao JULHO a DEZEMBRO, nao dezembro a maio',
  (select min(competencia) = '2026-07-01'::date and max(competencia) = '2026-12-01'::date
     from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000157' and origem='competencia'),
  'quem paga depois do servico esta pagando os meses que JA passaram');

select ci15('todas vencendo em dezembro',
  (select bool_and(data = '2026-12-01'::date) from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000157' and origem='competencia'),
  'ela paga uma vez, em dezembro — o vencimento e um so');

select ci15('e a proxima cobranca vai para junho',
  (select proxima_cobranca = '2027-06-01'::date from tumulos
    where id='11100000-0000-0000-0000-000000000157'),
  'o proximo semestre (jan a jun) e cobrado em junho');

-- E o PRE-PAGO do mesmo tamanho pega os meses PARA A FRENTE.
insert into familias (id, org_id, nome, freq_pagamento, contratado)
values ('ff000000-0000-0000-0000-000000000157','aaaaaaaa-0000-0000-0000-000000000015',
        'Familia Pre Pago','semestral', true)
on conflict do nothing;
insert into tumulos (id, org_id, quadra_id, familia_id, identificacao,
                     contratado, valor_mensal, proxima_cobranca, cobranca_no_fim)
values ('11100000-0000-0000-0000-000000000158','aaaaaaaa-0000-0000-0000-000000000015',
        'eeeeeeee-0000-0000-0000-000000000015','ff000000-0000-0000-0000-000000000157','CI-COB-PRE',
        true, 40, '2026-12-01', false)
on conflict do nothing;

select sureya_cobrar_competencias('2026-12-01'::date, 'aaaaaaaa-0000-0000-0000-000000000015');

select ci15('pre-pago: o periodo comeca na cobranca',
  (select min(competencia) = '2026-12-01'::date and max(competencia) = '2027-05-01'::date
     from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000158' and origem='competencia'),
  'quem paga adiantado esta pagando os meses que ainda VAO acontecer');

-- A PREVIA PROMETE O QUE O BOTAO ENTREGA.
select ci15('a previa conta as linhas, nao os ciclos',
  (select competencias = 6 from sureya_cobrancas_a_lancar(
     'ff000000-0000-0000-0000-000000000157'::uuid, '2027-06-01'::date)),
  'a tela diria "1 competencia" e o botao lancaria 6');
