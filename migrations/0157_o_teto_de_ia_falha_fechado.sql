-- ===========================================================================
-- 0157 — O TETO DE IA PASSA A VALER EM DINHEIRO
--
-- 03/09/2026: US$ 348,18 em 24 horas, 5.838 chamadas ao modelo, sobre TRÊS
-- conversas JÁ FINALIZADAS reprocessadas ~990 vezes cada. Num dia normal são
-- 15 a 25 chamadas e menos de US$ 2.
--
-- O teto estava em 150 chamadas/dia e não barrou nada, porque o contador que
-- ele lia (`uso_ia.chamadas`) marcou 14 enquanto `chamadas_ia` registrava
-- 5.776. Duas contagens da mesma coisa.
--
-- Contar CHAMADAS também é frágil: 150 chamadas de Haiku custam centavos e 150
-- de Sonnet com contexto grande custam dezenas de dólares. O teto que protege
-- é o de dinheiro.
-- ===========================================================================

alter table orgs add column if not exists teto_ia_dolar_dia numeric(10,2);

comment on column orgs.teto_ia_dolar_dia is
  'Teto de gasto com IA por dia, em dolares. Nulo = usa o padrao do codigo (US$ 10). '
  'Lido por podeChamarIa(), que soma custo real de chamadas_ia no dia de operacao.';

-- Um teto explícito para esta casa. US$ 15/dia é ~7x o pior dia normal
-- (US$ 2) e 4% do que o laço de 03/09 custou antes de alguém perceber.
update orgs set teto_ia_dolar_dia = 15 where teto_ia_dolar_dia is null;

select nome, teto_ia_dia, teto_ia_dolar_dia from orgs;
