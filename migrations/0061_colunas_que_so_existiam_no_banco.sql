-- ============================================================================
-- SUREYA — 0061 · AS 33 COLUNAS QUE SÓ EXISTIAM DENTRO DO BANCO
--
-- COMO ESTE NÚMERO FOI APURADO
-- ---------------------------------------------------------------------------
-- A trilha do repositório foi aplicada a um PostgreSQL 16 limpo. Depois, cada
-- coluna que o código lê ou escreve foi conferida contra
-- `information_schema.columns` do banco resultante. Trinta e três não existiam — a última, `servicos.cobranca_liberada_em`, só apareceu quando o Build 2 foi testado.
--
-- Não é leitura de código: é o Postgres respondendo. A migration seguinte
-- chegou a falhar com `ERROR: column c.tipo does not exist` antes disto.
--
-- ⚠️ OS TIPOS AQUI SÃO RECONSTRUÍDOS A PARTIR DO USO
-- ---------------------------------------------------------------------------
-- Em produção estas colunas JÁ EXISTEM, com os tipos que alguém escolheu no SQL
-- Editor. Este arquivo é inerte lá (`if not exists`). Ele serve para o ambiente
-- limpo — homologação, CI, restauração de backup — parar de nascer quebrado.
--
-- Mas isso significa que HOMOLOGAÇÃO PODE DIVERGIR DE PRODUÇÃO nos detalhes
-- (um `text` onde lá é enum, um default diferente). Para eliminar a dúvida,
-- rode `migrations/_diagnostico/0063_gerar_ddl_do_que_falta.sql` no banco real:
-- ele devolve o `alter table` exato de cada uma destas colunas, com o tipo e o
-- default verdadeiros, pronto para substituir este arquivo.
--
-- Enquanto isso não for feito, o critério de saída do Build 0 continua aberto.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- conversas — o estado do atendimento
--
-- Usadas por sureya_atualiza_estado_conversa (gatilho), sureya_marcar_conversa,
-- sureya_contadores_conversas e sureya_conversa_equipe.
-- `tipo` separa conversa de família de conversa de equipe; `estado` é o que a
-- aba "Precisam de você" conta.
-- ----------------------------------------------------------------------------
alter table conversas add column if not exists tipo text not null default 'familia';
alter table conversas add column if not exists estado text;
alter table conversas add column if not exists resolvida boolean not null default false;
alter table conversas add column if not exists arquivada_em timestamptz;
alter table conversas add column if not exists membro_id uuid;
alter table conversas add column if not exists fixada boolean not null default false;
alter table conversas add column if not exists ultima_msg_em timestamptz;
alter table conversas add column if not exists ultima_msg_cliente_em timestamptz;
alter table conversas add column if not exists aguardando_desde timestamptz;
alter table conversas add column if not exists ultimo_autor text;
alter table conversas add column if not exists lida_em timestamptz;
alter table conversas add column if not exists lida_por uuid;
alter table conversas add column if not exists respondida_em timestamptz;
alter table conversas add column if not exists respondida_por uuid;

comment on column conversas.estado is
  'sem_resposta | lida_sem_resposta | respondida. Mantida pelo gatilho '
  'sureya_atualiza_estado_conversa e lida por sureya_contadores_conversas.';

create index if not exists idx_conversas_precisam
  on conversas (org_id, estado) where arquivada_em is null;


-- ----------------------------------------------------------------------------
-- familias — O CONTRATO DA FAMÍLIA INTEIRA
--
-- A migration 0049 cria `familias` com SEIS colunas (id, org_id, nome,
-- observacoes, created_at, updated_at). Estas outras seis — que decidem quanto
-- a família paga e quando — nunca entraram em migration nenhuma. E são o que
-- fecha o mês:
--
--   src/lib/competencia.ts:37       select ... contratado, modo_cobranca
--   src/app/api/familias/[id]:56-72 patch de todas as seis
--   src/app/api/financeiro/fechar-mes:41  if (!f.contratado) throw
--   src/app/api/mes/route.ts:97     semPlano: !f.contratado
--
-- `modo_cobranca`: 'competencia' lança o mês inteiro de uma vez; 'consumo'
-- deixa o débito nascer de cada lavagem. `competencia.ts:41` filtra por isso.
-- `valor_base`: 'mes' ou 'lavagem' — a unidade de `valor_mensal`.
-- ----------------------------------------------------------------------------
alter table familias add column if not exists contratado boolean not null default false;
alter table familias add column if not exists valor_mensal numeric(10,2);
alter table familias add column if not exists valor_base text default 'mes';
alter table familias add column if not exists freq_pagamento sureya_freq_pagamento;
alter table familias add column if not exists inicio_cobranca date;
alter table familias add column if not exists modo_cobranca text default 'consumo';

