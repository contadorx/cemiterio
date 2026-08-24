-- ============================================================================
-- A RUA APRENDE, E O ROTEIRO SE REFAZ (0125)
--
-- Dois riscos, os dois caros:
--
--   1. o refazer levar junto o que NAO podia — a lavagem de hoje que a Nina ja
--      abriu no celular, a que ela ja comecou, a que tem foto, a que uma pessoa
--      remarcou a mao. Qualquer uma dessas some do lugar combinado.
--   2. a rua aprender POR CIMA da ordem que alguem digitou. A correcao feita a
--      mao seria desfeita na proxima lavagem — a pior forma de um sistema
--      discordar de quem manda nele.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci25(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'ROTEIRO FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into orgs (id, nome, dia_vencimento) values
  ('a0250000-0000-0000-0000-000000000001','CI Roteiro', 10) on conflict do nothing;
insert into cemiterios (id, org_id, nome) values
  ('d0250000-0000-0000-0000-000000000001','a0250000-0000-0000-0000-000000000001','CI Cem Roteiro')
on conflict do nothing;
insert into quadras (id, org_id, cemiterio_id, codigo, ordem) values
  ('e0250000-0000-0000-0000-000000000001','a0250000-0000-0000-0000-000000000001',
   'd0250000-0000-0000-0000-000000000001','Q Roteiro', 1) on conflict do nothing;
insert into ruas (id, org_id, cemiterio_id, quadra_id, nome, ordem) values
  ('50250000-0000-0000-0000-000000000001','a0250000-0000-0000-0000-000000000001',
   'd0250000-0000-0000-0000-000000000001','e0250000-0000-0000-0000-000000000001','Rua CI', 1)
on conflict do nothing;
insert into familias (id, org_id, nome) values
  ('f0250000-0000-0000-0000-000000000001','a0250000-0000-0000-0000-000000000001','Familia CI Roteiro')
on conflict do nothing;

-- Cinco jazigos na mesma rua: TRES sem ordem (para aprender) e UM ja numerado
-- a mao (para NAO ser sobrescrito).
insert into tumulos (id, org_id, quadra_id, rua_id, familia_id, identificacao,
                     contratado, valor_mensal, ordem_na_rua)
values
 ('40250000-0000-0000-0000-000000000001','a0250000-0000-0000-0000-000000000001',
  'e0250000-0000-0000-0000-000000000001','50250000-0000-0000-0000-000000000001',
  'f0250000-0000-0000-0000-000000000001','CI-A', true, 40, null),
 ('40250000-0000-0000-0000-000000000002','a0250000-0000-0000-0000-000000000001',
  'e0250000-0000-0000-0000-000000000001','50250000-0000-0000-0000-000000000001',
  'f0250000-0000-0000-0000-000000000001','CI-B', true, 40, null),
 ('40250000-0000-0000-0000-000000000003','a0250000-0000-0000-0000-000000000001',
  'e0250000-0000-0000-0000-000000000001','50250000-0000-0000-0000-000000000001',
  'f0250000-0000-0000-0000-000000000001','CI-C', true, 40, null),
 ('40250000-0000-0000-0000-000000000009','a0250000-0000-0000-0000-000000000001',
  'e0250000-0000-0000-0000-000000000001','50250000-0000-0000-0000-000000000001',
  'f0250000-0000-0000-0000-000000000001','CI-DIGITADO', true, 40, 7)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 1. A RUA APRENDE NA ORDEM EM QUE FOI ANDADA
-- ---------------------------------------------------------------------------
insert into servicos (id, org_id, tumulo_id, status, data_prevista)
values
 ('50250000-0000-0000-0000-0000000000a1','a0250000-0000-0000-0000-000000000001',
  '40250000-0000-0000-0000-000000000002','agendado', current_date),
 ('50250000-0000-0000-0000-0000000000a2','a0250000-0000-0000-0000-000000000001',
  '40250000-0000-0000-0000-000000000001','agendado', current_date),
 ('50250000-0000-0000-0000-0000000000a3','a0250000-0000-0000-0000-000000000001',
  '40250000-0000-0000-0000-000000000009','agendado', current_date);

-- Ela andou B primeiro, depois A. A rua tem de aprender NESSA ordem.
update servicos set status = 'executado' where id = '50250000-0000-0000-0000-0000000000a1';
update servicos set status = 'executado' where id = '50250000-0000-0000-0000-0000000000a2';

select ci25('o primeiro andado virou o 8 da rua',
  (select ordem_na_rua from tumulos where id='40250000-0000-0000-0000-000000000002') = 8,
  'a rua ja tinha o 7 digitado; o aprendido continua de onde ela parou, e nao do 1');

select ci25('e o segundo virou o 9',
  (select ordem_na_rua from tumulos where id='40250000-0000-0000-0000-000000000001') = 9,
  'a ordem que entra e a da caminhada, uma lapide por vez');

-- ---------------------------------------------------------------------------
-- 2. O QUE FOI DIGITADO NAO E SOBRESCRITO
-- ---------------------------------------------------------------------------
update servicos set status = 'executado' where id = '50250000-0000-0000-0000-0000000000a3';

select ci25('a ordem digitada a mao sobrevive a lavagem',
  (select ordem_na_rua from tumulos where id='40250000-0000-0000-0000-000000000009') = 7,
  'desfazer a correcao de quem manda no sistema e a pior forma de discordar dela');

select ci25('e o que nunca foi lavado continua sem ordem',
  (select ordem_na_rua from tumulos where id='40250000-0000-0000-0000-000000000003') is null,
  'a rua aprende com quem andou, nao com quem foi cadastrado');

-- ---------------------------------------------------------------------------
-- 3. O REFAZER SOLTA O QUE PODE — E SO ISSO
-- ---------------------------------------------------------------------------
insert into servicos (id, org_id, tumulo_id, status, data_prevista,
                      ordem_dia, fixado_em, iniciado_em, foto_antes_url)
values
 -- solta: amanha, agendada, livre
 ('50250000-0000-0000-0000-0000000000b1','a0250000-0000-0000-0000-000000000001',
  '40250000-0000-0000-0000-000000000003','agendado', current_date + 1, 3, null, null, null),
 -- NAO solta: e de hoje
 ('50250000-0000-0000-0000-0000000000b2','a0250000-0000-0000-0000-000000000001',
  '40250000-0000-0000-0000-000000000001','agendado', current_date, 1, null, null, null),
 -- NAO solta: remarcada a mao
 ('50250000-0000-0000-0000-0000000000b3','a0250000-0000-0000-0000-000000000001',
  '40250000-0000-0000-0000-000000000002','agendado', current_date + 2, 1, now(), null, null),
 -- NAO solta: ja comecou
 ('50250000-0000-0000-0000-0000000000b4','a0250000-0000-0000-0000-000000000001',
  '40250000-0000-0000-0000-000000000009','agendado', current_date + 3, 1, null, now(), null),
 -- NAO solta: ja tem foto
 ('50250000-0000-0000-0000-0000000000b5','a0250000-0000-0000-0000-000000000001',
  '40250000-0000-0000-0000-000000000003','agendado', current_date + 4, 1, null, null, 'x://antes.jpg');

select ci25('o refazer solta so a que pode',
  sureya_soltar_roteiro(current_date + 1, 'a0250000-0000-0000-0000-000000000001') = 1,
  'hoje, remarcada a mao, ja comecada e com foto ficam onde estao');

select ci25('a de amanha voltou para a fila, sem ordem',
  (select status::text = 'pendente' and ordem_dia is null from servicos
    where id='50250000-0000-0000-0000-0000000000b1'), '');

select ci25('a de HOJE nao foi tocada',
  (select status::text = 'agendado' and ordem_dia = 1 from servicos
    where id='50250000-0000-0000-0000-0000000000b2'),
  'a Nina ja abriu a lista no celular — a rota nao pode mudar debaixo dela');

select ci25('a remarcada a mao nao foi tocada',
  (select status::text = 'agendado' from servicos
    where id='50250000-0000-0000-0000-0000000000b3'),
  'decisao de pessoa manda (0041)');

select ci25('a que ja comecou nao foi tocada',
  (select status::text = 'agendado' from servicos
    where id='50250000-0000-0000-0000-0000000000b4'), '');

select ci25('e a que ja tem foto nao foi tocada',
  (select status::text = 'agendado' from servicos
    where id='50250000-0000-0000-0000-0000000000b5'),
  'foto e prova de que houve trabalho ali');

-- ---------------------------------------------------------------------------
-- 4. NUNCA PARA TRAS DE HOJE
-- ---------------------------------------------------------------------------
update servicos set status = 'agendado', ordem_dia = 1
 where id = '50250000-0000-0000-0000-0000000000b1';

select ci25('pedir para soltar a partir de ontem vira amanha',
  sureya_soltar_roteiro(current_date - 30, 'a0250000-0000-0000-0000-000000000001') = 1,
  'soltar o passado nao redistribui nada: so apaga a ordem de um dia que ja aconteceu');

select ci25('e a de hoje continua intocada depois disso',
  (select status::text = 'agendado' from servicos
    where id='50250000-0000-0000-0000-0000000000b2'), '');

-- ---------------------------------------------------------------------------
-- 5. O QUE A FAMILIA PEDIU NAO ENTRA NO SORTEIO (0126)
--
-- Data pedida e combinado. Refazer o roteiro reorganiza o que o CONTRATO deve;
-- quem move um combinado e gente, pelo remarcar, com a data na mao.
-- ---------------------------------------------------------------------------
insert into servicos
  (id, org_id, tumulo_id, status, data_prevista, ordem_dia, data_desejada,
   fixado_em, iniciado_em, foto_antes_url) values
 ('50250000-0000-0000-0000-0000000000c1','a0250000-0000-0000-0000-000000000001',
  '40250000-0000-0000-0000-000000000003','agendado', current_date + 5, 2,
  current_date + 5, null, null, null);

select ci25('o avulso pedido nao e solto',
  sureya_soltar_roteiro(current_date + 1, 'a0250000-0000-0000-0000-000000000001') = 0,
  'ele era o unico candidato que sobrou, e tem data pedida');

select ci25('e ele continua agendado, com a ordem do dia',
  (select status::text = 'agendado' and ordem_dia = 2 from servicos
    where id='50250000-0000-0000-0000-0000000000c1'),
  'a familia combinou um dia; o sistema nao muda isso sozinho');

drop function ci25(text, boolean, text);
