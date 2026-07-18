-- ============================================================================
-- 0017 · Régua de cobrança, régua de ativação e localização quadra+rua
-- (já aplicada em produção em 18/07/2026)
--
-- Vindo do levantamento real (planilha Controle_2026):
--  · o tratamento de cada família importa ("a senhora", "o senhor", "a Dra")
--  · o valor da planilha é MENSAL; a cobrança do ciclo = valor_mensal × meses
--  · a localização é QUADRA + RUA (a rota anda rua por rua)
--  · avulsos não são cobrados: são CONVIDADOS periodicamente e em datas especiais
-- ============================================================================

alter table clientes add column if not exists tratamento text;

create type sureya_regua_cobranca as enum ('suave','padrao','firme','nao_cobrar');
alter table clientes add column if not exists regua_cobranca sureya_regua_cobranca not null default 'padrao';
alter table clientes add column if not exists dias_entre_cobrancas int not null default 7;
alter table clientes add column if not exists max_lembretes int not null default 3;
alter table clientes add column if not exists orientacao_cobranca text;

alter table clientes add column if not exists ativacao_ativa boolean not null default false;
alter table clientes add column if not exists ativacao_meses int not null default 6;
alter table clientes add column if not exists ultima_ativacao_em timestamptz;

alter table tumulos add column if not exists rua text;
create index if not exists idx_tumulos_rota on tumulos(org_id, quadra_id, rua, identificacao);

alter table planos add column if not exists valor_mensal numeric(10,2);

create table if not exists datas_comemorativas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  nome text not null,
  regra text not null default 'fixa',       -- 'fixa' | 'domingo'
  mes int not null, dia int, ordinal_domingo int,
  antecedencia_dias int not null default 10,
  mensagem text, ativa boolean not null default true,
  unique (org_id, nome)
);
alter table datas_comemorativas enable row level security;
create policy datas_com_org on datas_comemorativas
  using (org_id = current_org_id()) with check (org_id = current_org_id());

create table if not exists ativacoes_disparadas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  motivo text not null, ano int not null,
  created_at timestamptz not null default now(),
  unique (org_id, cliente_id, motivo, ano)
);
alter table ativacoes_disparadas enable row level security;
create policy ativacoes_org on ativacoes_disparadas
  using (org_id = current_org_id()) with check (org_id = current_org_id());
