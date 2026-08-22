-- Tudo do Walkstamp mora no esquema `walkstamp`, que o PostgREST NÃO expõe.
-- O navegador nunca fala com tabela: fala com quatro funções em `public`, e
-- só com elas. É o mesmo desenho do projeto anterior, agora sozinho.
create schema if not exists walkstamp;

-- ---------------------------------------------------------------- medição
-- Três eventos, sem identificador de pessoa, sem IP, sem sessão. O suficiente
-- para saber se o produto é usado; nada perto de saber por quem.
create table if not exists walkstamp.evento (
  id        bigserial primary key,
  nome      text not null
            check (nome in ('abriu_ferramenta','carregou_video','baixou_saida')),
  formato   text check (formato is null or formato in ('pdf','docx','zip','json','vtt')),
  idioma    text check (idioma  is null or idioma  in ('pt','en','es')),
  origem    text check (origem  is null or origem  in ('arquivo','drive','gravacao','exemplo')),
  criado_em timestamptz not null default now()
);

-- ------------------------------------------------------------- lista de aviso
create table if not exists walkstamp.interesse (
  id        bigserial primary key,
  email     text not null unique
            check (length(email) between 6 and 254
                   and email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  idioma    text check (idioma is null or idioma in ('pt','en','es')),
  criado_em timestamptz not null default now()
);

-- ------------------------------------------------------------- plano Time
-- Quem tem direito a quê. Nunca guarda a chave: ela é assinada e entregue.
create table if not exists walkstamp.conta (
  id        bigserial primary key,
  email     text not null unique
            check (length(email) between 6 and 254
                   and email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  plano     text not null default 'teste' check (plano in ('teste','time')),
  assentos  int  not null default 1  check (assentos between 1 and 25),
  dias      int  not null default 14 check (dias between 1 and 100),
  cliente   text,
  ativo     boolean not null default true,
  emissoes  int not null default 0,
  ultima_em timestamptz,
  vence_em  date,
  criado_em timestamptz not null default now()
);

-- Empresa inteira de uma vez: mais barato de administrar que quarenta linhas.
create table if not exists walkstamp.dominio (
  dominio   text primary key,
  assentos  int  not null default 25 check (assentos between 1 and 25),
  dias      int  not null default 90 check (dias between 1 and 100),
  cliente   text,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

create index if not exists conta_dominio_idx on walkstamp.conta ((split_part(email, '@', 2)));

-- RLS ligada e NENHUMA policy, de propósito: só o service_role enxerga estas
-- tabelas. Todo o resto passa pelas funções abaixo.
alter table walkstamp.evento    enable row level security;
alter table walkstamp.interesse enable row level security;
alter table walkstamp.conta     enable row level security;
alter table walkstamp.dominio   enable row level security;
