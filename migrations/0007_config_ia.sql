-- ============================================================================
-- SUREYA — Migration 0007 · Treino global do agente
-- Conhecimento-base (preços, procedimentos, FAQ, tom) injetado em toda conversa.
-- ============================================================================

create table if not exists config_ia (
  org_id            uuid primary key references orgs(id) on delete cascade,
  conhecimento_base text,
  tom               text,
  updated_at        timestamptz not null default now()
);

alter table config_ia enable row level security;

create policy config_ia_org on config_ia
  using (org_id = current_org_id())
  with check (org_id = current_org_id());

-- ============================================================================
-- FIM 0007.
-- ============================================================================
