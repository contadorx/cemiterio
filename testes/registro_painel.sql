-- ============================================================================
-- A LIMPEZA REGISTRADA DEPOIS, PELO PAINEL
--
-- O caminho: cria o servico JA executado com a data informada, chama a mesma
-- transacao do campo (que, convergente, nao reescreve o status nem a data e sai
-- criando o que falta) e depois alinha a data dos lancamentos.
--
-- O que este arquivo cobra e o que so se ve rodando:
--   · a transacao NAO apaga a data retroativa;
--   · o debito, o extrato e a fila nascem, como nasceriam pelo campo;
--   · o lancamento fica na competencia certa, e nao na de hoje.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci6(nome text, real_ text, esperado text) returns void
language plpgsql as $$
begin
  if real_ is distinct from esperado then
    raise exception 'REGISTRO FALHOU — %: veio [%], esperado [%]', nome, real_, esperado;
  end if;
  raise notice '  ok  %', nome;
end $$;

create or replace function ci6b(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'REGISTRO FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

-- ---------------------------------------------------------------------------
-- UMA SESSAO DE ADMIN DE VERDADE — as guardas da funcao dependem disso.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email)
  values ('f0f0f0f0-0000-0000-0000-000000000006','painel@sureya.test')
  on conflict (id) do nothing;
select set_config('request.jwt.claim.sub','f0f0f0f0-0000-0000-0000-000000000006', false);

insert into orgs (id, nome) values ('aaaaaaaa-0000-0000-0000-000000000006','CI Painel')
  on conflict do nothing;
insert into membros (org_id, user_id, papel, ativo)
  values ('aaaaaaaa-0000-0000-0000-000000000006','f0f0f0f0-0000-0000-0000-000000000006','admin', true)
  on conflict do nothing;
insert into cemiterios (id, org_id, nome)
  values ('dddddddd-0000-0000-0000-000000000006','aaaaaaaa-0000-0000-0000-000000000006','CI Cem Painel')
  on conflict (id) do nothing;
insert into quadras (id, org_id, cemiterio_id, codigo, ordem)
  values ('eeeeeeee-0000-0000-0000-000000000006','aaaaaaaa-0000-0000-0000-000000000006',
          'dddddddd-0000-0000-0000-000000000006','Quadra Painel', 1)
  on conflict (id) do nothing;
insert into familias (id, org_id, nome, modo_cobranca)
  values ('bbbbbbbb-0000-0000-0000-000000000061','aaaaaaaa-0000-0000-0000-000000000006',
          'Familia Painel','consumo')
  on conflict (id) do nothing;
insert into clientes (id, org_id, nome, telefone, familia_id, responsavel_financeiro, recebe_fotos)
  values ('cccccccc-0000-0000-0000-000000000061','aaaaaaaa-0000-0000-0000-000000000006',
          'Sr. Joao Painel','5511900000061','bbbbbbbb-0000-0000-0000-000000000061', true, true)
  on conflict (id) do nothing;
insert into tumulos (id, org_id, quadra_id, cliente_id, familia_id, identificacao, codigo, valor_lavagem)
  values ('ffffffff-0000-0000-0000-000000000061','aaaaaaaa-0000-0000-0000-000000000006',
          'eeeeeeee-0000-0000-0000-000000000006','cccccccc-0000-0000-0000-000000000061',
          'bbbbbbbb-0000-0000-0000-000000000061','Pedra Painel','P-1', 45)
  on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- O REGISTRO — uma limpeza feita ha 40 dias, anotada so hoje.
--
-- Quarenta dias de proposito: atravessa a virada do mes, que e onde a data
-- errada vira competencia errada e competencia errada vira cobranca no mes
-- errado. Com 3 dias o teste passaria sem provar nada.
-- ---------------------------------------------------------------------------
insert into servicos (id, org_id, tumulo_id, cliente_id, plano_id, status,
                      data_prevista, data_executada, foto_depois_url)
values ('99999999-0000-0000-0000-000000000061','aaaaaaaa-0000-0000-0000-000000000006',
        'ffffffff-0000-0000-0000-000000000061','cccccccc-0000-0000-0000-000000000061',
        null, 'executado',
        (current_date - 40),
        ((current_date - 40)::text || ' 12:00:00')::timestamp at time zone 'America/Sao_Paulo',
        'https://exemplo/depois.jpg');

