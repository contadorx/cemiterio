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
                     contratado, valor_mensal, inicio_cobranca, proxima_cobranca, cobranca_no_fim)
values ('11100000-0000-0000-0000-000000000157','aaaaaaaa-0000-0000-0000-000000000015',
        'eeeeeeee-0000-0000-0000-000000000015','ff000000-0000-0000-0000-000000000156','CI-COB-POS',
        true, 40, '2026-07-01', '2026-12-01', true)
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

-- O VENCIMENTO E UM SO, e nao e o primeiro de dezembro: e o DIA COMBINADO da
-- casa (`orgs.dia_vencimento`, padrao 10). Desde a 0114 quem escreve essa data
-- e o cobrador, e e dela que a regua e a inadimplencia contam.
select ci15('todas vencendo no dia combinado de dezembro',
  (select bool_and(data = '2026-12-10'::date) from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000157' and origem='competencia'),
  'ela paga uma vez, em dezembro — o vencimento e um so, no dia da casa');

select ci15('competencia e vencimento sao COISAS DIFERENTES na mesma linha',
  (select bool_and(competencia <> data) from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000157' and origem='competencia'
      and competencia <> '2026-12-01'::date),
  'julho vencendo em julho e o erro que fazia a Anninha nascer inadimplente');

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
                     contratado, valor_mensal, inicio_cobranca, proxima_cobranca, cobranca_no_fim)
values ('11100000-0000-0000-0000-000000000158','aaaaaaaa-0000-0000-0000-000000000015',
        'eeeeeeee-0000-0000-0000-000000000015','ff000000-0000-0000-0000-000000000157','CI-COB-PRE',
        true, 40, '2026-12-01', '2026-12-01', false)
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

-- ---------------------------------------------------------------------------
-- 9 · O MES PRESTADO NASCE QUANDO E PRESTADO (0114)
-- ---------------------------------------------------------------------------
-- "da anninha nao deveria lancar os periodos na competencia e somente nao
--  deixar ela inadimplente?"
--
-- Sim — e ate aqui o razao dela ficava VAZIO ate dezembro. Julho e agosto ja
-- foram prestados: a receita e de julho e de agosto. O que nao pode e chamar
-- isso de divida antes do dia 10 de dezembro.
--
-- E a mesma distorcao da 0112 invertida: em vez de seis meses empilhados em
-- dezembro, cinco meses SUMIDOS ate la.
insert into familias (id, org_id, nome, freq_pagamento, contratado)
values ('ff000000-0000-0000-0000-000000000158','aaaaaaaa-0000-0000-0000-000000000015',
        'Familia Anninha','semestral', true)
on conflict do nothing;

insert into tumulos (id, org_id, quadra_id, familia_id, identificacao,
                     contratado, valor_mensal, inicio_cobranca, proxima_cobranca, cobranca_no_fim)
values ('11100000-0000-0000-0000-000000000159','aaaaaaaa-0000-0000-0000-000000000015',
        'eeeeeeee-0000-0000-0000-000000000015','ff000000-0000-0000-0000-000000000158','CI-COB-ACUM',
        true, 40, '2026-07-01', '2026-12-01', true)
on conflict do nothing;

-- Estamos em AGOSTO. A cobranca so acontece em dezembro.
select sureya_cobrar_competencias('2026-08-23'::date, 'aaaaaaaa-0000-0000-0000-000000000015');

