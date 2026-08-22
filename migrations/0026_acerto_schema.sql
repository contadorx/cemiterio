-- 0026 — Acerto de schema (reprodutibilidade)
--
-- Várias colunas usadas pelo código foram aplicadas em produção fora do
-- versionamento. No SEU banco elas já existem, então esta migration é NO-OP lá
-- (tudo é "add column IF NOT EXISTS"). O ganho é montar um ambiente novo só pelas
-- migrations sem quebrar — e deixar o schema documentado.
--
-- Tipos inferidos do uso no código. Rode com segurança; não altera nada existente.

-- planos ---------------------------------------------------------------------
alter table planos add column if not exists proxima_cobranca   date;      -- vencimento da próxima cobrança
alter table planos add column if not exists pago_ate           date;      -- pago até (null = nada pago)
alter table planos add column if not exists migrado_em         timestamptz; -- marca "conferido/migrado"
alter table planos add column if not exists momento_cobranca   text;      -- 'antes' | 'depois' | 'contra_foto'
alter table planos add column if not exists lavagens_por_ciclo int;       -- nº de lavagens dentro do período

-- clientes -------------------------------------------------------------------
alter table clientes add column if not exists foto_url            text;
alter table clientes add column if not exists cobranca_antecipada boolean not null default false;

-- tumulos --------------------------------------------------------------------
alter table tumulos add column if not exists numero text;                 -- número/complemento do jazigo

-- servicos -------------------------------------------------------------------
alter table servicos add column if not exists estornado_em   timestamptz; -- quando a cobrança foi estornada
alter table servicos add column if not exists motivo_estorno text;

-- Notas de valor: em ambiente novo, planos migrados podem ter lavagens_por_ciclo
-- nulo; o código lê "lavagens_por_ciclo ?? qtd_por_passagem", então segue seguro.
