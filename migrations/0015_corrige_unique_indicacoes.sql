-- ============================================================================
-- 0015 · BUG: indicacoes.codigo estava UNIQUE (já aplicado em produção).
--
-- O código é do INDICADOR e se repete a cada pessoa que ele indica. Com UNIQUE,
-- a segunda indicação falhava: "duplicate key". Na prática, cada cliente só
-- conseguiria indicar UMA pessoa na vida.
-- O código único de verdade vive em clientes.codigo_indicacao (correto).
-- ============================================================================
alter table indicacoes drop constraint if exists indicacoes_codigo_key;
create index if not exists idx_indicacoes_codigo on indicacoes(org_id, codigo);
