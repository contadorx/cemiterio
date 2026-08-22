-- ============================================================================
-- SUREYA — 0043 · O FIXO DO MÊS NÃO PODE SER PAGO DUAS VEZES
--
-- O PROBLEMA
-- ---------------------------------------------------------------------------
-- No acerto com a equipe, os JAZIGOS ficam marcados (`pago_executora_em`), mas
-- a parte FIXA do mês não é registrada em lugar nenhum — o próprio código
-- admite isso num comentário ("o fixo do mes NAO fica em aberto no banco").
--
-- Consequência: clicar "Acertar" duas vezes no mesmo mês paga o salário duas
-- vezes. Os jazigos não repetem (já estão marcados), mas o fixo sai de novo,
-- inteiro. A única pista fica na descrição do lançamento do caixa.
--
-- Esta tabela é o registro que faltava: um fixo por pessoa por mês. A chave
-- primária é (org, membro, mês) — o banco recusa a segunda tentativa, mesmo
-- que duas abas cliquem ao mesmo tempo.
--
-- ⚠ O QUE SE PERDE: NADA. Só cria tabela nova.
--   ⚠ ATENÇÃO AO HISTÓRICO: acertos que já aconteceram NÃO estão aqui (não
--   havia onde guardar). Então, no primeiro mês depois de subir, o sistema vai
--   achar que o fixo daquele mês ainda não foi pago — mesmo que tenha sido.
--   COMO CONFERIR ANTES: rode a consulta 2 no fim deste arquivo, ache os
--   acertos já lançados no caixa e, para cada um, insira a linha
--   correspondente com o INSERT comentado ali embaixo. Leva um minuto e evita
--   pagar o mês corrente de novo.
-- ============================================================================

create table if not exists acertos_equipe (
  org_id       uuid not null references orgs(id) on delete cascade,
  membro_id    uuid not null,              -- auth user da pessoa (mesmo id de membros.user_id)
  mes_ref      text not null,              -- 'AAAA-MM'
  valor_mensal numeric(10,2) not null,
  lote         uuid,                       -- casa com servicos.pago_executora_lote
  observacao   text,
  pago_por     uuid,
  created_at   timestamptz not null default now(),
  primary key (org_id, membro_id, mes_ref)
);

alter table acertos_equipe enable row level security;

create policy acertos_equipe_org on acertos_equipe
  using (org_id = current_org_id()) with check (org_id = current_org_id());

comment on table acertos_equipe is
  'Um registro por pessoa por mês do FIXO já pago. A chave primária é o que impede pagar o mesmo mês duas vezes.';

-- ============================================================================
-- CONFERÊNCIA
-- ============================================================================

-- ⚠ AS DUAS CONSULTAS ABAIXO ESTÃO COMENTADAS DE PROPÓSITO.
-- Elas leem `lancamentos`, que não era criada por migration nenhuma (só a 0045
-- passou a criar). Deixá-las soltas fazia este arquivo ABORTAR em base limpa —
-- o mesmo defeito que a 0031 tinha. Descomente para rodar no seu banco.

-- 1) Deve começar vazia.
-- select * from acertos_equipe order by mes_ref desc;

-- 2) OS ACERTOS QUE JÁ ACONTECERAM (para você decidir se precisa registrar).
--    Procura no caixa as saídas de acerto com a palavra "mensal" na descrição —
--    é o formato que o código usa. Olhe a data e a descrição de cada uma.
-- select id, data, valor, descricao
--   from lancamentos
--  where tipo = 'saida'
--    and descricao ilike 'Acerto %'
--    and descricao ilike '%mensal%'
--  order by data desc;

-- 3) Para CADA linha acima que for do mês corrente ou do anterior, registre o
--    fixo já pago (senão o sistema vai oferecer pagar de novo). Troque os
--    valores e descomente:
--
-- insert into acertos_equipe (org_id, membro_id, mes_ref, valor_mensal, observacao)
-- select current_org_id(),
--        (select user_id from membros where nome ilike '%NOME DA PESSOA%' limit 1),
--        '2026-08',        -- mês de referência
--        1200.00,          -- só a parte FIXA, não o total do lançamento
--        'registro retroativo do acerto já pago'
-- on conflict do nothing;
