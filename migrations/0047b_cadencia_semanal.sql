-- =====================================================================
-- 0047b · SEMANAL E QUINZENAL NA CADÊNCIA
-- =====================================================================
--
-- ESTE ARQUIVO RODA SOZINHO. Não junte com outro.
--
-- POR QUÊ
-- `alter type ... add value` não aceita rodar dentro de um bloco de
-- transação em boa parte dos ambientes — e o editor SQL do Supabase envolve
-- o que você cola em uma transação. Se estas duas linhas estivessem dentro
-- da 0047, elas derrubariam a migration inteira com um erro que não explica
-- nada ("ALTER TYPE ... cannot run inside a transaction block").
--
-- COMO RODAR
--   1. Cole SÓ este arquivo no editor e execute.
--   2. Depois disso, rode a 0047, a 0048, a 0049 e a 0050 normalmente.
--
-- Rodar duas vezes é inofensivo: o `if not exists` protege.
-- =====================================================================

alter type sureya_cadencia add value if not exists 'semanal';
alter type sureya_cadencia add value if not exists 'quinzenal';

-- Conferência:
-- select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
--  where t.typname = 'sureya_cadencia' order by e.enumsortorder;
