-- ============================================================================
-- O ANDAIME. Não faz parte do esquema: existe só para um Postgres vazio se
-- parecer com um projeto Supabase o bastante para as migrações rodarem.
--
-- Ele é deliberadamente MÍNIMO, e cada peça está aqui por um motivo escrito:
-- um andaime que faz mais do que o Supabase faz esconderia justamente os
-- defeitos que este teste existe para pegar.
-- ============================================================================

-- Os três papéis que o Supabase cria. `anon` e `authenticated` são o navegador;
-- `service_role` é o servidor. Metade das migrações é sobre a diferença.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls; end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

/* A ARMADILHA, e ela é o ponto deste arquivo.

   O Supabase deixa armado um `alter default privileges ... grant execute on
   functions to anon, authenticated`. É por isso que quatro migrações do
   histórico dizem, com todas as letras, que `revoke ... from public` sozinho
   NÃO fecha nada — e é por isso que três delas terminam com um bloco que
   levanta exceção se alguma função ficou aberta.

   Sem reproduzir isto aqui, essas travas passariam por vacuidade: num Postgres
   pelado nenhuma função nasce concedida a `anon`, então o `select` que procura
   funções abertas devolveria vazio de qualquer jeito, e o teste diria "verde"
   sobre uma fechadura que ninguém testou. */
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

/* O Storage. Duas migrações inserem em `storage.buckets` — o balde privado do
   roteiro e o balde público do blog. Só as colunas que elas tocam: inventar o
   resto da tabela do Supabase seria inventar uma verdade que este teste não
   tem como conferir. */
create schema if not exists storage;
create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

-- Onde o Supabase anota o que já aplicou. `db push` lê daqui.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version    text primary key,
  statements text[],
  name       text
);
