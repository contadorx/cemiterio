-- ============================================================================
-- SUREYA — Limpeza de túmulos · Fatia 1: modelo de dados
-- Migration 0001 — schema base (multi-tenant, RLS, enums)
-- Stack: Supabase (Postgres). Padrão da casa: org_id derivado de auth.uid().
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
create type sureya_modo_atendimento as enum ('copiloto', 'automatico');
create type sureya_assunto_ia       as enum ('cobranca','agendamento','duvida','luto','reclamacao','outro');
create type sureya_acao_humana      as enum ('aprovou','editou','descartou','enviou_direto');
create type sureya_status_servico   as enum ('pendente','agendado','executado','pulado','cancelado');
create type sureya_tipo_movimento   as enum ('credito','debito');
create type sureya_origem_movimento as enum ('pix_comprovante','conciliacao_manual','psp_auto','servico','ajuste');
create type sureya_status_conc      as enum ('a_conferir','confirmado','rejeitado');
create type sureya_cadencia         as enum ('avulso','mensal','bimestral','trimestral','semestral','anual','por_data');
create type sureya_direcao_msg      as enum ('entrada','saida');
create type sureya_autor_msg        as enum ('cliente','ia','humano','campo','sistema');
create type sureya_papel_membro     as enum ('admin','campo');

-- ----------------------------------------------------------------------------
-- ORG + MEMBROS (tenancy) + helper de RLS
-- ----------------------------------------------------------------------------
create table orgs (
  id                       uuid primary key default gen_random_uuid(),
  nome                     text not null,
  limpezas_por_dia         int  not null default 20,      -- capacidade da ajudante
  dias_trabalhados_semana  int  not null default 6,       -- p/ cálculo de carga
  valor_referencia_limpeza numeric(10,2) not null default 40.00, -- âncora da "temperatura de aumento"
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table membros (
  org_id     uuid not null references orgs(id) on delete cascade,
  user_id    uuid not null,                    -- = auth.uid()
  papel      sureya_papel_membro not null default 'admin',
  nome       text,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- org corrente do usuário autenticado (SECURITY DEFINER: tenant nunca vem do client)
create or replace function current_org_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select org_id from membros where user_id = auth.uid() limit 1;
$$;

-- ----------------------------------------------------------------------------
-- CLIENTES  (o telefone É a allowlist: número que não bate aqui = IA muda)
-- ----------------------------------------------------------------------------
create table clientes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  nome          text not null,
  telefone      text not null,                              -- whatsapp normalizado (E.164)
  ativo_ia      boolean not null default true,              -- IA pode agir neste contato?
  modo          sureya_modo_atendimento not null default 'copiloto',
  score         numeric(5,2) not null default 0,            -- entendimento acumulado (0-100)
  perfil_ia     text,                                       -- memória destilada do histórico
  instrucoes_ia text,                                       -- treino manual "por contato"
  observacoes   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, telefone)
);

-- ----------------------------------------------------------------------------
-- MAPA DO CEMITÉRIO: cemiterio > quadra > tumulo
-- ----------------------------------------------------------------------------
create table cemiterios (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  nome       text not null,                                 -- "Cemitério da Saudade — Vila Vitória, Mauá"
  endereco   text,
  lat        double precision,
  lng        double precision,
  created_at timestamptz not null default now()
);

create table quadras (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  cemiterio_id uuid not null references cemiterios(id) on delete cascade,
  codigo       text not null,                               -- "Q-12"
  ordem        int  not null default 0,                     -- p/ ordenar a rota
  created_at   timestamptz not null default now(),
  unique (cemiterio_id, codigo)
);

