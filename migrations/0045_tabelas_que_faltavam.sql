-- ============================================================================
-- SUREYA — 0045 · AS ONZE TABELAS QUE O CÓDIGO USA E O REPOSITÓRIO NÃO CRIAVA
--
-- O PROBLEMA
-- ---------------------------------------------------------------------------
-- Onze tabelas foram criadas direto no SQL Editor do Supabase e nunca voltaram
-- para o repositório. O sistema funciona — elas existem em produção —, mas o
-- código do repositório NÃO reproduz o produto: um ambiente novo (uma restauração
-- depois de um acidente, um Supabase novo) sobe pela metade e quebra em runtime,
-- em telas que mexem em dinheiro.
--
-- Pior: a `0031` INSERE em `categorias_financeiras`, que nenhuma migration cria.
-- Em base limpa ela aborta — então nem dava para rodar as migrations em ordem.
--
-- ⚠ O QUE SE PERDE: NADA. Tudo aqui é `create table if not exists`,
--   `create index if not exists` e policy criada só se não existir. Numa base
--   que JÁ tem essas tabelas (a sua produção), este arquivo é um NO-OP: não
--   altera coluna, não apaga linha, não mexe em dado.
--
--   COMO CONFERIR ANTES (guarde o resultado):
--     select table_name, count(*) as colunas
--       from information_schema.columns
--      where table_schema = 'public'
--        and table_name in ('categorias_financeiras','lancamentos','entradas_banco',
--            'conta_equipe','servicos_extras','pedidos_extras','dias_sem_campo',
--            'telefones_ignorados','assinaturas_push','pedidos_ajuda','historico_cliente')
--      group by 1 order by 1;
--   Rode antes e depois: os números têm que ser IDÊNTICOS na sua produção.
--   Se alguma tabela aparecer com MENOS colunas depois, algo está errado — mas
--   isso não pode acontecer, porque `if not exists` não altera tabela existente.
--
-- ⚠ ATENÇÃO — ISTO NÃO SUBSTITUI A VERDADE DO SEU BANCO.
--   As definições abaixo foram DEDUZIDAS do uso no código (cada coluna tem, no
--   comentário, o arquivo que a usa). Onde a produção divergir, quem manda é a
--   produção. Para comparar de verdade, rode `0046_EXTRAIR_do_banco.sql`, que
--   despeja o schema real — inclusive as 24 funções que também faltam aqui.
-- ============================================================================

