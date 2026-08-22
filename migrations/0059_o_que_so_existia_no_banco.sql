-- ============================================================================
-- SUREYA — 0059 · O QUE SÓ EXISTIA DENTRO DO BANCO
--
-- Duas coisas que o código usa todo dia e que NENHUMA das 46 migrations cria:
-- a tabela `quitacoes` e cinco colunas de `movimentos`.
--
-- ---------------------------------------------------------------------------
-- PARTE 1 · `quitacoes`
-- ---------------------------------------------------------------------------
-- `quitacoes` existe no banco de produção (56 kB, 0 linhas na extração) e **não
-- tem `create table` em nenhuma das 46 migrations**. Ela só aparece em prosa,
-- no `migrations/LEIA-ME_entrada_identificada.md`:
--
--     "Uma tabela nova (`quitacoes`) liga cada crédito aos débitos que ele
--      pagou. Isso permite pagamento parcial de uma lavagem, um Pix pagando
--      várias lavagens, saber de cada lavagem quanto já foi pago.
--      Testado no banco."
--
-- Testado no banco, e só no banco.
--
-- COMO ISTO FOI COMPROVADO
-- ---------------------------------------------------------------------------
-- Rodando as 46 migrations do repositório contra um PostgreSQL 16 limpo, a
-- migration 0059 falhou com:
--
--     ERROR: relation "quitacoes" does not exist
--
-- Não é dedução: é o banco recusando.
--
-- DE ONDE VEIO ESTE `create table`
-- ---------------------------------------------------------------------------
-- Reconstruído a partir de como as funções extraídas usam a tabela — não de
-- suposição sobre o que "faria sentido":
--
--   sureya_entrada_identificada:
--     insert into quitacoes (org_id, credito_id, debito_id, valor)
--     values (...) on conflict do nothing;
--        → as quatro colunas, e um `on conflict` que só tem efeito se existir
--          restrição única. A única que faz sentido no domínio é
--          (credito_id, debito_id): um crédito quita um débito uma vez.
--
--   sureya_desidentificar_entrada:
--     delete from quitacoes where credito_id = v_mov;
--        → desfazer a identificação apaga as quitações daquele crédito.
--          Como o movimento também é apagado logo em seguida, o
--          `on delete cascade` em `credito_id` é o comportamento coerente.
--
--   sureya_debitos_em_aberto:
--     select sum(q.valor) from quitacoes q where q.debito_id = m.id
--        → `valor` numérico somável, e busca por `debito_id` (daí o índice).
--
-- ⚠️ CONFIRA CONTRA O BANCO REAL ANTES DE CONSIDERAR FECHADO.
-- A seção `quitacoes` da CONSULTA B (arquivo 0054) devolve as colunas de
-- verdade. Se divergirem, vale o banco — e este arquivo precisa ser corrigido
-- para bater com ele.
--
-- Em produção esta migration é INERTE: `if not exists` não recria nada. Ela
-- serve para o ambiente limpo (homologação, CI, restauração de backup) parar
-- de ficar sem a tabela.
-- ============================================================================

begin;

create table if not exists quitacoes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,

  -- O crédito que pagou (um Pix, um pagamento avulso).
  credito_id uuid not null references movimentos(id) on delete cascade,

  -- O débito que foi pago (a lavagem cobrada).
  debito_id  uuid not null references movimentos(id) on delete cascade,

  -- Quanto DESTE crédito foi para ESTE débito. É o que permite o pagamento
  -- parcial: a soma das quitações de um débito pode ser menor que o débito.
  valor      numeric(10,2) not null check (valor > 0),

  created_at timestamptz not null default now(),

  -- Sustenta o `on conflict do nothing` de sureya_entrada_identificada: a
  -- mesma transação lançada duas vezes não quita o mesmo débito duas vezes.
  constraint quitacoes_credito_debito_unico unique (credito_id, debito_id),

  -- Um lançamento não paga a si mesmo.
  constraint quitacoes_credito_diferente_do_debito check (credito_id <> debito_id)
);

comment on table quitacoes is
  'Liga cada crédito aos débitos que ele pagou. Permite pagamento parcial, um '
  'Pix pagando várias lavagens, e saber de cada lavagem quanto já foi pago. '
  'Versionada na migration 0059 — antes existia só dentro do banco.';

-- `sureya_debitos_em_aberto` faz uma subconsulta por débito; sem este índice
-- ela vira varredura da tabela inteira a cada linha da ficha da família.
create index if not exists idx_quitacoes_debito  on quitacoes (debito_id);
create index if not exists idx_quitacoes_credito on quitacoes (credito_id);
create index if not exists idx_quitacoes_org     on quitacoes (org_id);

