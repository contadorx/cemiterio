-- ============================================================================
-- O NOME DA PESSOA (0131)
--
-- Duas coisas, e a segunda e a que assusta:
--
--   1. arrumar maiuscula sem TIRAR NADA. O campo `nome` guarda a referencia
--      que acha a pessoa no cemiterio — "Celia Frente Abigail", "Idalina Na
--      Frente Do Bozato". Uma normalizacao esperta demais apagaria o unico
--      jeito de saber de quem se trata.
--   2. na mensagem vai SO O PRIMEIRO NOME. Um erro aqui nao da erro: da uma
--      mensagem constrangedora para uma familia de luto, e ninguem descobre
--      pelo log.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci31(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'NOME FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

-- ---------------------------------------------------------------------------
-- 1. A CAIXA ALTA SAI, A PALAVRA FICA
-- ---------------------------------------------------------------------------
select ci31('CAIXA ALTA vira nome escrito direito',
  sureya_nome_proprio('JOSÉ CARLOS CECON') = 'José Carlos Cecon', '');

select ci31('e o acento sobrevive',
  sureya_nome_proprio('JOSÉ') = 'José' and sureya_nome_proprio('conceição') = 'Conceição', '');

select ci31('a referencia de campo NAO e apagada',
  sureya_nome_proprio('CELIA FRENTE ABIGAIL') = 'Celia Frente Abigail',
  'e assim que se acha a Celia no cemiterio — tirar isso e perder a pessoa');

select ci31('nem a que esta entre parenteses',
  sureya_nome_proprio('JOSE ANTONIO (DONA DOMINGAS)') = 'Jose Antonio (Dona Domingas)', '');

select ci31('particula fica minuscula no meio',
  sureya_nome_proprio('Jose Do Lado Do Delabeta') = 'Jose do Lado do Delabeta',
  'duas particulas seguidas: a fronteira de palavra nao pode consumir o espaco');

select ci31('mas nao no comeco',
  sureya_nome_proprio('DA SILVA JUNIOR') = 'Da Silva Junior',
  'sobrenome no comeco nao e preposicao solta');

select ci31('espaco a mais e espaco na ponta somem',
  sureya_nome_proprio('  rubens   e  silvia  ') = 'Rubens e Silvia', '');

select ci31('hifen nao vira separador de frase',
  sureya_nome_proprio('MARIA-JOSÉ SANTOS') = 'Maria-José Santos', '');

select ci31('vazio continua vazio, e nulo continua nulo',
  sureya_nome_proprio('') = '' and sureya_nome_proprio(null) is null,
  'inventar nome para campo vazio e pior que campo vazio');

-- NENHUMA PALAVRA ENTRA OU SAI. A prova geral, sobre qualquer entrada.
select ci31('a regra nunca muda a quantidade de palavras',
  (select bool_and(
     array_length(regexp_split_to_array(btrim(regexp_replace(v,'\s+',' ','g')), ' '), 1)
     = array_length(regexp_split_to_array(sureya_nome_proprio(v), ' '), 1))
   from (values ('JOSE ANTONIO (DONA DOMINGAS)'),('Paulo Primo Da Maria Japonesa'),
                ('CLAUDIA FILHA GISELDA'),('Neide Perto D. Lazara'),
                ('Idalina Na Frente Do Bozato'),('rubens   e  silvia pintura')) t(v)),
  'normalizacao que tira palavra destroi conhecimento de campo');

-- ---------------------------------------------------------------------------
-- 2. NA MENSAGEM VAI SO O PRIMEIRO NOME
-- ---------------------------------------------------------------------------
select ci31('a mensagem chama pelo primeiro nome',
  sureya_primeiro_nome('José Carlos Cecon') = 'José', '');

select ci31('a referencia de campo NAO vai na mensagem',
  sureya_primeiro_nome('Paulo Primo da Maria Japonesa') = 'Paulo',
  '"Ola, Paulo Primo da Maria Japonesa" seria constrangedor');

select ci31('tratamento COM ponto vem junto',
  sureya_primeiro_nome('Sr. João Batista') = 'Sr. João',
  '"Ola, Sr." nao e saudacao');

select ci31('tratamento SEM ponto tambem',
  sureya_primeiro_nome('Sr João Batista') = 'Sr João'
  and sureya_primeiro_nome('Dra Marta Lima') = 'Dra Marta',
  'em producao ha "Sr" e "Dra" sem ponto — a regra antiga so via a forma com ponto');

select ci31('nome de uma palavra so continua inteiro',
  sureya_primeiro_nome('Nina') = 'Nina', '');

select ci31('e espaco duplo nao devolve string vazia',
  sureya_primeiro_nome('Ana  Maria') = 'Ana',
  'o split por " " devolvia vazio aqui, e a mensagem saia "Ola, !"');

select ci31('so o tratamento, sem mais nada, nao e engolido',
  sureya_primeiro_nome('Dona') = 'Dona', '');

-- ---------------------------------------------------------------------------
-- 3. O GATILHO PEGA TODA PORTA
-- ---------------------------------------------------------------------------
insert into orgs (id, nome, dia_vencimento) values
  ('a0310000-0000-0000-0000-000000000001','CI Nome', 10) on conflict do nothing;

insert into familias (id, org_id, nome) values
  ('f0310000-0000-0000-0000-000000000001','a0310000-0000-0000-0000-000000000001','FAMILIA DOS SANTOS');

select ci31('familia gravada em caixa alta ja nasce arrumada',
  (select nome from familias where id='f0310000-0000-0000-0000-000000000001') = 'Familia dos Santos',
  'sao cinco portas que escrevem nome: consertar uma e deixar quatro tortas');

insert into clientes (id, org_id, familia_id, nome, telefone) values
 ('c0310000-0000-0000-0000-000000000001','a0310000-0000-0000-0000-000000000001',
  'f0310000-0000-0000-0000-000000000001','  MARIA   DA  CONCEIÇÃO  ','11987650001');

select ci31('contato gravado em caixa alta ja nasce arrumado',
  (select nome from clientes where id='c0310000-0000-0000-0000-000000000001') = 'Maria da Conceição', '');

update clientes set nome = 'PEDRO ALVES' where id='c0310000-0000-0000-0000-000000000001';
select ci31('e a EDICAO tambem passa pelo gatilho',
  (select nome from clientes where id='c0310000-0000-0000-0000-000000000001') = 'Pedro Alves',
  'gatilho so de insert deixaria a ficha reintroduzir caixa alta');

-- Convergente: gravar o que ja esta certo nao muda nada.
update clientes set nome = 'Pedro Alves' where id='c0310000-0000-0000-0000-000000000001';
select ci31('gravar o que ja esta certo nao mexe em nada',
  (select nome from clientes where id='c0310000-0000-0000-0000-000000000001') = 'Pedro Alves', '');

-- ---------------------------------------------------------------------------
-- 4. A REGUA USA A MESMA REGRA — nao uma segunda parecida
-- ---------------------------------------------------------------------------
select ci31('a regua monta a saudacao pela funcao, nao por split_part',
  position('sureya_primeiro_nome(coalesce(r.quem' in
    (select pg_get_functiondef(oid) from pg_proc where proname='sureya_regua_do_dia')) > 0
  and position('split_part(btrim(coalesce(r.quem' in
    (select pg_get_functiondef(oid) from pg_proc where proname='sureya_regua_do_dia')) = 0,
  'duas regras de primeiro nome comecam iguais e terminam discordando');

drop function ci31(text, boolean, text);
