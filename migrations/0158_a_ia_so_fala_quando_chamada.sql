-- ===========================================================================
-- 0158 — A IA SÓ FALA QUANDO CHAMADA, E O PROVEDOR PASSA A SER ESCOLHA
--
-- Medido em 03/09/2026, sobre os 196 rascunhos anteriores ao laço de custo:
--
--     aprovados como estavam ....   4
--     editados antes de enviar ..   6
--     descartados ..............  155
--
-- Cinco por cento de acerto. E o assunto que a IA mais escrevia era o que
-- menos servia: `cobranca`, 170 rascunhos, 152 no lixo.
--
-- Duas mudanças de esquema:
--
-- 1. `modelos_ia.provedor` — a casa passa a poder trocar quem escreve. O mesmo
--    trabalho custa ordens de grandeza diferentes conforme o provedor, e depois
--    de uma noite de US$ 348 isso deixou de ser detalhe.
--
-- 2. Nada mais. O desligamento do rascunho automático mora no código
--    (env.IA_ESCREVE_SOZINHA, desligado por padrão) e não no banco, porque é
--    uma decisão de comportamento do app — quem faz deploy vê; quem só olha a
--    tabela, não.
-- ===========================================================================

alter table modelos_ia add column if not exists provedor text not null default 'anthropic';

alter table modelos_ia drop constraint if exists modelos_ia_provedor_ck;
alter table modelos_ia add constraint modelos_ia_provedor_ck
  check (provedor in ('anthropic', 'deepseek'));

comment on column modelos_ia.provedor is
  'Quem escreve: anthropic ou deepseek. Lido por escolherModelo(); na duvida, anthropic.';

-- O DeepSeek entra DESLIGADO. Ligar quem responde às famílias é decisão de
-- gente, tomada olhando uma resposta de verdade na bancada de calibragem —
-- nao efeito colateral de uma migration.
insert into modelos_ia (org_id, apelido, modelo, provedor, preco_entrada, preco_saida, ativo)
select o.id, 'economico_deepseek', 'deepseek-chat', 'deepseek', 1.60, 6.40, false
from orgs o
where not exists (
  select 1 from modelos_ia m where m.org_id = o.id and m.apelido = 'economico_deepseek'
);

select apelido, modelo, provedor, preco_entrada, preco_saida, ativo
from modelos_ia order by ativo desc, apelido;