-- Mesma RLS das outras tabelas da organização (padrão da migration 0001).
-- A separação por papel virá com as policies do Build 1b, junto com as demais.
alter table quitacoes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policy where polname = 'quitacoes_org') then
    create policy quitacoes_org on quitacoes
      using      (org_id = current_org_id())
      with check (org_id = current_org_id());
  end if;
end $$;

commit;


-- ############################################################################
-- PARTE 2 · AS CINCO COLUNAS QUE FALTAM EM `movimentos`
--
-- Mesma história, no livro-caixa. Rodando a trilha do repositório num
-- PostgreSQL 16 limpo, a migration das guardas falhou com:
--
--     ERROR: column m.conferido_em does not exist
--
-- `movimentos` sai das migrations com doze colunas:
--     id, org_id, cliente_id, tipo, valor, origem, servico_id,
--     comprovante_id, status_conc, descricao, data, created_at
--
-- E as funções extraídas do banco leem e escrevem outras cinco:
--
--   conferido_em / conferido_por / nota_conferencia
--       sureya_conferir_no_banco  → update ... conferido_em = clock_timestamp(),
--                                   conferido_por = auth.uid(), nota_conferencia = p_nota
--       sureya_a_conferir_no_banco → order by m.conferido_em nulls first
--       É a conferência bancária inteira: o que já foi batido com o extrato.
--
--   sem_comprovante
--       sureya_pagamento_avulso    → insert ... sem_comprovante = p_sem_comprovante
--       sureya_a_conferir_no_banco → where m.sem_comprovante = true
--       É o "pagamento informado, comprovante não veio" — a fila de conferência.
--
--   estorna_movimento
--       sureya_estornar_servico    → where estorna_movimento is null
--                                    insert ... estorna_movimento = v_deb_id
--       É o que impede estornar duas vezes o mesmo débito.
--
-- Os tipos abaixo vêm do uso, não de preferência: `clock_timestamp()` é
-- timestamptz, `auth.uid()` é uuid, `p_sem_comprovante` é boolean com default
-- false (a chamada normal omite), e `estorna_movimento` guarda o id de outro
-- movimento — daí a auto-referência.
--
-- ⚠️ Mesma ressalva da Parte 1: confira contra o banco real. Em produção estas
-- linhas são inertes (`if not exists`).
-- ############################################################################

alter table movimentos add column if not exists conferido_em     timestamptz;
alter table movimentos add column if not exists conferido_por    uuid;
alter table movimentos add column if not exists nota_conferencia text;
alter table movimentos add column if not exists sem_comprovante  boolean not null default false;
alter table movimentos add column if not exists estorna_movimento uuid references movimentos(id) on delete set null;

comment on column movimentos.conferido_em is
  'Quando este lançamento foi batido com o extrato do banco. Nulo = ainda na fila de conferência.';
comment on column movimentos.sem_comprovante is
  'true = pagamento informado sem comprovante anexado. Alimenta sureya_a_conferir_no_banco.';
comment on column movimentos.estorna_movimento is
  'Aponta para o débito que este crédito estorna. Impede estornar duas vezes (sureya_estornar_servico).';

-- A fila de conferência é uma consulta de tela: filtra por org + crédito +
-- sem_comprovante e ordena por conferido_em.
create index if not exists idx_movimentos_a_conferir
  on movimentos (org_id, data desc)
  where sem_comprovante and tipo = 'credito';

-- `sureya_estornar_servico` procura o débito ainda não estornado de um serviço.
create index if not exists idx_movimentos_estorno
  on movimentos (org_id, servico_id)
  where estorna_movimento is null;

-- ============================================================================
-- CONFERÊNCIA
--
-- (a) A tabela `quitacoes` do banco real bate com esta?
--     select column_name, data_type, is_nullable, column_default
--       from information_schema.columns
--      where table_schema='public' and table_name='quitacoes'
--      order by ordinal_position;
--
-- (b) E as restrições? O `on conflict do nothing` precisa da única.
--     select conname, pg_get_constraintdef(oid)
--       from pg_constraint where conrelid = 'quitacoes'::regclass;
--
-- (c) E as cinco colunas de `movimentos`?
--     select column_name, data_type, column_default, is_nullable
--       from information_schema.columns
--      where table_schema='public' and table_name='movimentos'
--        and column_name in ('conferido_em','conferido_por','nota_conferencia',
--                            'sem_comprovante','estorna_movimento');
--
-- (d) Se houver diferença, o banco vence: ajuste este arquivo e registre o
--     motivo. A baseline é para descrever o que existe, não o que se preferia.
-- ============================================================================
