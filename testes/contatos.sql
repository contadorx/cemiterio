-- ============================================================================
-- O CONTATO DO SITE TEM PARA ONDE IR
--
-- O que se mediu antes: o formulario grava em `leads` e avisa apontando para
-- `/painel/leads/<id>`, que o middleware devolve 404 desde que o CRM foi
-- desligado. Um contato podia ficar so no banco.
--
-- Este arquivo cobra a FILA: quem esta esperando, ha quanto tempo, e o que a
-- casa ja deveria ter feito.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci7(nome text, real_ text, esperado text) returns void
language plpgsql as $$
begin
  if real_ is distinct from esperado then
    raise exception 'CONTATOS FALHOU — %: veio [%], esperado [%]', nome, real_, esperado;
  end if;
  raise notice '  ok  %', nome;
end $$;

create or replace function ci7b(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'CONTATOS FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into orgs (id, nome) values ('aaaaaaaa-0000-0000-0000-000000000007','CI Contatos')
  on conflict do nothing;

-- Cinco situacoes que a fila precisa distinguir.
insert into leads (id, org_id, telefone, nome, nome_wa, status, origem, created_at,
                   tentativas, ignorado, proximo_passo, cemiterio_interesse) values
  -- 1) chegou agora, ninguem tentou: esta na fila, e NAO e atraso
  ('11111111-0000-0000-0000-000000000071','aaaaaaaa-0000-0000-0000-000000000007',
   '5511900000071','Recem Chegada',null,'novo','site', now() - interval '2 hours',
   0, false, null, 'da-saudade'),
  -- 2) chegou ontem e ninguem tentou: ATRASADO
  ('11111111-0000-0000-0000-000000000072','aaaaaaaa-0000-0000-0000-000000000007',
   '5511900000072','Esquecida',null,'novo','site', now() - interval '30 hours',
   0, false, null, null),
  -- 3) velha, mas ja se tentou falar duas vezes: nao e atraso da casa
  ('11111111-0000-0000-0000-000000000073','aaaaaaaa-0000-0000-0000-000000000007',
   '5511900000073','Ja Tentada',null,'novo','site', now() - interval '5 days',
   2, false, current_date + 3, null),
  -- 4) com data marcada que ja passou: VENCIDA
  ('11111111-0000-0000-0000-000000000074','aaaaaaaa-0000-0000-0000-000000000007',
   '5511900000074','Prometida',null,'novo','site', now() - interval '10 days',
   1, false, current_date - 1, null),
  -- 5) descartada de proposito: fora da fila
  ('11111111-0000-0000-0000-000000000075','aaaaaaaa-0000-0000-0000-000000000007',
   '5511900000075','Nao Era',null,'descartado','site', now() - interval '1 day',
   1, false, null, null),
  -- 6) ignorada (spam): tambem fora da fila
  ('11111111-0000-0000-0000-000000000076','aaaaaaaa-0000-0000-0000-000000000007',
   '5511900000076','Robo',null,'novo','site', now() - interval '1 day',
   0, true, null, null);

select ci7('a fila tem so quem ainda espera',
  (select count(*)::text from sureya_contatos_pendentes
    where org_id='aaaaaaaa-0000-0000-0000-000000000007'), '4');

select ci7b('descartada nao aparece',
  (select count(*) = 0 from sureya_contatos_pendentes
    where id='11111111-0000-0000-0000-000000000075'),
  'contato descartado voltou para a fila');

select ci7b('ignorada nao aparece',
  (select count(*) = 0 from sureya_contatos_pendentes
    where id='11111111-0000-0000-0000-000000000076'),
  'spam marcado como ignorado voltou para a fila');

-- ATRASO E O QUE A CASA PROMETEU E NAO CUMPRIU, nao o que e velho. O site diz
-- "respondemos no mesmo dia": duas horas nao e atraso, trinta horas sem
-- ninguem tentar e.
select ci7b('duas horas nao e atraso',
  (select not atrasado from sureya_contatos_pendentes
    where id='11111111-0000-0000-0000-000000000071'),
  'contato de duas horas foi marcado como atrasado');

select ci7b('trinta horas sem ninguem tentar E atraso',
  (select atrasado from sureya_contatos_pendentes
    where id='11111111-0000-0000-0000-000000000072'),
  'contato de ontem sem tentativa nenhuma nao foi marcado');

select ci7b('cinco dias COM tentativa nao e atraso da casa',
  (select not atrasado from sureya_contatos_pendentes
    where id='11111111-0000-0000-0000-000000000073'),
  'quem ja foi procurado duas vezes ficou marcado como esquecido');

-- E A DATA PROMETIDA. Uma coisa e nao ter respondido; outra e ter dito "te
-- ligo terca" e a terca ter passado.
select ci7b('a data marcada que passou aparece como vencida',
  (select vencido from sureya_contatos_pendentes
    where id='11111111-0000-0000-0000-000000000074'),
  'a promessa venceu e a fila nao avisou');

select ci7b('data marcada no futuro nao esta vencida',
  (select not vencido from sureya_contatos_pendentes
    where id='11111111-0000-0000-0000-000000000073'),
  'marcou para daqui a tres dias e ja apareceu como vencida');

-- HORAS, e nao dias: em dias, um contato de seis horas apareceria como zero, e
-- "0" ao lado de um nome nao diz nada a quem esta olhando a fila de manha.
select ci7b('a espera e contada em horas',
  (select horas_esperando between 29 and 31 from sureya_contatos_pendentes
    where id='11111111-0000-0000-0000-000000000072'),
  'a conta de horas nao bateu');

select ci7('o cemiterio que a pessoa disse fica guardado',
  (select cemiterio_interesse from sureya_contatos_pendentes
    where id='11111111-0000-0000-0000-000000000071'), 'da-saudade');

do $$ begin raise notice 'CONTATOS: todas as conferencias passaram'; end $$;
