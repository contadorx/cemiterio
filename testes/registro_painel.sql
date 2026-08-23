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
--
-- MUDOU NA 0104. Ate aqui este trecho cobrava o DEBITO da limpeza e depois
-- perseguia a data dele: uma lavagem de 40 dias atras lancava no razao com
-- `current_date`, caindo na competencia errada, e `sureya_datar_lavagem`
-- existia para arrastar o lancamento de volta.
--
-- Esse problema inteiro deixou de existir. A limpeza nao gera mais dinheiro —
-- quem cobra e o contrato, pela competencia. Nao ha lancamento para datar,
-- entao nao ha como ele cair no mes errado. Era isto que o pedido chamou de
-- "a cobranca caminha em separado dos registros de servicos".
--
-- O que continua valendo, e continua cobrado aqui: a DATA DO SERVICO (o campo
-- registra o que aconteceu, e aconteceu ha 40 dias) e a FOTO para a familia.
select ci6b('a limpeza do painel nao gera lancamento nenhum',
  not exists (select 1 from conta_corrente
               where servico_id='99999999-0000-0000-0000-000000000061'),
  'a lavagem voltou a escrever no razao');

select ci6b('a mensagem entrou na fila de liberacao',
  (select count(*) = 1 from fila_liberacao
    where servico_id='99999999-0000-0000-0000-000000000061' and tipo='foto'),
  'registrada pelo painel, a familia nunca receberia a foto');

select ci6b('e com um texto da casa, nao a frase de reserva',
  (select btrim(texto) <> 'A limpeza foi feita. Segue a foto. 🌿' from fila_liberacao
    where servico_id='99999999-0000-0000-0000-000000000061'),
  'chegou na fila o bilhete de sistema de novo');

-- `sureya_datar_lavagem` continua existindo e continua consertando a data do
-- SERVICO. O que ela nao tem mais e lancamento para ajustar — e zero aqui e o
-- resultado certo, nao um conserto que falhou.
select * from sureya_datar_lavagem('99999999-0000-0000-0000-000000000061'::uuid,
                                   (current_date - 40));

select ci6('nao ha lancamento para datar, e isso esta certo',
  (select lancamentos_ajustados::text from sureya_datar_lavagem(
     '99999999-0000-0000-0000-000000000061'::uuid, (current_date - 40))),
  '0');

select ci6('e a data do servico continua sendo a informada',
  (select (data_executada at time zone 'America/Sao_Paulo')::date::text
     from servicos where id='99999999-0000-0000-0000-000000000061'),
  (current_date - 40)::text);

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

-- ============================================================================
-- A CONFERENCIA SEPARA O QUE TRAVA DO QUE AVISA (0097)
--
-- Da ficha da familia ALCANTARA, em producao: "contrato — sem contrato, as
-- limpezas serao cobradas como avulso — atencao". Duas coisas diferentes no
-- mesmo lugar: "sem contrato" e uma LACUNA, "avulso" e uma DECISAO. Enquanto
-- moraram no mesmo `contratado = false`, a familia que ninguem decidiu
-- aparecia verde.
-- ============================================================================
insert into orgs (id, nome) values ('aaaaaaaa-0000-0000-0000-000000000097','CI Conferencia')
  on conflict (id) do nothing;
insert into auth.users (id, email)
  values ('f0f0f0f0-0000-0000-0000-000000000097','conf@sureya.test') on conflict (id) do nothing;
insert into membros (org_id, user_id, papel, ativo)
  values ('aaaaaaaa-0000-0000-0000-000000000097','f0f0f0f0-0000-0000-0000-000000000097','admin', true)
  on conflict do nothing;
select set_config('request.jwt.claim.sub','f0f0f0f0-0000-0000-0000-000000000097', false);

insert into cemiterios (id, org_id, nome)
  values ('dddddddd-0000-0000-0000-000000000097','aaaaaaaa-0000-0000-0000-000000000097','CI Cem Conf')
  on conflict (id) do nothing;
insert into quadras (id, org_id, cemiterio_id, codigo, ordem)
  values ('eeeeeeee-0000-0000-0000-000000000097','aaaaaaaa-0000-0000-0000-000000000097',
          'dddddddd-0000-0000-0000-000000000097','Q Conf', 1) on conflict (id) do nothing;
