-- ============================================================================
-- SUREYA — Migration 0011 · Multi-ajudante + Auditoria + Campanhas + Custo IA
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (D5) MULTI-AJUDANTE: capacidade por pessoa, não só da org
-- ----------------------------------------------------------------------------
alter table membros add column if not exists limpezas_por_dia int;   -- null = usa o padrão da org
alter table membros add column if not exists ativo boolean not null default true;

-- índice para a agenda por executora
create index if not exists idx_servicos_executora on servicos(org_id, executora_id, data_prevista);

-- ----------------------------------------------------------------------------
-- (G2) AUDITORIA: quem fez o quê (ações sensíveis)
-- ----------------------------------------------------------------------------
create table if not exists auditoria (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  user_id    uuid,
  acao       text not null,        -- 'confirmou_pagamento' | 'aplicou_reajuste' | 'anonimizou' ...
  alvo_tipo  text,                 -- 'cliente' | 'servico' | 'movimento' ...
  alvo_id    uuid,
  detalhe    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_auditoria_org on auditoria(org_id, created_at desc);
alter table auditoria enable row level security;
create policy auditoria_org on auditoria
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ----------------------------------------------------------------------------
-- (F2) CAMPANHAS SAZONAIS: disparo em lote respeitoso (sempre em rascunho)
-- ----------------------------------------------------------------------------
create table if not exists campanhas (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  nome          text not null,
  mensagem      text not null,
  publico       text not null default 'todos',   -- 'todos' | 'ativos' | 'em_aberto' | 'sem_servico_90d'
  criados       int not null default 0,
  executada_em  timestamptz,
  created_at    timestamptz not null default now()
);
alter table campanhas enable row level security;
create policy campanhas_org on campanhas
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ----------------------------------------------------------------------------
-- (A8) CUSTO DA IA: contagem diária de chamadas, para teto e acompanhamento
-- ----------------------------------------------------------------------------
create table if not exists uso_ia (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  dia        date not null default current_date,
  chamadas   int  not null default 0,
  unique (org_id, dia)
);
alter table uso_ia enable row level security;
create policy uso_ia_org on uso_ia
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- incrementa e devolve o total do dia (chamado antes de acionar o modelo)
create or replace function sureya_registrar_uso_ia(p_org uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_total int;
begin
  insert into uso_ia (org_id, dia, chamadas)
  values (p_org, current_date, 1)
  on conflict (org_id, dia) do update set chamadas = uso_ia.chamadas + 1
  returning chamadas into v_total;
  return v_total;
end;
$$;
revoke all on function sureya_registrar_uso_ia(uuid) from public;
grant execute on function sureya_registrar_uso_ia(uuid) to authenticated, service_role;

-- teto diário configurável por org (0 = sem teto)
alter table orgs add column if not exists teto_ia_dia int not null default 0;

-- ----------------------------------------------------------------------------
-- (B4) DESTILAÇÃO AUTOMÁTICA: marca quando o perfil da IA foi atualizado
-- ----------------------------------------------------------------------------
alter table clientes add column if not exists perfil_ia_em timestamptz;
alter table clientes add column if not exists perfil_ia_msgs int not null default 0;

-- ============================================================================
-- FIM 0011.
-- ============================================================================