select ci15('em agosto ja existem JULHO e AGOSTO, e mais nada',
  (select count(*) = 2
      and min(competencia) = '2026-07-01'::date
      and max(competencia) = '2026-08-01'::date
     from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000159' and origem='competencia'),
  'ou o razao fica vazio ate dezembro, ou setembro nasce antes de acontecer');

select ci15('e as duas vencem la em dezembro',
  (select bool_and(data = '2026-12-10'::date) from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000159' and origem='competencia'),
  'lancar a competencia sem empurrar o vencimento e criar um inadimplente');

select ci15('logo ela NAO deve nada hoje',
  (select coalesce(sum(case when data <= '2026-08-23'::date
                            then case when tipo='debito' then valor else -valor end
                            else 0 end), 0) = 0
     from conta_corrente where familia_id='ff000000-0000-0000-0000-000000000158'),
  'era exatamente isto: lancar os periodos e nao deixa-la inadimplente');

select ci15('mas os R$ 80 estao la, lancados',
  (select sum(valor) = 80 from conta_corrente
    where familia_id='ff000000-0000-0000-0000-000000000158' and tipo='debito'),
  'tirar a Anninha da inadimplencia nao pode faze-la sumir do painel');

select ci15('a proxima cobranca NAO andou — o periodo ainda esta aberto',
  (select proxima_cobranca = '2026-12-01'::date from tumulos
    where id='11100000-0000-0000-0000-000000000159'),
  'se a data anda a cada mes prestado, o semestre vira seis semestres');

-- RODAR DE NOVO NO MESMO MES NAO DUPLICA, e o mes seguinte entra sozinho.
select sureya_cobrar_competencias('2026-08-30'::date, 'aaaaaaaa-0000-0000-0000-000000000015');
select ci15('rodar de novo em agosto continua dando duas linhas',
  (select count(*) = 2 from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000159' and origem='competencia'),
  'o cobrador roda todo dia no cron: repetir tem de ser inofensivo');

select sureya_cobrar_competencias('2026-09-05'::date, 'aaaaaaaa-0000-0000-0000-000000000015');
select ci15('em setembro entra setembro, e so',
  (select count(*) = 3 and max(competencia) = '2026-09-01'::date from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000159' and origem='competencia'),
  'cada mes prestado vira receita no proprio mes');

-- E EM DEZEMBRO O PERIODO FECHA: as seis existem e a data anda.
select sureya_cobrar_competencias('2026-12-11'::date, 'aaaaaaaa-0000-0000-0000-000000000015');
select ci15('em dezembro o semestre esta completo, sem repetir os tres primeiros',
  (select count(*) = 6 and sum(valor) = 240 from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000159' and origem='competencia'),
  'julho, agosto e setembro ja existiam: relanca-los dobraria a conta dela');

select ci15('e ai sim a proxima cobranca anda para junho',
  (select proxima_cobranca = '2027-06-01'::date from tumulos
    where id='11100000-0000-0000-0000-000000000159'),
  'a data so anda quando o periodo fecha');

-- A MESMA LINHA MUDA DE LADO QUANDO A DATA PASSA — e ninguem a reescreve.
select ci15('antes do dia 10 de dezembro ela nao deve; depois, deve os R$ 240',
  (select coalesce(sum(case when data <= '2026-12-09'::date
                            then case when tipo='debito' then valor else -valor end
                            else 0 end), 0) = 0
      and coalesce(sum(case when data <= '2026-12-10'::date
                            then case when tipo='debito' then valor else -valor end
                            else 0 end), 0) = 240
     from conta_corrente where familia_id='ff000000-0000-0000-0000-000000000158'),
  'e o vencimento que decide, e nao um estado gravado que alguem precisa virar');

-- ---------------------------------------------------------------------------
-- E A VIEW `saldo_familia` FAZ ESSA CONTA (0114)
-- ---------------------------------------------------------------------------
-- Datas RELATIVAS a hoje, de proposito: esta e a unica parte do arquivo que
-- depende de `current_date`, porque a view tambem depende.
insert into familias (id, org_id, nome)
values ('ff000000-0000-0000-0000-000000000159','aaaaaaaa-0000-0000-0000-000000000015','Familia Dois Lados')
on conflict do nothing;

insert into conta_corrente (org_id, familia_id, tipo, origem, competencia, valor, descricao, data)
values
 ('aaaaaaaa-0000-0000-0000-000000000015','ff000000-0000-0000-0000-000000000159',
  'debito','competencia', date_trunc('month', current_date)::date, 50,'ja vencida', current_date - 30),
 ('aaaaaaaa-0000-0000-0000-000000000015','ff000000-0000-0000-0000-000000000159',
  'debito','competencia', date_trunc('month', current_date)::date, 70,'ainda vai vencer', current_date + 30)
on conflict do nothing;

select ci15('a view separa o VENCIDO do A VENCER',
  (select vencido = 50 and a_vencer = 70 and saldo = 120 from saldo_familia
    where familia_id='ff000000-0000-0000-0000-000000000159'),
  'quem pergunta "inadimplente?" le `vencido`; `saldo` continua a posicao inteira');

insert into conta_corrente (org_id, familia_id, tipo, origem, competencia, valor, descricao, data)
values ('aaaaaaaa-0000-0000-0000-000000000015','ff000000-0000-0000-0000-000000000159',
        'credito','pagamento', date_trunc('month', current_date)::date, 50,'pagou a vencida', current_date)
on conflict do nothing;

select ci15('e um pagamento abate o vencido, nao o futuro',
  (select vencido = 0 and a_vencer = 70 from saldo_familia
    where familia_id='ff000000-0000-0000-0000-000000000159'),
  'credito de hoje tem de encostar na divida de hoje');

-- ---------------------------------------------------------------------------
-- 10 · O PERIODO COMECA ONDE A COBRANCA COMECA (0115)
-- ---------------------------------------------------------------------------
-- "ela pagou junho, pos, agora ele tem que lancar julho e agosto e cobrar em
--  setembro."
--
-- O CASO MAGDA. Paga a cada 2 meses, DEPOIS do servico, e a cobranca dela
-- comecou em julho. O cobrador contava N meses PARA TRAS a partir da data de
-- pagar, e por isso lancava agosto e setembro: certo pela aritmetica, errado
-- pelo combinado.
--
-- Os dois campos existiam. Um deles nao era lido por ninguem:
--   inicio_cobranca   ONDE O PERIODO COMECA
--   proxima_cobranca  QUANDO ELA PAGA
insert into familias (id, org_id, nome, contratado)
values ('ff000000-0000-0000-0000-000000000160','aaaaaaaa-0000-0000-0000-000000000015',
        'Familia Magda', true)
on conflict do nothing;

insert into tumulos (id, org_id, quadra_id, familia_id, identificacao,
                     contratado, valor_mensal, inicio_cobranca, proxima_cobranca,
                     meses_entre_cobrancas, cobranca_no_fim)
values ('11100000-0000-0000-0000-000000000160','aaaaaaaa-0000-0000-0000-000000000015',
        'eeeeeeee-0000-0000-0000-000000000015','ff000000-0000-0000-0000-000000000160','CI-COB-MAGDA',
        true, 100, '2026-07-01', '2026-09-01', 2, true)
on conflict do nothing;

-- A PREVIA PROMETE ANTES DE O BOTAO FAZER. Ela roda primeiro de proposito:
-- se ela cobrasse de verdade, o teste seguinte passaria por acidente.
select ci15('a previa promete JULHO e AGOSTO, e nao agosto e setembro',
  (select competencias = 2 and valor = 200 and desde = '2026-07-01'::date
     from sureya_cobrancas_a_lancar(
       'ff000000-0000-0000-0000-000000000160'::uuid, '2026-08-23'::date)),
  'a tela prometeria um periodo e o botao lancaria outro');

select ci15('e a previa NAO cobrou nada ao ser consultada',
  (select count(*) = 0 from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000160'),
  'abrir a ficha nao pode criar divida — o ensaio tem de desfazer');

select sureya_cobrar_competencias('2026-08-23'::date, 'aaaaaaaa-0000-0000-0000-000000000015');

select ci15('o botao lanca JULHO e AGOSTO',
  (select count(*) = 2
      and min(competencia) = '2026-07-01'::date
      and max(competencia) = '2026-08-01'::date
     from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000160' and origem='competencia'),
  'contar para tras a partir da data de pagar dava agosto e setembro');

select ci15('e os dois vencem em SETEMBRO, no dia da casa',
  (select bool_and(data = '2026-09-10'::date) from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000160' and origem='competencia'),
  'ela paga uma vez, em setembro — o periodo inteiro tem um vencimento so');

select ci15('logo ela NAO esta inadimplente hoje',
  (select coalesce(sum(case when data <= '2026-08-23'::date
                            then case when tipo='debito' then valor else -valor end
                            else 0 end), 0) = 0
     from conta_corrente where familia_id='ff000000-0000-0000-0000-000000000160'),
  'o servico ja foi prestado, mas a hora de pagar ainda nao chegou');

select ci15('e a proxima cobranca anda para NOVEMBRO',
  (select proxima_cobranca = '2026-11-01'::date from tumulos
    where id='11100000-0000-0000-0000-000000000160'),
  'o ciclo fechou quando agosto foi prestado: set+out se pagam em novembro');

-- E O CICLO SEGUINTE COMECA ONDE O ANTERIOR PAROU, sem repetir nem pular.
select sureya_cobrar_competencias('2026-09-15'::date, 'aaaaaaaa-0000-0000-0000-000000000015');

select ci15('em setembro entra setembro, vencendo em novembro',
  (select count(*) = 3
      and max(competencia) = '2026-09-01'::date
      and (select data from conta_corrente
            where tumulo_id='11100000-0000-0000-0000-000000000160'
              and competencia='2026-09-01') = '2026-11-10'::date
     from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000160' and origem='competencia'),
  'o periodo novo tem de comecar em setembro e vencer na cobranca dele');

select ci15('e julho e agosto continuam vencendo em setembro',
  (select count(*) = 2 from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000160'
      and competencia <= '2026-08-01' and data = '2026-09-10'::date),
  'mexer no ciclo novo nao pode reescrever o vencimento do ciclo fechado');

-- A ANCORA NAO SE MOVE, e e isso que deixa a Sureya corrigir um lancamento
-- errado sem desalinhar todo o contrato para sempre.
select ci15('inicio_cobranca continua sendo julho',
  (select inicio_cobranca = '2026-07-01'::date from tumulos
    where id='11100000-0000-0000-0000-000000000160'),
  'a ancora tem de ficar parada: e ela que diz onde a cobranca comecou');

-- A ANCORA E COISA DO POS-PAGO, E SO DELE.
--
-- Este caso e a AUREA de producao: contrato antigo (dez/2025), cobrada por
-- fora ate agora, mensal, pre-pago, proxima cobranca em agosto. Ler a ancora
-- aqui lancaria a competencia de DEZEMBRO DE 2025 vencendo em agosto de 2026 —
-- receita no mes errado, e o atraso pingando um mes por vez.
insert into familias (id, org_id, nome, contratado)
values ('ff000000-0000-0000-0000-000000000161','aaaaaaaa-0000-0000-0000-000000000015',
        'Familia Aurea', true)
on conflict do nothing;

insert into tumulos (id, org_id, quadra_id, familia_id, identificacao,
                     contratado, valor_mensal, inicio_cobranca, proxima_cobranca,
                     cobranca_no_fim)
values ('11100000-0000-0000-0000-000000000161','aaaaaaaa-0000-0000-0000-000000000015',
        'eeeeeeee-0000-0000-0000-000000000015','ff000000-0000-0000-0000-000000000161','CI-COB-AUREA',
        true, 40, '2025-12-01', '2026-08-01', false)
on conflict do nothing;

select sureya_cobrar_competencias('2026-08-23'::date, 'aaaaaaaa-0000-0000-0000-000000000015');

select ci15('pre-pago com contrato antigo cobra AGOSTO, nao dezembro de 2025',
  (select count(*) = 1 and min(competencia) = '2026-08-01'::date
     from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000161' and origem='competencia'),
  'a ancora do pos-pago aplicada no pre-pago poe receita oito meses atras');

select ci15('e vence no dia da casa em agosto',
  (select data = '2026-08-10'::date from conta_corrente
    where tumulo_id='11100000-0000-0000-0000-000000000161' and origem='competencia'),
  'quem paga adiantado deve na data em que paga');
