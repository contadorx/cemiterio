-- ============================================================================
-- QUEM ACERTA A CONTA PODE SER MAIS DE UM
--
-- O que se mediu antes (producao, 365 familias): um indice UNICO parcial
-- `(familia_id) where responsavel_financeiro` deixava a tela oferecer o
-- botao "tambem acerta a conta" e o banco recusar o segundo clique com uma
-- violacao de chave — um erro que nao fala do que a Sureya tentou fazer.
--
-- Este arquivo cobra as tres coisas que a 0102 decidiu:
--   1. o TETO caiu    — varios podem acertar a conta
--   2. o PISO ficou   — mas nunca zero, enquanto houver gente na familia
--   3. o TITULAR e outra pergunta — troca-lo nao apaga quem paga
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci13(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'PAGADORES FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into orgs (id, nome) values ('aaaaaaaa-0000-0000-0000-000000000013','CI Pagadores')
  on conflict do nothing;

insert into familias (id, org_id, nome) values
  ('ff000000-0000-0000-0000-000000000013','aaaaaaaa-0000-0000-0000-000000000013','Familia Tres Filhos')
  on conflict do nothing;

-- Tres irmaos. Na vida real os tres mandam Pix; no cadastro velho so um podia
-- ser marcado, e a Sureya tinha de decidir qual dos tres "era" o que paga.
insert into clientes (id, org_id, familia_id, nome, telefone, responsavel_financeiro) values
  ('cc000000-0000-0000-0000-000000000131','aaaaaaaa-0000-0000-0000-000000000013',
   'ff000000-0000-0000-0000-000000000013','Ana',  '5511900000131', true),
  ('cc000000-0000-0000-0000-000000000132','aaaaaaaa-0000-0000-0000-000000000013',
   'ff000000-0000-0000-0000-000000000013','Bruno','5511900000132', false),
  ('cc000000-0000-0000-0000-000000000133','aaaaaaaa-0000-0000-0000-000000000013',
   'ff000000-0000-0000-0000-000000000013','Célia','5511900000133', false)
  on conflict do nothing;

update familias set responsavel_id = 'cc000000-0000-0000-0000-000000000131'
 where id = 'ff000000-0000-0000-0000-000000000013';

-- ---------------------------------------------------------------------------
-- 1. O TETO CAIU
-- ---------------------------------------------------------------------------
do $$
begin
  update clientes set responsavel_financeiro = true
   where id = 'cc000000-0000-0000-0000-000000000132';
exception when others then
  raise exception 'PAGADORES FALHOU — o segundo pagador foi recusado: % (%)',
    sqlerrm, sqlstate;
end $$;

select ci13('o segundo pode acertar a conta',
  (select count(*) = 2 from clientes
    where familia_id = 'ff000000-0000-0000-0000-000000000013' and responsavel_financeiro),
  'marcar o Bruno nao somou');

update clientes set responsavel_financeiro = true
 where id = 'cc000000-0000-0000-0000-000000000133';

select ci13('e o terceiro tambem',
  (select count(*) = 3 from clientes
    where familia_id = 'ff000000-0000-0000-0000-000000000013' and responsavel_financeiro),
  'a familia deveria ter tres');

-- O indice unico que proibia isso nao pode voltar por descuido numa migration
-- futura: quem o recriar quebra este teste, nao a tela da Sureya.
select ci13('nao ha mais indice UNICO prendendo em um',
  not exists (select 1 from pg_indexes
               where tablename = 'clientes'
                 and indexdef ilike '%unique%'
                 and indexdef ilike '%responsavel_financeiro%'),
  'um indice unico voltou a limitar a familia a um pagador');

select ci13('mas o indice de busca continua de pe',
  exists (select 1 from pg_indexes
           where tablename = 'clientes' and indexdef ilike '%responsavel_financeiro%'),
  'derrubar o unique nao pode levar junto o indice que serve a consulta');

-- ---------------------------------------------------------------------------
-- 2. O PISO FICOU
-- ---------------------------------------------------------------------------
update clientes set responsavel_financeiro = false
 where id = 'cc000000-0000-0000-0000-000000000133';
update clientes set responsavel_financeiro = false
 where id = 'cc000000-0000-0000-0000-000000000132';

select ci13('desmarcar sobrando outros e permitido',
  (select count(*) = 1 from clientes
    where familia_id = 'ff000000-0000-0000-0000-000000000013' and responsavel_financeiro),
  'sobrou gente marcada, entao tirar os outros tinha de passar');

do $$
declare v_passou boolean := false;
begin
  update clientes set responsavel_financeiro = false
   where id = 'cc000000-0000-0000-0000-000000000131';
  v_passou := true;
exception when others then
  if sqlerrm not like '%familia_ficaria_sem_quem_acerta_a_conta%' then
    raise exception 'PAGADORES FALHOU — recusou pelo motivo errado: %', sqlerrm;
  end if;
end $$;

select ci13('mas desmarcar o ULTIMO e recusado',
  (select count(*) = 1 from clientes
    where familia_id = 'ff000000-0000-0000-0000-000000000013' and responsavel_financeiro),
  'a familia ficou sem ninguem para cobrar — era isso que o alerta acusa');

-- A recusa nao pode ser um efeito colateral de outra coisa: as duas views que
-- perguntam "tem ao menos um?" continuam mudas para esta familia.
select ci13('e a familia nao aparece como sem responsavel',
  not exists (select 1 from clientes c
               where c.familia_id = 'ff000000-0000-0000-0000-000000000013'
                 and c.responsavel_financeiro) = false,
  'a condicao das views mudou de sentido');

-- ---------------------------------------------------------------------------
-- 3. TROCAR O TITULAR NAO APAGA QUEM PAGA
-- ---------------------------------------------------------------------------
update clientes set responsavel_financeiro = true
 where id in ('cc000000-0000-0000-0000-000000000132','cc000000-0000-0000-0000-000000000133');

select sureya_definir_responsavel_interno(
  'aaaaaaaa-0000-0000-0000-000000000013',
  'ff000000-0000-0000-0000-000000000013',
  'cc000000-0000-0000-0000-000000000133',
  'CI: a Celia passa a responder pela familia');

select ci13('o titular novo e a Celia',
  (select responsavel_id = 'cc000000-0000-0000-0000-000000000133'
     from familias where id = 'ff000000-0000-0000-0000-000000000013'),
  'a troca de titular nao gravou');

-- ESTE e o estrago que a 0102 tirou: a versao velha zerava a marca de todos
-- antes de marcar o novo titular, e os tres viravam um.
select ci13('e os tres continuam acertando a conta',
  (select count(*) = 3 from clientes
    where familia_id = 'ff000000-0000-0000-0000-000000000013' and responsavel_financeiro),
  'trocar o titular apagou o cadastro de quem paga');

select ci13('o titular tambem acerta a conta',
  (select c.responsavel_financeiro from familias f join clientes c on c.id = f.responsavel_id
    where f.id = 'ff000000-0000-0000-0000-000000000013'),
  'quem responde pela familia tem de estar entre quem pode pagar');

-- Convergente: repor o mesmo titular nao escreve nada nem derruba ninguem.
select sureya_definir_responsavel_interno(
  'aaaaaaaa-0000-0000-0000-000000000013',
  'ff000000-0000-0000-0000-000000000013',
  'cc000000-0000-0000-0000-000000000133',
  'CI: de novo, de proposito');

select ci13('repor o mesmo titular nao muda nada',
  (select count(*) = 3 from clientes
    where familia_id = 'ff000000-0000-0000-0000-000000000013' and responsavel_financeiro),
  'a segunda chamada mexeu no que a primeira deixou pronto');

-- E o titular de UMA familia nao pode ser gente de outra.
do $$
declare v_passou boolean := false;
begin
  perform sureya_definir_responsavel_interno(
    'aaaaaaaa-0000-0000-0000-000000000013',
    'ff000000-0000-0000-0000-000000000013',
    'cc000000-0000-0000-0000-000000000131'::uuid);
  v_passou := true;
exception when others then null;
end $$;

select ci13('e um so titular continua sendo um so',
  (select count(*) = 1 from familias
    where id = 'ff000000-0000-0000-0000-000000000013' and responsavel_id is not null),
  'familias.responsavel_id continua sendo um ponteiro unico');