create table tumulos (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references orgs(id) on delete cascade,
  quadra_id            uuid not null references quadras(id) on delete restrict,
  cliente_id           uuid references clientes(id) on delete set null,
  identificacao        text not null,                       -- lote/número dentro da quadra
  lat                  double precision,                    -- GPS marcado na 1ª limpeza
  lng                  double precision,
  foto_referencia_url  text,                                -- "é este aqui" (backstop visual)
  qr_token             text unique,                         -- fase 2: plaqueta QR (opcional)
  falecido_nome        text,
  datas_gatilho        jsonb not null default '[]'::jsonb,  -- [{tipo:'falecimento',data:'--MM-DD'}]
  observacoes          text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- PLANOS (recorrência)  — motor da agenda; valor_vigente alimenta o reajuste
-- ----------------------------------------------------------------------------
create table planos (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references orgs(id) on delete cascade,
  cliente_id          uuid not null references clientes(id) on delete cascade,
  tumulo_id           uuid not null references tumulos(id) on delete cascade,
  cadencia            sureya_cadencia not null default 'mensal',
  n_limpezas_ciclo    int  not null default 2,              -- "normalmente duas limpezas"
  valor_vigente       numeric(10,2) not null default 40.00, -- preço por limpeza hoje
  data_valor_vigente  date not null default current_date,   -- desde quando (temperatura de aumento)
  dia_referencia      int,                                  -- dia do mês âncora, se aplicável
  ativo               boolean not null default true,
  proximo_servico     date,                                 -- preenchido pelo alocador
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table reajustes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  plano_id       uuid not null references planos(id) on delete cascade,
  cliente_id     uuid not null references clientes(id) on delete cascade,
  valor_anterior numeric(10,2) not null,
  valor_novo     numeric(10,2) not null,
  motivo         text,
  aprovado_por   uuid,
  created_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- SERVIÇOS  — o loop de campo (foto do depois FECHA o serviço e vai à família)
-- ----------------------------------------------------------------------------
create table servicos (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references orgs(id) on delete cascade,
  tumulo_id          uuid not null references tumulos(id) on delete cascade,
  plano_id           uuid references planos(id) on delete set null, -- null = avulso
  cliente_id         uuid references clientes(id) on delete set null,
  data_prevista      date,
  ordem_dia          int,                                    -- posição na rota do dia (alocador)
  executora_id       uuid,                                   -- membro de campo (Nina)
  status             sureya_status_servico not null default 'pendente',
  data_executada     timestamptz,
  foto_antes_url     text,
  foto_depois_url    text,                                   -- sem foto = não feito
  valor              numeric(10,2),                          -- congelado no preço do dia
  notificado_cliente boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- FINANCEIRO: conta-corrente (antecipado/postecipado) + comprovantes Pix
-- Camada de conciliação por ADAPTADOR: o sistema só recebe 'pagamento_confirmado';
-- hoje via comprovante lido pela IA ou conferência manual; amanhã via PSP.
-- ----------------------------------------------------------------------------
create table comprovantes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  cliente_id    uuid not null references clientes(id) on delete cascade,
  imagem_url    text,
  valor_extraido numeric(10,2),                              -- lido pela IA
  data_extraida  date,
  id_transacao   text,                                       -- id/e2e do Pix, quando visível
  status        sureya_status_conc not null default 'a_conferir',
  created_at    timestamptz not null default now()
);

create table movimentos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  cliente_id    uuid not null references clientes(id) on delete cascade,
  tipo          sureya_tipo_movimento not null,             -- credito=pagto / debito=servico
  valor         numeric(10,2) not null,
  origem        sureya_origem_movimento not null,
  servico_id    uuid references servicos(id) on delete set null,
  comprovante_id uuid references comprovantes(id) on delete set null,
  status_conc   sureya_status_conc not null default 'confirmado',
  descricao     text,
  data          date not null default current_date,
  created_at    timestamptz not null default now()
);
-- Saldo do cliente = Σ(credito confirmado) − Σ(debito). Positivo=adiantado, negativo=em aberto.

-- ----------------------------------------------------------------------------
-- CONVERSA / IA  — histórico (treino) + score (aprovações da humana)
-- ----------------------------------------------------------------------------
create table conversas (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  cliente_id      uuid not null references clientes(id) on delete cascade,
  aberta          boolean not null default true,
  ultimo_assunto  sureya_assunto_ia,
  escalada_humano boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table mensagens (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  conversa_id uuid not null references conversas(id) on delete cascade,
  cliente_id  uuid not null references clientes(id) on delete cascade,
  direcao     sureya_direcao_msg not null,
  autor       sureya_autor_msg not null,
  texto       text,
  midia_url   text,
  created_at  timestamptz not null default now()
);

-- Cada rascunho da IA vs. o que a humana fez com ele: fonte real do score.
create table interacoes_ia (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  cliente_id  uuid not null references clientes(id) on delete cascade,
  conversa_id uuid references conversas(id) on delete set null,
  assunto     sureya_assunto_ia not null default 'outro',
  rascunho    text,
  acao_humana sureya_acao_humana,
  texto_final text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- ÍNDICES
-- ----------------------------------------------------------------------------
create index idx_clientes_org        on clientes(org_id);
create index idx_clientes_tel        on clientes(org_id, telefone);
create index idx_tumulos_quadra      on tumulos(quadra_id);
create index idx_tumulos_cliente     on tumulos(cliente_id);
create index idx_planos_cliente      on planos(cliente_id);
create index idx_planos_proximo      on planos(org_id, proximo_servico) where ativo;
create index idx_servicos_dia        on servicos(org_id, data_prevista, ordem_dia);
create index idx_servicos_status     on servicos(org_id, status);
create index idx_servicos_tumulo     on servicos(tumulo_id);
create index idx_movimentos_cliente  on movimentos(cliente_id);
create index idx_comprovantes_cli    on comprovantes(cliente_id, status);
create index idx_mensagens_conversa  on mensagens(conversa_id, created_at);
create index idx_interacoes_cli      on interacoes_ia(cliente_id, assunto);

-- ----------------------------------------------------------------------------
-- updated_at automático
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

do $$
declare t text;
begin
  foreach t in array array['orgs','clientes','tumulos','planos','servicos','conversas']
  loop
    execute format(
      'create trigger trg_%1$s_updated before update on %1$s
       for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- RLS — tudo isolado por org (org_id = current_org_id())
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'clientes','cemiterios','quadras','tumulos','planos','reajustes',
    'servicos','comprovantes','movimentos','conversas','mensagens','interacoes_ia'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format($p$
      create policy %1$s_org on %1$s
        using (org_id = current_org_id())
        with check (org_id = current_org_id());
    $p$, t);
  end loop;
end $$;

-- orgs/membros: usuário só enxerga a própria org
alter table orgs    enable row level security;
alter table membros enable row level security;
create policy orgs_self on orgs
  using (id = current_org_id()) with check (id = current_org_id());
create policy membros_self on membros
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ============================================================================
-- FIM 0001. Próximas fatias plugam sobre este schema:
--   0002  webhook Evolution → IA (contexto por contato + ferramentas + escalar)
--   0003  conciliação (adaptador) + leitura de comprovante + saldo
--   0004  alocador do dia (rota por quadra/proximidade) + carga×capacidade
--   0005  temperatura de aumento (RPC) + rascunho de reajuste (copiloto)
-- ============================================================================