insert into familias (id, org_id, nome, modo_cobranca)
  values ('bbbbbbbb-0000-0000-0000-000000000097','aaaaaaaa-0000-0000-0000-000000000097',
          'ALCANTARA','consumo') on conflict (id) do nothing;
insert into clientes (id, org_id, familia_id, nome, telefone)
  values ('cccccccc-0000-0000-0000-000000000097','aaaaaaaa-0000-0000-0000-000000000097',
          'bbbbbbbb-0000-0000-0000-000000000097','CLECIA','5511940131413')
  on conflict (id) do nothing;
update familias set responsavel_id = 'cccccccc-0000-0000-0000-000000000097'
 where id = 'bbbbbbbb-0000-0000-0000-000000000097';
insert into tumulos (id, org_id, quadra_id, familia_id, identificacao, codigo, valor_lavagem)
  values ('ffffffff-0000-0000-0000-000000000097','aaaaaaaa-0000-0000-0000-000000000097',
          'eeeeeeee-0000-0000-0000-000000000097','bbbbbbbb-0000-0000-0000-000000000097',
          'Alcantara','A-1', 0) on conflict (id) do nothing;

-- 1 · O RESPONSAVEL APARECE PELO NOME, e nao como "exatamente um"
select ci6('o responsavel aparece pelo nome',
  (select detalhe from sureya_conferencia_cadastro('bbbbbbbb-0000-0000-0000-000000000097')
    where item = 'responsavel financeiro'), 'CLECIA');

-- 2 · NAO DECIDIR E PENDENCIA
select ci6('familia sem regime definido fica PENDENTE',
  (select situacao from sureya_conferencia_cadastro('bbbbbbbb-0000-0000-0000-000000000097')
    where item = 'contrato ou avulso'), 'pendente');

select ci6b('e o item e obrigatorio',
  (select obrigatorio from sureya_conferencia_cadastro('bbbbbbbb-0000-0000-0000-000000000097')
    where item = 'contrato ou avulso'),
  'o item que trava o piloto ficou marcado como opcional');

-- 3 · O OK E RECUSADO ENQUANTO FALTA OBRIGATORIO
select ci6b('nao da para dar ok com pendencia obrigatoria',
  (select not ok from sureya_conferir_familia('bbbbbbbb-0000-0000-0000-000000000097', true)),
  'a familia foi carimbada como conferida com item obrigatorio faltando');

select ci6b('e o carimbo nao foi gravado',
  (select conferida_em is null from familias where id = 'bbbbbbbb-0000-0000-0000-000000000097'),
  'gravou conferida_em mesmo recusando');

-- 4 · AVULSO E UMA DECISAO VALIDA — vale tanto quanto contrato
update familias set regime = 'avulso' where id = 'bbbbbbbb-0000-0000-0000-000000000097';

select ci6('avulso conta como decidido',
  (select situacao from sureya_conferencia_cadastro('bbbbbbbb-0000-0000-0000-000000000097')
    where item = 'contrato ou avulso'), 'ok');

-- 5 · AVULSO NAO PRECISA DE PLANO, mas PRECISA DE VALOR
--
-- Era "nao se aplica" quando nao havia contrato. Mas avulso cobra POR LAVAGEM:
-- sem valor, a limpeza acontece e o lancamento sai zerado. E o jeito mais
-- silencioso de trabalhar de graca.
select ci6('avulso nao precisa de plano',
  (select situacao from sureya_conferencia_cadastro('bbbbbbbb-0000-0000-0000-000000000097')
    where item = 'plano com as datas preenchidas'), 'ok');

select ci6('mas avulso SEM VALOR e pendencia',
  (select situacao from sureya_conferencia_cadastro('bbbbbbbb-0000-0000-0000-000000000097')
    where item = 'valor combinado'), 'pendente');

-- ---------------------------------------------------------------------------
-- O RATEIO (0100): o combinado e MENSAL e cada lavagem desconta a fracao.
--
-- Medido na ALCANTARA em 23/08: combinado de R$ 25/mes, lavagem semanal, e a
-- limpeza debitou R$ 40 — que nao veio de lugar nenhum do contrato. E havia um
-- erro pior a espera: a cascata pegava `plano.valor_mensal` e cobrava INTEIRO
-- por lavagem, o que num contrato semanal e QUATRO VEZES o combinado.
-- ---------------------------------------------------------------------------
select ci6('quatro semanas no mes, e nao 4,28',
  sureya_lavagens_no_mes('semanal')::text, '4');