select * from sureya_concluir_lavagem(
  '99999999-0000-0000-0000-000000000061'::uuid,
  'https://exemplo/depois.jpg', null, null, null, null);

-- A TRANSACAO NAO PODE APAGAR A DATA RETROATIVA. Este e o ponto do desenho:
-- o servico entra ja executado justamente para que o `update` de status — que
-- carrega `data_executada = now()` — nao rode.
select ci6('a data da lavagem continua sendo a informada',
  (select (data_executada at time zone 'America/Sao_Paulo')::date::text
     from servicos where id='99999999-0000-0000-0000-000000000061'),
  (current_date - 40)::text);

-- E OS EFEITOS TEM DE TER NASCIDO, como nasceriam pelo campo.
select ci6b('o debito da lavagem foi lancado',
  (select count(*) > 0 from conta_corrente
    where servico_id='99999999-0000-0000-0000-000000000061'
      and origem::text='lavagem' and tipo::text='debito'),
  'a limpeza registrada pelo painel nao gerou lancamento nenhum');

select ci6b('e vale o do jazigo, nao a referencia da casa',
  (select bool_or(valor = 45) from conta_corrente
    where servico_id='99999999-0000-0000-0000-000000000061' and origem::text='lavagem'),
  'o valor saiu diferente do valor_lavagem do tumulo');

select ci6b('a mensagem entrou na fila de liberacao',
  (select count(*) = 1 from fila_liberacao
    where servico_id='99999999-0000-0000-0000-000000000061' and tipo='foto'),
  'registrada pelo painel, a familia nunca receberia a foto');

select ci6b('e com um texto da casa, nao a frase de reserva',
  (select btrim(texto) <> 'A limpeza foi feita. Segue a foto. 🌿' from fila_liberacao
    where servico_id='99999999-0000-0000-0000-000000000061'),
  'chegou na fila o bilhete de sistema de novo');

-- ---------------------------------------------------------------------------
-- A DATA DO LANCAMENTO — o buraco que a 0088 fecha
--
-- Ate aqui o lancamento carimbou `current_date`: a lavagem e de 40 dias atras e
-- a cobranca cairia no mes de hoje.
-- ---------------------------------------------------------------------------
select ci6('antes de datar, o lancamento esta no dia de HOJE',
  (select distinct data::text from conta_corrente
    where servico_id='99999999-0000-0000-0000-000000000061' and origem::text='lavagem'),
  current_date::text);

select * from sureya_datar_lavagem('99999999-0000-0000-0000-000000000061'::uuid,
                                   (current_date - 40));

select ci6('depois de datar, o lancamento esta no dia da lavagem',
  (select distinct data::text from conta_corrente
    where servico_id='99999999-0000-0000-0000-000000000061' and origem::text='lavagem'),
  (current_date - 40)::text);

select ci6('e a competencia deixou de ser a de hoje',
  (select (date_trunc('month', min(data))::date <> date_trunc('month', current_date)::date)::text
     from conta_corrente
    where servico_id='99999999-0000-0000-0000-000000000061' and origem::text='lavagem'),
  'true');

-- Rodar de novo nao muda mais nada: e o que permite a rota chamar sem medo
-- depois de uma falha parcial.
select ci6('datar duas vezes nao mexe em nada na segunda',
  (select lancamentos_ajustados::text from sureya_datar_lavagem(
     '99999999-0000-0000-0000-000000000061'::uuid, (current_date - 40))),
  '0');

-- ---------------------------------------------------------------------------
-- O QUE A FUNCAO TEM DE RECUSAR
-- ---------------------------------------------------------------------------
do $$
begin
  perform sureya_datar_lavagem('99999999-0000-0000-0000-000000000061'::uuid, current_date + 1);
  raise exception 'REGISTRO FALHOU — data no futuro foi ACEITA';
exception when sqlstate '22007' then
  raise notice '  ok  data no futuro e recusada';
end $$;

do $$
begin
  perform sureya_datar_lavagem('99999999-0000-0000-0000-000000000061'::uuid, null);
  raise exception 'REGISTRO FALHOU — data nula foi ACEITA';
exception when sqlstate '22004' then
  raise notice '  ok  data nula e recusada';
end $$;

do $$ begin raise notice 'REGISTRO PELO PAINEL: todas as conferencias passaram'; end $$;
