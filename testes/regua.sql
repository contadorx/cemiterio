-- ============================================================================
-- A REGUA DE COBRANCA (0110/0111)
--
-- O risco deste arquivo tem nome: mandar a mesma cobranca duas vezes, ou
-- mandar para quem ja pagou. A fila nao tem desfazer depois de liberada, e do
-- outro lado tem uma familia que enterrou alguem.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci18(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'REGUA FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into orgs (id, nome) values ('aaaaaaaa-0000-0000-0000-000000000018','CI Regua')
on conflict do nothing;
insert into cemiterios (id, org_id, nome)
values ('dddddddd-0000-0000-0000-000000000018','aaaaaaaa-0000-0000-0000-000000000018','CI Cem Regua')
on conflict do nothing;
insert into quadras (id, org_id, cemiterio_id, codigo, ordem)
values ('eeeeeeee-0000-0000-0000-000000000018','aaaaaaaa-0000-0000-0000-000000000018',
        'dddddddd-0000-0000-0000-000000000018','Q Regua', 1)
on conflict do nothing;

-- Uma regua propria, com um degrau em 3 dias depois do vencimento.
insert into regua_degraus (org_id, regua, dias, texto) values
  ('aaaaaaaa-0000-0000-0000-000000000018','padrao', -5,
   'Ola, {nome}. A mensalidade vence em cinco dias.'),
  ('aaaaaaaa-0000-0000-0000-000000000018','padrao', 3,
   'Ola, {nome}. A mensalidade venceu ha alguns dias e ainda nao identifiquei o pagamento.')
on conflict do nothing;

insert into familias (id, org_id, nome) values
  ('ff000000-0000-0000-0000-000000000181','aaaaaaaa-0000-0000-0000-000000000018','Deve Tres Dias'),
  ('ff000000-0000-0000-0000-000000000182','aaaaaaaa-0000-0000-0000-000000000018','Ja Pagou'),
  ('ff000000-0000-0000-0000-000000000183','aaaaaaaa-0000-0000-0000-000000000018','Pediu Para Nao Cobrar')
on conflict do nothing;

insert into clientes (id, org_id, familia_id, nome, telefone, responsavel_financeiro, regua_cobranca) values
  ('cc000000-0000-0000-0000-000000000181','aaaaaaaa-0000-0000-0000-000000000018',
   'ff000000-0000-0000-0000-000000000181','Joana Silva','5511900000181', true, 'padrao'),
  ('cc000000-0000-0000-0000-000000000182','aaaaaaaa-0000-0000-0000-000000000018',
   'ff000000-0000-0000-0000-000000000182','Quem Pagou','5511900000182', true, 'padrao'),
  ('cc000000-0000-0000-0000-000000000183','aaaaaaaa-0000-0000-0000-000000000018',
   'ff000000-0000-0000-0000-000000000183','Nao Cobrar','5511900000183', true, 'nao_cobrar')
on conflict do nothing;

update familias set responsavel_id='cc000000-0000-0000-0000-000000000181' where id='ff000000-0000-0000-0000-000000000181';
update familias set responsavel_id='cc000000-0000-0000-0000-000000000182' where id='ff000000-0000-0000-0000-000000000182';
update familias set responsavel_id='cc000000-0000-0000-0000-000000000183' where id='ff000000-0000-0000-0000-000000000183';

-- O CENARIO E MONTADO EM DATAS FIXAS, e a regua e chamada com o dia explicito.
--
-- Contar a partir de `current_date` faria o teste passar hoje e falhar no dia
-- 2 do mes: nem todo dia do mes tem "tres dias depois do vencimento" dentro do
-- mesmo mes.
--
--   competencia    2026-03-01  o mes PRESTADO
--   data           2026-03-10  o VENCIMENTO, escrito pelo cobrador (0114)
--   degrau +3                  -> cai em 2026-03-13
--   degrau -5                  -> cai em 2026-03-05
--
-- Desde a 0114 a regua conta de `conta_corrente.data`, e nao de uma data
-- derivada da competencia: num contrato pos-pago a competencia de julho vence
-- em dezembro, e a regua velha cobraria em julho. Por isso as linhas abaixo
-- nascem com o vencimento REAL em `data` — e nao com o primeiro do mes.
update orgs set dia_vencimento = 10 where id='aaaaaaaa-0000-0000-0000-000000000018';

insert into conta_corrente (org_id, familia_id, tipo, origem, competencia, valor, descricao, data)
values
 ('aaaaaaaa-0000-0000-0000-000000000018','ff000000-0000-0000-0000-000000000181','debito','competencia','2026-03-01', 30,'contrato','2026-03-10'),
 ('aaaaaaaa-0000-0000-0000-000000000018','ff000000-0000-0000-0000-000000000182','debito','competencia','2026-03-01', 30,'contrato','2026-03-10'),
 ('aaaaaaaa-0000-0000-0000-000000000018','ff000000-0000-0000-0000-000000000183','debito','competencia','2026-03-01', 30,'contrato','2026-03-10')
on conflict do nothing;

-- A segunda ja pagou.
insert into conta_corrente (org_id, familia_id, tipo, origem, competencia, valor, descricao, data)
values ('aaaaaaaa-0000-0000-0000-000000000018','ff000000-0000-0000-0000-000000000182','credito','pagamento','2026-03-01', 30,'pagou','2026-03-11')
on conflict do nothing;

-- ---------------------------------------------------------------------------
select * from sureya_regua_do_dia('2026-03-13'::date, 'aaaaaaaa-0000-0000-0000-000000000018');

select ci18('quem deve ha 3 dias entra na fila',
  exists (select 1 from fila_liberacao
           where familia_id='ff000000-0000-0000-0000-000000000181' and tipo='cobranca'),
  'o degrau de 3 dias nao pegou quem esta devendo');

select ci18('e o texto sai com o PRIMEIRO NOME, nao com {nome}',
  (select texto like 'Ola, Joana.%' from fila_liberacao
    where familia_id='ff000000-0000-0000-0000-000000000181' and tipo='cobranca' limit 1),
  'a chave {nome} chegaria crua na familia');

select ci18('quem JA PAGOU nao recebe nada',
  not exists (select 1 from fila_liberacao
               where familia_id='ff000000-0000-0000-0000-000000000182' and tipo='cobranca'),
  'cobrou quem pagou — o erro que custa a relacao');

select ci18('quem pediu para nao ser cobrado nao recebe',
  not exists (select 1 from fila_liberacao
               where familia_id='ff000000-0000-0000-0000-000000000183' and tipo='cobranca'),
  'a regua "nao_cobrar" foi ignorada');

-- ---------------------------------------------------------------------------
-- RODAR DE NOVO NAO MANDA DE NOVO
-- ---------------------------------------------------------------------------
select ci18('rodar de novo no mesmo dia nao enfileira nada',
  (select enfileirados = 0 from sureya_regua_do_dia('2026-03-13'::date, 'aaaaaaaa-0000-0000-0000-000000000018')),
  'a familia receberia a mesma cobranca duas vezes');

select ci18('e continua havendo UMA mensagem para ela',
  (select count(*) = 1 from fila_liberacao
    where familia_id='ff000000-0000-0000-0000-000000000181' and tipo='cobranca'),
  'duplicou a cobranca na fila');

-- ---------------------------------------------------------------------------
-- A FILA E A PORTA: A REGUA NAO ENVIA
-- ---------------------------------------------------------------------------
select ci18('o que a regua cria fica AGUARDANDO liberacao',
  (select bool_and(status = 'aguardando') from fila_liberacao
    where familia_id='ff000000-0000-0000-0000-000000000181' and tipo='cobranca'),
  'a regua criou algo ja enviado — nao existe caminho daqui para o WhatsApp');

select ci18('e a mensagem lembra de que degrau veio',
  (select degrau_dias = 3 and competencia_ref = '2026-03-01'::date from fila_liberacao
    where familia_id='ff000000-0000-0000-0000-000000000181' and tipo='cobranca' limit 1),
  'sem o degrau gravado, a trava de nao repetir dependeria de comparar textos');

-- ---------------------------------------------------------------------------
-- O AVISO PREVIO — dias NEGATIVOS
-- ---------------------------------------------------------------------------
-- A regua velha so perseguia quem JA devia. O aviso antes do vencimento nao
-- existia em lugar nenhum.
insert into familias (id, org_id, nome)
values ('ff000000-0000-0000-0000-000000000184','aaaaaaaa-0000-0000-0000-000000000018','Vence Em Cinco')
on conflict do nothing;
insert into clientes (id, org_id, familia_id, nome, telefone, responsavel_financeiro, regua_cobranca)
values ('cc000000-0000-0000-0000-000000000184','aaaaaaaa-0000-0000-0000-000000000018',
        'ff000000-0000-0000-0000-000000000184','Antecipada','5511900000184', true, 'padrao')
on conflict do nothing;
update familias set responsavel_id='cc000000-0000-0000-0000-000000000184' where id='ff000000-0000-0000-0000-000000000184';

insert into conta_corrente (org_id, familia_id, tipo, origem, competencia, valor, descricao, data)
values ('aaaaaaaa-0000-0000-0000-000000000018','ff000000-0000-0000-0000-000000000184',
        'debito','competencia','2026-03-01', 30,'contrato','2026-03-10')
on conflict do nothing;

-- Cinco dias ANTES do vencimento (10/03) e o dia 05/03.
select * from sureya_regua_do_dia('2026-03-05'::date, 'aaaaaaaa-0000-0000-0000-000000000018');

select ci18('o aviso previo sai CINCO DIAS ANTES do vencimento',
  exists (select 1 from fila_liberacao
           where familia_id='ff000000-0000-0000-0000-000000000184'
             and tipo='cobranca' and degrau_dias = -5),
  'a cobranca do servico previo nao existe — era o que faltava na regua velha');

-- ---------------------------------------------------------------------------
-- UMA POR FAMILIA POR DIA
-- ---------------------------------------------------------------------------
-- Uma familia com dois tumulos em atraso receberia duas cobrancas na mesma
-- manha, cada uma correta e o conjunto absurdo.
insert into conta_corrente (org_id, familia_id, tipo, origem, competencia, valor, descricao, data)
values ('aaaaaaaa-0000-0000-0000-000000000018','ff000000-0000-0000-0000-000000000184',
        'debito','competencia','2026-04-01', 30,'outro mes','2026-04-10')
on conflict do nothing;

-- 05/04 e "cinco dias antes" da competencia de abril, e o degrau -5 valeria de
-- novo. Mas a familia ja recebeu hoje? Nao: e outro dia. O que se cobra aqui e
-- que DOIS lancamentos no MESMO dia nao viram duas mensagens.
insert into conta_corrente (org_id, familia_id, tipo, origem, competencia, valor, descricao, data)
values ('aaaaaaaa-0000-0000-0000-000000000018','ff000000-0000-0000-0000-000000000184',
        'debito','competencia','2026-05-01', 30,'terceiro mes','2026-05-10')
on conflict do nothing;

select * from sureya_regua_do_dia('2026-04-05'::date, 'aaaaaaaa-0000-0000-0000-000000000018');

select ci18('dois lancamentos no mesmo dia viram UMA mensagem',
  (select count(*) = 1 from fila_liberacao
    where familia_id='ff000000-0000-0000-0000-000000000184' and tipo='cobranca'
      and criado_em::date = current_date and degrau_dias = -5
      and competencia_ref = '2026-04-01'::date),
  'a familia receberia uma cobranca por lancamento na mesma manha');

-- ---------------------------------------------------------------------------
-- OS DEGRAUS SAO EDITAVEIS, E E O PONTO
-- ---------------------------------------------------------------------------
select ci18('os degraus vivem no BANCO, nao no codigo',
  (select count(*) >= 2 from regua_degraus
    where org_id='aaaaaaaa-0000-0000-0000-000000000018'),
  'a regua voltou a ser uma lista fixa dentro do TypeScript');

update regua_degraus set ativo = false
 where org_id='aaaaaaaa-0000-0000-0000-000000000018' and dias = 3;

select ci18('desligar um degrau o tira do ar sem apagar o texto',
  (select texto is not null and not ativo from regua_degraus
    where org_id='aaaaaaaa-0000-0000-0000-000000000018' and dias = 3),
  'sem a chave `ativo`, ajustar a regua exigiria apagar o que foi escrito');

-- ---------------------------------------------------------------------------
-- CONTATO SEM TELEFONE (0116)
-- ---------------------------------------------------------------------------
-- A familia existe, deve, e nao ha para onde mandar. Isso e problema de
-- CADASTRO — e nao pode virar uma mensagem sem destino na fila, que so
-- falharia na hora do envio, no meio de um lote e em silencio.
insert into familias (id, org_id, nome)
values ('ff000000-0000-0000-0000-000000000185','aaaaaaaa-0000-0000-0000-000000000018','Sem Telefone')
on conflict do nothing;

-- O CADASTRO ACEITA. Era isto que o NOT NULL impedia, e a prova de que a
-- regra ja estava sendo contornada era um cadastro com telefone = '' em
-- producao.
insert into clientes (id, org_id, familia_id, nome, telefone, responsavel_financeiro, regua_cobranca)
values ('cc000000-0000-0000-0000-000000000185','aaaaaaaa-0000-0000-0000-000000000018',
        'ff000000-0000-0000-0000-000000000185','Filho Que Mora Fora', null, true, 'padrao')
on conflict do nothing;
update familias set responsavel_id='cc000000-0000-0000-0000-000000000185'
 where id='ff000000-0000-0000-0000-000000000185';

select ci18('da para salvar um contato SEM telefone',
  (select telefone is null from clientes where id='cc000000-0000-0000-0000-000000000185'),
  'o NOT NULL obrigava a inventar um numero — e numero inventado numa allowlist e pior que campo vazio');

-- E O SEGUNDO TAMBEM. Este e o caso que o '' de contorno quebrava: duas
-- strings vazias colidem no indice unico (org_id, telefone); dois nulos, nao.
insert into clientes (id, org_id, familia_id, nome, telefone)
values ('cc000000-0000-0000-0000-000000000186','aaaaaaaa-0000-0000-0000-000000000018',
        'ff000000-0000-0000-0000-000000000185','Irma Que Decide', null)
on conflict do nothing;

select ci18('e o SEGUNDO sem telefone tambem entra',
  (select count(*) = 2 from clientes
    where familia_id='ff000000-0000-0000-0000-000000000185' and telefone is null),
  'com string vazia o segundo seria recusado por telefone repetido — sem telefone nenhum');

insert into conta_corrente (org_id, familia_id, tipo, origem, competencia, valor, descricao, data)
values ('aaaaaaaa-0000-0000-0000-000000000018','ff000000-0000-0000-0000-000000000185',
        'debito','competencia','2026-06-01', 30,'contrato','2026-06-10')
on conflict do nothing;

-- Cinco dias antes de 10/06 e o dia 05/06. O degrau +3 foi DESLIGADO mais
-- acima neste arquivo, entao contar com ele aqui daria "sem degrau" e o teste
-- passaria pelo motivo errado.
select * from sureya_regua_do_dia('2026-06-05'::date, 'aaaaaaaa-0000-0000-0000-000000000018');

select ci18('quem nao tem telefone NAO entra na fila',
  not exists (select 1 from fila_liberacao
               where familia_id='ff000000-0000-0000-0000-000000000185'),
  'entraria uma cobranca sem destino, que so falha na hora do envio');

select ci18('mas ela e CONTADA, para o cadastro poder ser consertado',
  (select sem_telefone >= 1 from sureya_regua_do_dia(
     '2026-06-05'::date, 'aaaaaaaa-0000-0000-0000-000000000018')),
  'sumir em silencio e o mesmo defeito da fila antiga: ninguem descobre');