select ci6('e um bimestre vale meio mes de contrato por lavagem',
  sureya_lavagens_no_mes('bimestral')::text, '0.5');
select ci6('periodicidade desconhecida nao inventa divisor',
  coalesce(sureya_lavagens_no_mes('todo dia')::text, 'nulo'), 'nulo');

update familias set regime = 'contrato' where id = 'bbbbbbbb-0000-0000-0000-000000000097';
update tumulos set valor_mensal = 25, periodicidade = 'semanal'
 where id = 'ffffffff-0000-0000-0000-000000000097';

select ci6('R$ 25/mes com lavagem semanal da R$ 6,25 por lavagem',
  sureya_valor_da_lavagem('ffffffff-0000-0000-0000-000000000097')::text, '6.25');

select ci6b('e a conferencia mostra a conta por extenso',
  (select detalhe like '%25.00/mes = R$ 6.25 por lavagem%'
     from sureya_conferencia_cadastro('bbbbbbbb-0000-0000-0000-000000000097')
    where item = 'valor combinado'),
  'a conferencia nao explica de onde saiu o valor da lavagem');

-- AVULSO NAO DIVIDE: nao ha mes para ratear, e o preco e o da ida.
--
-- Os dois valores convivem no mesmo tumulo de proposito: sao dois negocios
-- diferentes, e o que decide qual vale e o REGIME da familia. Sem isso, mudar
-- de contrato para avulso exigiria reescrever o cadastro.
update tumulos set valor_lavagem = 40 where id = 'ffffffff-0000-0000-0000-000000000097';
update familias set regime = 'avulso' where id = 'bbbbbbbb-0000-0000-0000-000000000097';
select ci6('avulso cobra o preco da ida, sem dividir',
  sureya_valor_da_lavagem('ffffffff-0000-0000-0000-000000000097')::text, '40.00');

-- SEM RITMO NAO HA COMO DIVIDIR, e a conferencia cobra isso.
update familias set regime = 'contrato' where id = 'bbbbbbbb-0000-0000-0000-000000000097';
update tumulos set periodicidade = null where id = 'ffffffff-0000-0000-0000-000000000097';
select ci6('sem ritmo, a conferencia acusa',
  (select situacao from sureya_conferencia_cadastro('bbbbbbbb-0000-0000-0000-000000000097')
    where item = 'ritmo da limpeza'), 'pendente');
update tumulos set periodicidade = 'semanal' where id = 'ffffffff-0000-0000-0000-000000000097';
update familias set regime = 'avulso' where id = 'bbbbbbbb-0000-0000-0000-000000000097';

-- 6 · COM TUDO RESOLVIDO, O OK PASSA
update tumulos set valor_lavagem = 40 where id = 'ffffffff-0000-0000-0000-000000000097';

select ci6('sem pendencia obrigatoria, o ok passa',
  (select ok::text from sureya_conferir_familia('bbbbbbbb-0000-0000-0000-000000000097', true)), 'true');

select ci6b('e o carimbo ficou gravado',
  (select conferida_em is not null from familias where id = 'bbbbbbbb-0000-0000-0000-000000000097'),
  'o ok passou mas nao gravou nada');

-- 7 · O CONSENTIMENTO E AVISO, NAO TRAVA
--
-- Antes tudo que nao fosse 'ok' pesava igual, e um consentimento nao
-- registrado segurava a familia do mesmo jeito que um telefone faltando.
select ci6('consentimento nao registrado e AVISO',
  (select situacao from sureya_conferencia_cadastro('bbbbbbbb-0000-0000-0000-000000000097')
    where item = 'consentimento registrado'), 'atencao');

select ci6b('e nao e obrigatorio',
  (select not obrigatorio from sureya_conferencia_cadastro('bbbbbbbb-0000-0000-0000-000000000097')
    where item = 'consentimento registrado'),
  'o consentimento voltou a travar o piloto');

-- 8 · DESFAZER O OK E SEMPRE PERMITIDO
select ci6('da para tirar o ok',
  (select ok::text from sureya_conferir_familia('bbbbbbbb-0000-0000-0000-000000000097', false)), 'true');
