-- ============================================================================
-- SUREYA — 0052 · A COLUNA QUE FALTOU QUANDO O CONTRATO MUDOU DE CASA
--
-- GRAVIDADE: P0. Enquanto esta migration não rodar, a agenda não gera NENHUM
-- serviço — e não avisa.
--
-- O QUE ACONTECEU
-- ---------------------------------------------------------------------------
-- A migration 0049 mudou o contrato de lugar: `valor_lavagem`, `periodicidade`,
-- `freq_pagamento` e `contratado` passaram de `planos` para `tumulos`, e o
-- código foi junto (src/lib/agenda.ts, competencia.ts, conta-corrente.ts,
-- valor-limpeza.ts). O comentário no próprio agenda.ts explica o motivo:
--
--     "Isto lia `planos`, enquanto a ficha e a cobrança gravavam em `tumulos`.
--      A Sureya configurava 'limpa toda semana', o valor entrava na conta
--      corrente — e a Nina nunca recebia o serviço."
--
-- Só que UMA coluna ficou para trás: `proximo_servico`. Ela existe em `planos`
-- (migration 0001, linha 127) e nunca foi criada em `tumulos`. Nenhuma das 46
-- migrations a adiciona.
--
-- E o código lê e escreve `tumulos.proximo_servico` mesmo assim:
--   · src/lib/agenda.ts:207  select "...,periodicidade,proximo_servico"
--   · src/lib/agenda.ts:296  update tumulos set proximo_servico = ...
--
-- O QUE ISSO CAUSA EM PRODUÇÃO
-- ---------------------------------------------------------------------------
-- O PostgREST responde 400 ("column tumulos.proximo_servico does not exist").
-- O código descartava o `error` e lia só o `data`, que vinha nulo. O laço não
-- roda nenhuma vez e `gerarServicosDevidos()` devolve:
--
--     {"criados":0,"planosAtivos":0,"planosNoHorizonte":0,"jaExistiam":0,...}
--
-- Ou seja: um zero com cara de "não havia nada a fazer". O cron diário fica
-- verde, a tela de agenda diz "0 planos ativos" e NENHUMA família é agendada —
-- todos os dias, sem um único sinal em lugar nenhum.
--
-- Este é exatamente o modo de falha que a AUDITORIA_GOLIVE descreve como
-- "prejuízo invisível", mas na etapa anterior à que ela examinou: o serviço
-- nem chega a ser criado.
--
-- CONFERIR ANTES DE RODAR
-- ---------------------------------------------------------------------------
-- Se a consulta abaixo devolver 1 linha, a coluna já existe (alguém a criou à
-- mão no SQL Editor) e o problema é outro: o banco divergiu do repositório, e
-- isso precisa entrar na baseline da 0053.
--
--     select column_name from information_schema.columns
--      where table_schema = 'public' and table_name = 'tumulos'
--        and column_name = 'proximo_servico';
--
-- Esta migration é segura nos dois casos: `if not exists` não recria nada.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) A coluna que faltava
-- ----------------------------------------------------------------------------
alter table tumulos
  add column if not exists proximo_servico date;

comment on column tumulos.proximo_servico is
  'Data teórica da próxima lavagem deste jazigo. O gerador de agenda lê e avança '
  'esta coluna (src/lib/agenda.ts). Nula = usa hoje como ponto de partida. '
  'Substitui planos.proximo_servico, que ficou como legado da migration 0049.';

-- ----------------------------------------------------------------------------
-- 2) Trazer o ponteiro que já existia em `planos`
--
-- Sem isto, todo jazigo contratado começaria de hoje e a operação perderia a
-- cadência combinada com a família (quem estava atrasado sumiria do atraso,
-- quem era trimestral viraria "hoje").
--
-- `planos` pode ter mais de uma linha por jazigo (herança de importação — ver o
-- comentário do limit(2) em src/app/api/planos/route.ts). Pegamos a MENOR data
-- entre os planos ativos: adiantar uma limpeza é recuperável, esquecê-la não.
-- ----------------------------------------------------------------------------
update tumulos t
   set proximo_servico = p.prox
  from (
        select tumulo_id, min(proximo_servico) as prox
          from planos
         where ativo
           and proximo_servico is not null
         group by tumulo_id
       ) p
 where p.tumulo_id = t.id
   and t.proximo_servico is null;

-- ----------------------------------------------------------------------------
-- 3) Índice para a consulta do gerador
--
-- O gerador filtra org_id + contratado + periodicidade a cada rodada do cron.
-- Parcial em `contratado`: jazigo avulso nunca entra na esteira automática.
-- ----------------------------------------------------------------------------
create index if not exists idx_tumulos_contrato_agenda
  on tumulos (org_id, periodicidade, proximo_servico)
  where contratado;

commit;

-- ============================================================================
-- CONFERÊNCIA DEPOIS DE RODAR
--
-- (a) A coluna existe?
--     select column_name, data_type from information_schema.columns
--      where table_schema='public' and table_name='tumulos'
--        and column_name='proximo_servico';
--
-- (b) Quantos jazigos contratados o gerador vai enxergar agora?
--     Se vier 0, o problema é `contratado`/`periodicidade` em branco na ficha,
--     não esta migration.
--     select count(*) as jazigos_que_a_agenda_enxerga
--       from tumulos
--      where contratado
--        and periodicidade in ('semanal','quinzenal','mensal','bimestral',
--                              'trimestral','semestral','anual');
--
-- (c) Algum contratado ficou sem ponteiro? (não é erro — começam de hoje)
--     select id, identificacao, periodicidade
--       from tumulos where contratado and proximo_servico is null;
--
-- (d) Prova de ponta a ponta, na aplicação:
--     POST /api/agenda/gerar  →  o JSON precisa vir com planosAtivos > 0.
--     Se vier planosAtivos: 0 E falhas: 1, a leitura ainda está falhando e o
--     motivo agora está em `erros_log` (o erro deixou de ser engolido).
-- ============================================================================
