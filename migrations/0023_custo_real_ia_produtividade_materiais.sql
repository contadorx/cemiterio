-- 0023 · Custo REAL de IA (tokens), produtividade de campo e consumo de material
-- (já aplicada em produção — ver LEIA-ME_custo_ia_produtividade.md)
alter table uso_ia add column if not exists tokens_entrada bigint not null default 0;
alter table uso_ia add column if not exists tokens_saida   bigint not null default 0;
alter table uso_ia add column if not exists custo_real      numeric(10,4) not null default 0;

create table if not exists modelos_ia (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  apelido text not null, modelo text not null,
  preco_entrada numeric(10,4) not null, preco_saida numeric(10,4) not null,
  ativo boolean not null default true, unique (org_id, apelido));
alter table modelos_ia enable row level security;
create policy modelos_ia_org on modelos_ia using (org_id = current_org_id()) with check (org_id = current_org_id());

create table if not exists chamadas_ia (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  proposito text, assunto text, modelo text, apelido text,
  tokens_entrada int not null default 0, tokens_saida int not null default 0,
  custo numeric(10,4) not null default 0,
  cliente_id uuid references clientes(id) on delete set null,
  created_at timestamptz not null default now());
create index if not exists idx_chamadas_ia_dia on chamadas_ia(org_id, created_at desc);
alter table chamadas_ia enable row level security;
create policy chamadas_ia_org on chamadas_ia using (org_id = current_org_id()) with check (org_id = current_org_id());

alter table servicos add column if not exists iniciado_em timestamptz;
alter table servicos add column if not exists duracao_minutos int;
alter table servicos add column if not exists duracao_ajustada int;
alter table servicos add column if not exists motivo_ajuste text;
alter table servicos add column if not exists foto_inicio_url text;
alter table servicos add column if not exists motivo_nao_feito text;
alter table servicos add column if not exists custo_estimado numeric(10,2);
alter table orgs add column if not exists custo_hora_campo numeric(10,2) not null default 15.00;
alter table membros add column if not exists custo_hora numeric(10,2);

alter table materiais add column if not exists consumo_por_limpeza numeric(10,4) not null default 0;
alter table materiais add column if not exists custo_unitario numeric(10,2) not null default 0;
alter table materiais add column if not exists consumo_confirmado boolean not null default false;

create table if not exists compras_material (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  material_id uuid not null references materiais(id) on delete cascade,
  quantidade numeric(10,2) not null, valor_total numeric(10,2) not null,
  data date not null default current_date, limpezas_periodo int,
  consumo_medido numeric(10,4), aplicado boolean not null default false,
  created_at timestamptz not null default now());
alter table compras_material enable row level security;
create policy compras_org on compras_material using (org_id = current_org_id()) with check (org_id = current_org_id());
-- + função sureya_resultado_por_jazigo (ver banco)
