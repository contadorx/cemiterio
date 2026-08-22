-- ============================================================================
-- O CLIENTE vira a entidade central; o domínio vira uma REGRA de inscrição.
--
-- Por que agora: hoje um cliente É um domínio, e isso quebra na primeira
-- empresa com dois domínios (fusão, marca comprada) ou na primeira pessoa de
-- fora do domínio (consultor terceirizado com e-mail próprio). Feito com três
-- linhas na tabela custa uma migração; feito depois de dez clientes com fatura
-- amarrada, custa dez vezes mais.
--
-- O que NÃO muda: plano_de e registrar_emissao mantêm a assinatura, porque é o
-- que a Edge Function da licença chama e o que os testes de licença cobrem.
-- ============================================================================

create table if not exists walkstamp.cliente (
  id            bigserial primary key,
  nome          text not null,
  documento     text,                       -- CNPJ/CPF, para a nota
  plano         text not null default 'time' check (plano in ('personal','time')),
  assentos      integer not null default 25,
  dias          integer not null default 90,
  ativo         boolean not null default true,
  stripe_id     text,                       -- customer da Stripe
  criado_em     timestamptz not null default now()
);

create table if not exists walkstamp.usuario (
  id            bigserial primary key,
  cliente_id    bigint references walkstamp.cliente(id) on delete set null,
  email         text not null unique,
  papel         text not null default 'membro' check (papel in ('admin','membro')),
  ativo         boolean not null default true,
  emissoes      integer not null default 0,
  ultima_em     timestamptz,
  vence_em      date,
  convidado_por text,
  criado_em     timestamptz not null default now()
);
create index if not exists usuario_cliente_idx on walkstamp.usuario (cliente_id);

-- Histórico: uma linha por licença emitida. A conta guarda o ESTADO; isto
-- guarda o que aconteceu, que é o que uma auditoria interna do cliente pede.
create table if not exists walkstamp.emissao (
  id         bigserial primary key,
  cliente_id bigint references walkstamp.cliente(id) on delete set null,
  email      text not null,
  plano      text,
  dias       integer,
  vence_em   date,
  motivo     text,
  criado_em  timestamptz not null default now()
);
create index if not exists emissao_cliente_idx on walkstamp.emissao (cliente_id, criado_em desc);

create table if not exists walkstamp.fatura (
  id         bigserial primary key,
  cliente_id bigint not null references walkstamp.cliente(id) on delete cascade,
  numero     text,
  competencia date,
  valor_centavos integer not null default 0,
  moeda      text not null default 'BRL',
  status     text not null default 'aberta' check (status in ('aberta','paga','vencida','cancelada')),
  vence_em   date,
  pago_em    timestamptz,
  /* A nota sai do Financeirox depois do pagamento; aqui fica só o endereço
     dela. O Walkstamp não emite nota e não guarda PDF de nota por acidente. */
  nf_url     text,
  nf_numero  text,
  stripe_id  text,
  criado_em  timestamptz not null default now()
);
create index if not exists fatura_cliente_idx on walkstamp.fatura (cliente_id, competencia desc);

-- O perfil de equipe empurrado, e os modelos de documento. Nada aqui é
-- conteúdo: é logotipo, nome de empresa e rótulo de campo.
create table if not exists walkstamp.config (
  cliente_id  bigint primary key references walkstamp.cliente(id) on delete cascade,
  empresa     text,
  logo_url    text,
  cenario     text,
  rotulo      text,
  ambiente    text,
  atualizado_em timestamptz not null default now()
);

create table if not exists walkstamp.modelo_doc (
  id         bigserial primary key,
  cliente_id bigint not null references walkstamp.cliente(id) on delete cascade,
  nome       text not null,
  escopo     text not null default 'time' check (escopo in ('personal','time')),
  dados      jsonb not null default '{}'::jsonb,
  criado_em  timestamptz not null default now()
);
create index if not exists modelo_cliente_idx on walkstamp.modelo_doc (cliente_id);

alter table walkstamp.dominio add column if not exists cliente_id bigint references walkstamp.cliente(id) on delete cascade;

-- ---------------------------------------------------------------- migração
do $$
declare d record; c record; novo bigint;
begin
  -- 1. cada domínio vira um cliente
  for d in select * from walkstamp.dominio loop
    if d.cliente_id is null then
      insert into walkstamp.cliente (nome, plano, assentos, dias, ativo)
      values (coalesce(d.cliente, d.dominio), 'time', d.assentos, d.dias, d.ativo)
      returning id into novo;
      update walkstamp.dominio set cliente_id = novo where dominio = d.dominio;
    end if;
  end loop;

  -- 2. cada conta vira um usuário, ligado ao cliente do domínio dela
  for c in select * from walkstamp.conta loop
    insert into walkstamp.usuario (cliente_id, email, ativo, emissoes, ultima_em, vence_em)
    select dd.cliente_id, c.email, c.ativo, c.emissoes, c.ultima_em, c.vence_em
      from (select cliente_id from walkstamp.dominio
             where lower(dominio) = split_part(lower(c.email),'@',2)) dd
    on conflict (email) do nothing;
    -- conta explícita sem domínio: cliente próprio, para não perder o acordo
    if not exists (select 1 from walkstamp.usuario where email = c.email) then
      if c.plano = 'time' then
        insert into walkstamp.cliente (nome, plano, assentos, dias, ativo)
        values (coalesce(c.cliente, c.email), 'time', c.assentos, c.dias, c.ativo)
        returning id into novo;
      else novo := null;
      end if;
      insert into walkstamp.usuario (cliente_id, email, ativo, emissoes, ultima_em, vence_em)
      values (novo, c.email, c.ativo, c.emissoes, c.ultima_em, c.vence_em)
      on conflict (email) do nothing;
    end if;
  end loop;

  -- 3. o administrador do domínio vira usuário com papel de admin
  for d in select * from walkstamp.dominio where admin_email is not null loop
    insert into walkstamp.usuario (cliente_id, email, papel)
    values (d.cliente_id, lower(d.admin_email), 'admin')
    on conflict (email) do update set papel = 'admin',
      cliente_id = coalesce(walkstamp.usuario.cliente_id, excluded.cliente_id);
  end loop;
end $$;