comment on column familias.modo_cobranca is
  'competencia = lança o período inteiro (lib/competencia.ts). consumo = o '
  'débito nasce de cada lavagem. Lançar os dois cobraria em duplicidade.';

create index if not exists idx_familias_contratadas
  on familias (org_id, modo_cobranca) where contratado;


-- ----------------------------------------------------------------------------
-- leads — o que a Sureya já sabia antes de virar família
--
-- Usadas por sureya_lead_vira_cliente: `contexto` e `jazigo_ref` viram as
-- observações da ficha, `origem` entra no texto "Veio de ... em ...", e
-- `cliente_novo_id` fecha o vínculo com a família criada.
-- ----------------------------------------------------------------------------
alter table leads add column if not exists origem text;
alter table leads add column if not exists contexto text;
alter table leads add column if not exists jazigo_ref text;
alter table leads add column if not exists cliente_novo_id uuid references clientes(id) on delete set null;


-- ----------------------------------------------------------------------------
-- orgs — jornada e custo
--
-- `dias_semana`, `hora_inicio` e `hora_fim` decidem em que dia a lavagem pode
-- cair: `sureya_proximo_dia_util` lê `dias_semana` a cada remarcação. Sem a
-- coluna, ela cai no default '{1,2,3,4,5,6}' e passa a marcar no sábado.
--
-- As de custo alimentam `sureya_custo_hora_efetivo` e, por ela, a margem por
-- jazigo de `sureya_resultado_por_jazigo`.
-- ----------------------------------------------------------------------------
alter table orgs add column if not exists dias_semana int[] default '{1,2,3,4,5,6}';
alter table orgs add column if not exists hora_inicio time without time zone default '08:00';
alter table orgs add column if not exists hora_fim    time without time zone default '17:00';
alter table orgs add column if not exists intervalo_almoco_min int default 60;
alter table orgs add column if not exists custo_mensal_ajudante numeric(10,2);
alter table orgs add column if not exists minutos_padrao_limpeza int default 25;

comment on column orgs.dias_semana is
  'Dias da semana trabalhados, no padrão do Postgres (0=domingo). Lido por '
  'sureya_proximo_dia_util a cada remarcação, geração e reorganização.';


-- ----------------------------------------------------------------------------
-- servicos — a entrega que libera a cobranca
--
-- Escrita por src/app/api/servico/concluir/route.ts quando o plano e
-- `momento_cobranca = 'contra_foto'`: so depois da foto de entrega e que a
-- familia pode ser cobrada. Sem a coluna, a rota inteira falha nesse caso.
--
-- Foi a ultima a aparecer, e aparecendo do jeito certo: o teste do Build 2
-- num banco limpo estourou com `column "cobranca_liberada_em" does not exist`.
-- ----------------------------------------------------------------------------
alter table servicos add column if not exists cobranca_liberada_em timestamptz;

comment on column servicos.cobranca_liberada_em is
  'Momento em que a entrega liberou a cobranca, no modo contra_foto. Nulo = '
  'ainda nao entregue, ou plano que nao cobra contra entrega.';


-- ----------------------------------------------------------------------------
-- planos — adiamento de reajuste
-- Escritas por sureya_adiar_reajuste.
-- ----------------------------------------------------------------------------
alter table planos add column if not exists reajuste_adiado_ate date;
alter table planos add column if not exists reajuste_motivo_adiamento text;

commit;

-- ============================================================================
-- CONFERÊNCIA — a que fecha o Build 0
--
-- Rode `_diagnostico/0063_gerar_ddl_do_que_falta.sql` no banco REAL. Ele
-- devolve o `alter table` de cada uma destas 32 colunas com o tipo e o default
-- verdadeiros. Compare linha a linha com este arquivo.
--
-- Onde divergir, o BANCO vence: corrija este arquivo. A baseline existe para
-- descrever o que existe, não o que se preferia que existisse.
-- ============================================================================
