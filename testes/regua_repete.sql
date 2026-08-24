-- ============================================================================
-- A REGUA NAO EMUDECE AOS TRINTA DIAS (0130)
--
-- O defeito consertado aqui nao dava erro: a regua simplesmente parava de
-- falar no dia 31 e ninguem via. Entao o risco de CONSERTAR errado tem a
-- mesma cara — algo que passa a falar demais, ou de menos, calado.
--
-- Quatro riscos, e um teste para cada:
--   1. a repeticao engolir os degraus normais (-5, -1, 3, 10, 20);
--   2. a repeticao virar perseguicao, repetindo todo dia;
--   3. a repeticao atropelar o adiamento da 0124 e o `nao_cobrar`;
--   4. a repeticao mandar mensagem para quem ja pagou.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci30(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'REGUA FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into orgs (id, nome, dia_vencimento) values
  ('a0300000-0000-0000-0000-000000000001','CI Regua', 10) on conflict do nothing;
insert into familias (id, org_id, nome, contratado) values
  ('f0300000-0000-0000-0000-000000000001','a0300000-0000-0000-0000-000000000001','Familia CI Repete', true),
  ('f0300000-0000-0000-0000-000000000002','a0300000-0000-0000-0000-000000000001','Familia CI Adiada', true),
  ('f0300000-0000-0000-0000-000000000003','a0300000-0000-0000-0000-000000000001','Familia CI Quitada', true)
on conflict do nothing;

insert into clientes (id, org_id, familia_id, nome, telefone) values
 ('c0300000-0000-0000-0000-000000000001','a0300000-0000-0000-0000-000000000001',
  'f0300000-0000-0000-0000-000000000001','Contato Repete','11990000001'),
 ('c0300000-0000-0000-0000-000000000002','a0300000-0000-0000-0000-000000000001',
  'f0300000-0000-0000-0000-000000000002','Contato Adiada','11990000002'),
 ('c0300000-0000-0000-0000-000000000003','a0300000-0000-0000-0000-000000000001',
  'f0300000-0000-0000-0000-000000000003','Contato Quitada','11990000003')
on conflict do nothing;

update familias set responsavel_id = 'c0300000-0000-0000-0000-000000000001'
 where id = 'f0300000-0000-0000-0000-000000000001';
update familias set responsavel_id = 'c0300000-0000-0000-0000-000000000002'
 where id = 'f0300000-0000-0000-0000-000000000002';
update familias set responsavel_id = 'c0300000-0000-0000-0000-000000000003'
 where id = 'f0300000-0000-0000-0000-000000000003';

select ci30('o cenario foi criado mesmo (ids nao colidiram com outro teste)',
  (select count(*) from familias where org_id='a0300000-0000-0000-0000-000000000001') = 3,
  'on conflict do nothing engole colisao em silencio');

-- A regua do teste: um degrau normal aos 10 e o ultimo aos 30, que repete.
insert into regua_degraus (org_id, regua, dias, texto, ativo, repetir_a_cada) values
 ('a0300000-0000-0000-0000-000000000001','padrao', 10,'Ola, {nome}. Venceu ha dez dias.', true, null),
 ('a0300000-0000-0000-0000-000000000001','padrao', 30,'Ola, {nome}. Segue em aberto — me diga como prefere seguir.', true, 30);

-- ---------------------------------------------------------------------------
-- 1. O DEGRAU NORMAL CONTINUA SENDO DIA EXATO
-- ---------------------------------------------------------------------------
-- Uma divida de 10 dias tem de casar com o degrau 10, e NAO com o de 30 que
-- repete. Se a repeticao ganhasse, a familia ouviria o texto errado.
insert into conta_corrente
  (id, org_id, familia_id, tipo, origem, valor, data, competencia, status_conc, descricao)
values ('cc300000-0000-0000-0000-000000000001','a0300000-0000-0000-0000-000000000001',
        'f0300000-0000-0000-0000-000000000001','debito','competencia', 100,
        current_date - 10, date_trunc('month', current_date - 10)::date, 'confirmado','CI 10 dias');

-- A CHAMADA E A LEITURA EM PASSOS SEPARADOS.
-- Juntar as duas numa expressao so deixa a ordem de avaliacao por conta do
-- planejador: a leitura da fila pode acontecer ANTES da funcao escrever nela,
-- e o teste reprova um codigo correto. Foi o que aconteceu na primeira versao
-- deste arquivo.
select enfileirados from sureya_regua_do_dia(current_date,'a0300000-0000-0000-0000-000000000001') \gset r_

select ci30('divida de 10 dias cai no degrau de 10, nao no que repete',
  (select texto like '%dez dias%' from fila_liberacao
    where familia_id='f0300000-0000-0000-0000-000000000001'
    order by criado_em desc limit 1),
  'exato tem de ganhar de repeticao, senao a familia ouve o texto errado');

-- ---------------------------------------------------------------------------
-- 2. PASSADO DO ULTIMO DEGRAU, A REGUA VOLTA A FALAR — era o defeito inteiro
-- ---------------------------------------------------------------------------
delete from fila_liberacao where org_id='a0300000-0000-0000-0000-000000000001';
update conta_corrente set data = current_date - 379,
       competencia = date_trunc('month', current_date - 379)::date
 where id = 'cc300000-0000-0000-0000-000000000001';

select ci30('divida de 379 dias volta a gerar cobranca',
  (select enfileirados from sureya_regua_do_dia(current_date,'a0300000-0000-0000-0000-000000000001')) = 1,
  'ANTES DA 0130 ISTO ERA ZERO: passou de 30, a regua emudecia para sempre');

select ci30('e o texto e o do ultimo degrau',
  (select texto like '%como prefere seguir%' from fila_liberacao
    where familia_id='f0300000-0000-0000-0000-000000000001' order by criado_em desc limit 1), '');

-- ---------------------------------------------------------------------------
-- 3. NAO REPETE TODO DIA — o intervalo e o freio
-- ---------------------------------------------------------------------------
select ci30('no dia seguinte NAO sai outra',
  (select repetidos from sureya_regua_do_dia(current_date + 1,'a0300000-0000-0000-0000-000000000001')) = 1,
  'cobrar todo dia deixa de ser cobranca e vira perseguicao');

select ci30('e a fila continua com uma so',
  (select count(*) from fila_liberacao
    where familia_id='f0300000-0000-0000-0000-000000000001' and tipo='cobranca') = 1, '');

-- Trinta dias depois, volta.
select ci30('trinta dias depois, volta a falar',
  (select enfileirados from sureya_regua_do_dia(current_date + 30,'a0300000-0000-0000-0000-000000000001')) = 1,
  'o intervalo cumpriu-se: e hora de falar de novo');

-- ---------------------------------------------------------------------------
-- 4. O INTERVALO CONTA DESDE A ULTIMA CONVERSA, NAO DE UMA DATA FIXA
-- ---------------------------------------------------------------------------
-- E a diferenca entre intervalo e modulo. Com modulo, um dia de rotina perdido
-- custaria um mes inteiro de silencio. Aqui, o dia seguinte ao intervalo serve.
delete from fila_liberacao where org_id='a0300000-0000-0000-0000-000000000001';
insert into fila_liberacao (org_id, familia_id, cliente_id, tipo, texto, status, criado_em)
values ('a0300000-0000-0000-0000-000000000001','f0300000-0000-0000-0000-000000000001',
        'c0300000-0000-0000-0000-000000000001','cobranca','conversa antiga','aguardando',
        now() - interval '45 days');

select ci30('rotina que falhou no dia certo nao custa um mes de silencio',
  (select enfileirados from sureya_regua_do_dia(current_date,'a0300000-0000-0000-0000-000000000001')) = 1,
  'com modulo, so voltaria a falar no proximo multiplo exato');

-- ---------------------------------------------------------------------------
-- 5. A REPETICAO NAO ATROPELA O ADIAMENTO (0124) NEM QUEM JA PAGOU
-- ---------------------------------------------------------------------------
insert into conta_corrente
  (id, org_id, familia_id, tipo, origem, valor, data, competencia, status_conc, descricao)
values ('cc300000-0000-0000-0000-000000000002','a0300000-0000-0000-0000-000000000001',
        'f0300000-0000-0000-0000-000000000002','debito','competencia', 100,
        current_date - 200, date_trunc('month', current_date - 200)::date, 'confirmado','CI adiada'),
       ('cc300000-0000-0000-0000-000000000003','a0300000-0000-0000-0000-000000000001',
        'f0300000-0000-0000-0000-000000000003','debito','competencia', 100,
        current_date - 200, date_trunc('month', current_date - 200)::date, 'confirmado','CI quitada'),
       ('cc300000-0000-0000-0000-000000000004','a0300000-0000-0000-0000-000000000001',
        'f0300000-0000-0000-0000-000000000003','credito','pagamento', 100,
        current_date - 1, date_trunc('month', current_date - 1)::date, 'confirmado','CI pagou tudo');

-- a familia adiada combinou uma data la na frente
insert into fila_liberacao (org_id, familia_id, cliente_id, tipo, texto, status, adiada_para)
values ('a0300000-0000-0000-0000-000000000001','f0300000-0000-0000-0000-000000000002',
        'c0300000-0000-0000-0000-000000000002','cobranca','combinado','aguardando',
        current_date + 15);

delete from fila_liberacao
 where familia_id = 'f0300000-0000-0000-0000-000000000001';

select ci30('quem combinou uma data nao e alcancado pela repeticao',
  (select adiados from sureya_regua_do_dia(current_date,'a0300000-0000-0000-0000-000000000001')) >= 1,
  'a repeticao nao pode furar o combinado da 0124');

select ci30('e quem ja pagou nao recebe cobranca de 200 dias',
  (select count(*) from fila_liberacao
    where familia_id='f0300000-0000-0000-0000-000000000003' and tipo='cobranca') = 0,
  'saldo zerado manda mais que idade da divida');

-- ---------------------------------------------------------------------------
-- 6. O PISO DE SETE DIAS
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into regua_degraus (org_id, regua, dias, texto, ativo, repetir_a_cada)
    values ('a0300000-0000-0000-0000-000000000001','padrao', 60,'x', true, 3);
    raise exception 'REGUA FALHOU — aceitou repetir a cada 3 dias';
  exception when check_violation then
    raise notice '  ok  repetir a cada 3 dias e recusado pelo banco';
  end;
end $$;

drop function ci30(text, boolean, text);