-- ============================================================================
-- 1. categorias_financeiras — as gavetas do caixa
--    usada em: api/financeiro/gestao, api/equipe/remuneracao, painel/financeiro
-- ============================================================================
create table if not exists categorias_financeiras (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  nome       text not null,
  tipo       text not null check (tipo in ('entrada','saida')),
  grupo      text,                       -- 'pessoal', 'retirada'… lista aberta
  ativa      boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_categorias_org_tipo on categorias_financeiras(org_id, tipo, ativa);

-- ============================================================================
-- 2. lancamentos — o CAIXA (não confundir com `movimentos`, que é a conta das
--    famílias). As saídas vivem só aqui.
-- ============================================================================
create table if not exists lancamentos (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  tipo         text not null check (tipo in ('entrada','saida')),
  valor        numeric(10,2) not null,
  data         date not null default current_date,
  categoria_id uuid references categorias_financeiras(id) on delete set null,
  descricao    text,
  automatico   boolean not null default false,   -- lançado pelo sistema (acerto da equipe)
  created_at   timestamptz not null default now()
);
-- A FK acima não é enfeite: o PostgREST só aceita o embed
-- `categorias_financeiras(nome,grupo)` (api/financeiro/gestao e /mes) porque ela
-- existe. Sem a FK, as duas telas quebram com PGRST200.
create index if not exists idx_lancamentos_org_data on lancamentos(org_id, data desc);
create index if not exists idx_lancamentos_categoria on lancamentos(categoria_id);

-- ============================================================================
-- 3. entradas_banco — o dinheiro que apareceu no extrato e ainda não tem dono
--    `identificada_em is null` = pendente. Esse é o estado, não há coluna de status.
-- ============================================================================
create table if not exists entradas_banco (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  valor           numeric(10,2) not null,
  data            date not null default current_date,
  remetente       text,
  identificador   text,                 -- o id da transação no extrato
  observacao      text,
  cliente_id      uuid references clientes(id) on delete set null,
  identificada_em timestamptz,
  movimento_id    uuid references movimentos(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_entradas_org_data  on entradas_banco(org_id, data desc);
create index if not exists idx_entradas_pendentes on entradas_banco(org_id, identificada_em)
  where identificada_em is null;

-- ============================================================================
-- 4. conta_equipe — o que a equipe TEM A RECEBER de volta (reembolso de
--    material) e o que já foi pago. É outro dinheiro que o pagamento do
--    trabalho: aqui é devolução do que ela gastou do bolso.
-- ============================================================================
create table if not exists conta_equipe (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  membro_id  uuid not null,             -- auth user (mesmo id de membros.user_id)
  tipo       text not null,             -- 'reembolso' | 'pagamento' — CONFERIR na produção
  valor      numeric(10,2) not null,
  data       date not null default current_date,
  descricao  text,
  pago_em    timestamptz,               -- null = ainda em aberto
  compra_id  uuid references compras_material(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_conta_equipe_membro on conta_equipe(org_id, membro_id, pago_em);
create index if not exists idx_conta_equipe_data   on conta_equipe(org_id, data desc);

-- ============================================================================
-- 5. servicos_extras — o catálogo (flor, vela, limpeza reforçada)
-- ============================================================================
create table if not exists servicos_extras (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  nome       text not null,
  descricao  text,
  categoria  text not null default 'outro',
  preco      numeric(10,2) not null default 0,
  custo      numeric(10,2) not null default 0,
  unidade    text not null default 'un',
  sazonal    boolean not null default false,
  meses      int[],                     -- 1-12, quando é sazonal
  ativo      boolean not null default true,
  ordem      int not null default 0,
  created_at timestamptz not null default now()
);
-- OBRIGATÓRIO: api/extras faz upsert com onConflict "org_id,nome". Sem este
-- índice o POST devolve erro 42P10 e o catálogo não salva.
create unique index if not exists uq_extras_org_nome on servicos_extras(org_id, nome);

-- ============================================================================
-- 6. pedidos_extras — o extra pedido por uma família
-- ============================================================================
create table if not exists pedidos_extras (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  cliente_id   uuid not null references clientes(id) on delete cascade,
  tumulo_id    uuid references tumulos(id) on delete set null,
  extra_id     uuid references servicos_extras(id) on delete set null,
  servico_id   uuid references servicos(id) on delete set null,
  nome         text not null,
  quantidade   numeric(10,2) not null default 1,
  preco_unit   numeric(10,2) not null default 0,
  total        numeric(10,2) not null default 0,
  observacao   text,
  status       text not null default 'pedido'
               check (status in ('pedido','entregue','cancelado')),
  data_pedido  date not null default current_date,
  data_entrega date,
  foto_url     text,
  movimento_id uuid references movimentos(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_pedidos_extras_cliente on pedidos_extras(org_id, cliente_id, data_pedido desc);
create index if not exists idx_pedidos_extras_status  on pedidos_extras(org_id, status);

-- ============================================================================
-- 7. dias_sem_campo — feriados e dias em que não se vai a campo
--    lida pelo alocador (lib/agenda.ts) e pela Config → Dias e horários
-- ============================================================================
create table if not exists dias_sem_campo (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  data       date not null,
  motivo     text,
  created_at timestamptz not null default now()
);
-- OBRIGATÓRIO: api/config/jornada faz upsert com onConflict "org_id,data".
create unique index if not exists uq_dias_sem_campo on dias_sem_campo(org_id, data);

-- ============================================================================
-- 8. telefones_ignorados — quem não deve virar lead nunca mais
-- ============================================================================
create table if not exists telefones_ignorados (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  telefone   text not null,
  motivo     text,
  created_at timestamptz not null default now()
);
-- OBRIGATÓRIO: onConflict "org_id,telefone" em api/leads/[id] e acao-massa.
create unique index if not exists uq_tel_ignorados on telefones_ignorados(org_id, telefone);

-- ============================================================================
-- 9. assinaturas_push — os aparelhos que recebem notificação do painel
-- ============================================================================
create table if not exists assinaturas_push (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  user_id    uuid not null,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  aparelho   text,
  ultima_uso timestamptz,
  created_at timestamptz not null default now()
);
-- OBRIGATÓRIO e GLOBAL (não por org): api/push faz onConflict "endpoint".
create unique index if not exists uq_assinaturas_endpoint on assinaturas_push(endpoint);
create index if not exists idx_assinaturas_org_user on assinaturas_push(org_id, user_id);

-- ============================================================================
-- 10. pedidos_ajuda — o histórico do "me ajuda a escrever"
-- ============================================================================
create table if not exists pedidos_ajuda (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  conversa_id uuid not null references conversas(id) on delete cascade,
  cliente_id  uuid references clientes(id) on delete set null,
  contexto    text,
  tom         text not null default 'acolhedor',
  sugestoes   jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_pedidos_ajuda_conversa on pedidos_ajuda(org_id, conversa_id, created_at desc);

-- ============================================================================
-- 11. historico_cliente — quem mudou nome/telefone de uma família, e quando
-- ============================================================================
create table if not exists historico_cliente (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  campo      text not null,              -- 'nome' | 'telefone'
  de         text,
  para       text,
  user_id    uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_historico_cliente on historico_cliente(org_id, cliente_id, created_at desc);

-- ============================================================================
-- RLS — todas são lidas pelo cliente logado. Sem policy, o app vê ZERO linhas.
--
-- O bloco abaixo só cria o que ainda não existe: numa base que já tem as
-- policies, ele não faz nada.
-- ============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'categorias_financeiras','lancamentos','entradas_banco','conta_equipe',
    'servicos_extras','pedidos_extras','dias_sem_campo','telefones_ignorados',
    'assinaturas_push','pedidos_ajuda','historico_cliente'
  ] loop
    execute format('alter table %I enable row level security', t);
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = t and policyname = t || '_org'
    ) then
      execute format(
        'create policy %I on %I using (org_id = current_org_id()) with check (org_id = current_org_id())',
        t || '_org', t
      );
    end if;
  end loop;
end $$;

-- ============================================================================
-- A SEMENTE QUE A 0031 TENTAVA PLANTAR
--
-- A 0031 insere a categoria "Pagamento da equipe" e é ela que o acerto procura
-- (`ilike '%equipe%'`). Em base limpa aquele insert abortava porque a tabela não
-- existia. Aqui ele roda de novo, e é idempotente: numa base que já tem a
-- categoria, o `not exists` impede a duplicata.
-- ============================================================================
insert into categorias_financeiras (org_id, nome, tipo, grupo, ativa)
select o.id, 'Pagamento da equipe', 'saida', 'pessoal', true
  from orgs o
 where not exists (
   select 1 from categorias_financeiras c
    where c.org_id = o.id and lower(c.nome) like '%equipe%' and c.tipo = 'saida'
 );

-- ============================================================================
-- CONFERÊNCIA
-- ============================================================================

-- 1) As onze existem? (tem que voltar 11 linhas, com existe = true)
select t.nome, (to_regclass('public.' || t.nome) is not null) as existe
  from (values ('categorias_financeiras'),('lancamentos'),('entradas_banco'),
               ('conta_equipe'),('servicos_extras'),('pedidos_extras'),
               ('dias_sem_campo'),('telefones_ignorados'),('assinaturas_push'),
               ('pedidos_ajuda'),('historico_cliente')) t(nome)
 order by existe, t.nome;

-- 2) Todas com RLS ligada e policy de org?
select c.relname as tabela, c.relrowsecurity as rls_ligada,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policies
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('categorias_financeiras','lancamentos','entradas_banco','conta_equipe',
                     'servicos_extras','pedidos_extras','dias_sem_campo','telefones_ignorados',
                     'assinaturas_push','pedidos_ajuda','historico_cliente')
 order by c.relname;

-- 3) Os índices únicos que o código EXIGE (upserts). Tem que voltar 4 linhas.
select indexname from pg_indexes
 where schemaname = 'public'
   and indexname in ('uq_extras_org_nome','uq_dias_sem_campo',
                     'uq_tel_ignorados','uq_assinaturas_endpoint')
 order by indexname;

-- 4) A categoria do acerto da equipe existe? (uma linha por org)
select org_id, nome, tipo, grupo, ativa from categorias_financeiras
 where lower(nome) like '%equipe%' and tipo = 'saida';
