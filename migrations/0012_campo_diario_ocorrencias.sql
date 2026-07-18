-- ============================================================================
-- SUREYA — Migration 0012 · Campo: diário de bordo, ocorrências, materiais
--
-- Resolve o que faltava: a ajudante não tinha como dizer "choveu", "acabou a
-- água", "o portão estava fechado" — e o sistema não sabia por que o dia rendeu
-- menos, nem o que fazer com o que ficou pra trás.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- DIA DE CAMPO: um registro por pessoa por dia (abre no início, fecha no fim)
-- ----------------------------------------------------------------------------
create table if not exists dias_campo (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  executora_id   uuid,                          -- membro de campo (null = turno único)
  data           date not null default current_date,
  meta_tumulos   int  not null default 0,       -- quantos estavam previstos
  feitos         int  not null default 0,       -- preenchido no fechamento
  clima          text,                          -- 'bom' | 'chuva' | 'calor_forte'
  observacoes    text,                          -- o que a pessoa relatou
  iniciado_em    timestamptz,
  encerrado_em   timestamptz,
  created_at     timestamptz not null default now(),
  unique (org_id, executora_id, data)
);
alter table dias_campo enable row level security;
create policy dias_campo_org on dias_campo
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ----------------------------------------------------------------------------
-- OCORRÊNCIAS: imprevistos que custam túmulos (chuva, água, material, acesso)
-- ----------------------------------------------------------------------------
create type sureya_tipo_ocorrencia as enum
  ('chuva','falta_agua','falta_material','acesso','saude','tumulo_nao_encontrado','outro');

create table if not exists ocorrencias (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  dia_campo_id  uuid references dias_campo(id) on delete set null,
  servico_id    uuid references servicos(id) on delete set null,  -- se travou um específico
  tipo          sureya_tipo_ocorrencia not null default 'outro',
  descricao     text,
  impacto       int not null default 0,        -- quantos túmulos deixaram de ser feitos
  resolvida     boolean not null default false,
  registrada_por uuid,
  created_at    timestamptz not null default now()
);
create index if not exists idx_ocorrencias_org on ocorrencias(org_id, created_at desc);
alter table ocorrencias enable row level security;
create policy ocorrencias_org on ocorrencias
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ----------------------------------------------------------------------------
-- MATERIAIS: controle simples de consumo (a ajudante avisa quando está acabando)
-- ----------------------------------------------------------------------------
create table if not exists materiais (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  nome           text not null,
  unidade        text not null default 'un',
  estoque        numeric(10,2) not null default 0,
  alerta_minimo  numeric(10,2) not null default 0,
  atualizado_em  timestamptz not null default now(),
  unique (org_id, nome)
);
alter table materiais enable row level security;
create policy materiais_org on materiais
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ----------------------------------------------------------------------------
-- BACKLOG: serviço que não foi feito no dia não some — vira prioridade
-- ----------------------------------------------------------------------------
alter table servicos add column if not exists prioridade int not null default 0;  -- maior = antes
alter table servicos add column if not exists adiado_vezes int not null default 0;
alter table servicos add column if not exists motivo_adiamento text;

create index if not exists idx_servicos_backlog on servicos(org_id, status, prioridade desc);

-- ----------------------------------------------------------------------------
-- Fecha o dia: o que não foi feito volta pro backlog com prioridade elevada.
-- Retorna quantos serviços foram devolvidos.
-- ----------------------------------------------------------------------------
create or replace function sureya_fechar_dia(
  p_executora uuid,
  p_data date,
  p_clima text,
  p_observacoes text
)
returns table (devolvidos int, feitos int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_dia uuid;
  v_feitos int;
  v_devolvidos int;
begin
  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;

  select count(*) into v_feitos
  from servicos
  where org_id = v_org and data_prevista = p_data and status = 'executado'
    and (p_executora is null or executora_id = p_executora);

  -- o que sobrou volta pro backlog, com prioridade maior a cada adiamento
  with devolvidos as (
    update servicos set
      status = 'pendente',
      data_prevista = null,
      ordem_dia = null,
      prioridade = prioridade + 10,
      adiado_vezes = adiado_vezes + 1,
      motivo_adiamento = coalesce(p_observacoes, 'não concluído no dia')
    where org_id = v_org
      and data_prevista = p_data
      and status in ('agendado','pendente')
      and (p_executora is null or executora_id = p_executora)
    returning 1
  )
  select count(*) into v_devolvidos from devolvidos;

  insert into dias_campo (org_id, executora_id, data, feitos, clima, observacoes, encerrado_em)
  values (v_org, p_executora, p_data, v_feitos, p_clima, p_observacoes, now())
  on conflict (org_id, executora_id, data) do update
    set feitos = excluded.feitos,
        clima = coalesce(excluded.clima, dias_campo.clima),
        observacoes = coalesce(excluded.observacoes, dias_campo.observacoes),
        encerrado_em = now()
  returning id into v_dia;

  return query select v_devolvidos, v_feitos;
end;
$$;
revoke all on function sureya_fechar_dia(uuid, date, text, text) from public;
grant execute on function sureya_fechar_dia(uuid, date, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Puxa serviços do futuro para hoje (quando o dia rendeu mais que o previsto)
-- ----------------------------------------------------------------------------
create or replace function sureya_puxar_servicos(p_executora uuid, p_quantidade int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_qtd int;
begin
  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;

  with alvo as (
    select id from servicos
    where org_id = v_org
      and status in ('pendente','agendado')
      and (data_prevista is null or data_prevista > current_date)
    order by prioridade desc, data_prevista nulls first
    limit greatest(1, least(coalesce(p_quantidade,5), 30))
  ),
  movidos as (
    update servicos s set
      data_prevista = current_date,
      status = 'agendado',
      executora_id = coalesce(p_executora, s.executora_id),
      ordem_dia = 999
    from alvo
    where s.id = alvo.id
    returning 1
  )
  select count(*) into v_qtd from movidos;

  return v_qtd;
end;
$$;
revoke all on function sureya_puxar_servicos(uuid, int) from public;
grant execute on function sureya_puxar_servicos(uuid, int) to authenticated;

-- ============================================================================
-- FIM 0012.
-- ============================================================================
