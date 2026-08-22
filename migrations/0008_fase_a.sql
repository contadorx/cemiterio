-- ============================================================================
-- SUREYA — Migration 0008 · Fase A (P0) + suportes da Fase B
--  (a) Idempotência do webhook (eventos do Evolution)
--  (b) Fila de leads (números desconhecidos deixam de ser descartados)
--  (c) Fila de reenvio de mensagens (retry quando o Evolution falha)
--  (d) Debounce de rajadas (coluna processada + ultima_entrada_at)
--  (e) Avisos de saldo/cobrança gentil (controles no cliente)
--  (f) Gatilhos de data (Finados/aniversários) com trava anual
--  (g) Mensagem inicial para leads no config_ia
-- ============================================================================

-- (a) Idempotência: cada evento do Evolution só é processado uma vez
create table if not exists eventos_webhook (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references orgs(id) on delete cascade,
  evolution_msg_id text not null,
  created_at       timestamptz not null default now(),
  unique (org_id, evolution_msg_id)
);
alter table eventos_webhook enable row level security;
create policy eventos_webhook_org on eventos_webhook
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- (b) Leads: quem escreve e ainda não é cliente
create type sureya_status_lead as enum ('novo','em_conversa','convertido','descartado');

create table if not exists leads (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  telefone           text not null,
  nome_wa            text,
  mensagens          jsonb not null default '[]'::jsonb, -- últimas ~20 [{t,texto}]
  status             sureya_status_lead not null default 'novo',
  respondido_inicial boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (org_id, telefone)
);
alter table leads enable row level security;
create policy leads_org on leads
  using (org_id = current_org_id()) with check (org_id = current_org_id());
create trigger trg_leads_updated before update on leads
  for each row execute function set_updated_at();

-- (c) Fila de reenvio: mensagens que falharam ao sair
create type sureya_status_envio as enum ('pendente','enviado','falhou');

create table if not exists fila_envios (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  telefone      text not null,
  tipo          text not null default 'texto',   -- 'texto' | 'midia'
  payload       jsonb not null,                  -- {texto} | {media, caption}
  tentativas    int not null default 0,
  status        sureya_status_envio not null default 'pendente',
  ultimo_erro   text,
  proximo_retry timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists idx_fila_envios_pend on fila_envios(org_id, status, proximo_retry);
alter table fila_envios enable row level security;
create policy fila_envios_org on fila_envios
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- (d) Debounce: entradas ainda não processadas pela IA + carimbo da última entrada
alter table mensagens add column if not exists processada boolean not null default true;
alter table conversas add column if not exists ultima_entrada_at timestamptz;
create index if not exists idx_msgs_nao_proc on mensagens(conversa_id) where processada = false;

-- (e) Controles de aviso/cobrança no cliente
alter table clientes add column if not exists aviso_saldo_em timestamptz;
alter table clientes add column if not exists cobranca_em    timestamptz;
alter table clientes add column if not exists cobranca_nivel int not null default 0;

-- (f) Gatilhos de data: trava de disparo anual por túmulo/tipo
create table if not exists gatilhos_disparados (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  tumulo_id  uuid not null references tumulos(id) on delete cascade,
  tipo       text not null,        -- 'falecimento' | 'nascimento' | 'finados'
  ano        int  not null,
  created_at timestamptz not null default now(),
  unique (org_id, tumulo_id, tipo, ano)
);
alter table gatilhos_disparados enable row level security;
create policy gatilhos_org on gatilhos_disparados
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- (g) Mensagem inicial de boas-vindas a leads (opcional)
alter table config_ia add column if not exists msg_lead_inicial text;

-- ============================================================================
-- FIM 0008.
-- ============================================================================
