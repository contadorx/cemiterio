-- ============================================================================
-- SUREYA — 0053 · EXTRAIR A BASELINE REAL DO BANCO
--
-- ESTE ARQUIVO NÃO ALTERA NADA. É só SELECT. Pode rodar em produção.
--
-- POR QUE ELE EXISTE
-- ---------------------------------------------------------------------------
-- A AUDITORIA_GOLIVE registra como P0: "as migrations não comprovam o banco de
-- produção". São 46 arquivos SQL, com lacunas na numeração (faltam 0004, 0005,
-- 0018–0021, 0048), sem ferramenta de migration e sem histórico de execução.
-- A árvore do repositório não prova o que rodou, em que ordem, nem se o banco
-- atual coincide com o código.
--
-- A migration 0052 é a prova de que isso não é teórico: uma coluna que o código
-- lê e escreve todo dia (`tumulos.proximo_servico`) não existe em nenhuma
-- migration, e ninguém percebeu porque o erro era descartado.
--
-- E a 0046 já tinha registrado o outro lado do mesmo buraco: 24 funções
-- `sureya_*` que o código chama diariamente — inclusive as que movimentam
-- dinheiro (`sureya_pagamento_avulso`, `sureya_entrada_identificada`,
-- `sureya_pagar_equipe`, `sureya_estornar_servico`) — nasceram no SQL Editor e
-- nunca voltaram para o repositório.
--
-- COMO USAR
-- ---------------------------------------------------------------------------
--   1. Abra o SQL Editor do Supabase (projeto de PRODUÇÃO).
--   2. Rode UMA seção por vez (o editor mostra um resultado por vez).
--   3. Exporte cada resultado em CSV e guarde em `baseline/AAAA-MM-DD/`.
--   4. Commite a pasta. A partir daí, toda mudança de schema vira diff contra
--      esta baseline — que é o critério de saída do Build 0.
--
-- A seção 9 gera o CREATE FUNCTION completo das funções que só existem no
-- banco: é o texto que precisa virar migration versionada.
-- ============================================================================


-- ============================================================================
-- 1 · TABELAS E COLUNAS
-- O retrato mais importante. Compare com o que o código espera ler.
-- ============================================================================
select c.table_name,
       c.ordinal_position                       as pos,
       c.column_name,
       c.data_type,
       c.udt_name                               as tipo_interno,
       c.is_nullable,
       c.column_default,
       c.character_maximum_length               as tamanho,
       c.numeric_precision, c.numeric_scale
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
 where c.table_schema = 'public'
   and t.table_type = 'BASE TABLE'
 order by c.table_name, c.ordinal_position;


-- ============================================================================
-- 2 · O REPOSITÓRIO CONSEGUE RECONSTRUIR ESTE BANCO?
--
-- A consulta mais importante do arquivo. Ela cruza o que o CÓDIGO lê e escreve
-- com o que existe de fato, e revela as duas metades do mesmo buraco:
--
--   coluna FALTA NO BANCO   → a aplicação quebra (ou emudece) em produção;
--   coluna SÓ EXISTE NO BANCO → foi criada à mão no SQL Editor e nunca voltou
--                               para o repositório; restaurar um backup a
--                               partir das migrations NÃO reconstrói o sistema.
--
-- DUAS DIVERGÊNCIAS JÁ CONFIRMADAS POR LEITURA ESTÁTICA DO REPOSITÓRIO:
--
--  (a) `tumulos.proximo_servico` — lida e escrita por src/lib/agenda.ts
--      (linhas 207 e 296) e criada por NENHUMA das 46 migrations.
--      Corrigida pela migration 0052.
--
--  (b) `familias.contratado`, `.valor_mensal`, `.valor_base`,
--      `.freq_pagamento`, `.inicio_cobranca`, `.modo_cobranca` — o contrato e
--      a regra de cobrança da família inteira. A migration 0049 cria `familias`
--      com apenas SEIS colunas (id, org_id, nome, observacoes, created_at,
--      updated_at). As outras seis não aparecem em migration nenhuma, mas o
--      código depende delas para fechar o mês:
--          src/lib/competencia.ts:37        select ... contratado, modo_cobranca
--          src/app/api/familias/[id]:56-72  patch de todas as seis
--          src/app/api/financeiro/fechar-mes:41   if (!f.contratado) throw
--          src/app/api/mes/route.ts:97      semPlano: !f.contratado
--
--      NÃO se deve escrever essa migration por dedução: tipo, default,
--      constraint e valores em uso só existem no banco. Rode esta seção,
--      exporte o resultado e gere a migration a partir do que voltar.
-- ============================================================================
with esperado(tabela, coluna, onde_no_codigo) as (
  values
    -- contrato do jazigo (migration 0049 + correção 0052)
    ('tumulos',  'proximo_servico', 'lib/agenda.ts:207,296'),
    ('tumulos',  'contratado',      'lib/agenda.ts:209'),
    ('tumulos',  'periodicidade',   'lib/agenda.ts:210'),
    ('tumulos',  'freq_pagamento',  'lib/conta-corrente.ts'),
    ('tumulos',  'valor_lavagem',   'lib/valor-limpeza.ts:49'),
    ('tumulos',  'familia_id',      'lib/agenda.ts:207'),
    -- contrato da família: nenhuma destas seis está em migration
    ('familias', 'contratado',      'lib/competencia.ts:39'),
    ('familias', 'valor_mensal',    'lib/competencia.ts:37'),
    ('familias', 'valor_base',      'api/familias/[id]:63'),
    ('familias', 'freq_pagamento',  'lib/competencia.ts:37'),
    ('familias', 'inicio_cobranca', 'lib/competencia.ts:37'),
    ('familias', 'modo_cobranca',   'lib/competencia.ts:41'),
    -- comunicação e régua
    ('clientes', 'envio_automatico', 'lib/proativo.ts:111'),
    ('clientes', 'ativacao_ativa',   'lib/ativacao.ts:127'),
    ('clientes', 'regua_cobranca',   'lib/proativo.ts:109'),
    ('clientes', 'anonimizado_em',   'lib/proativo.ts:112')
)
select e.tabela, e.coluna, e.onde_no_codigo,
       case when c.column_name is null
            then 'FALTA NO BANCO — PostgREST devolve 400 nesta consulta'
            else 'ok' end as situacao,
       c.data_type, c.column_default, c.is_nullable
  from esperado e
  left join information_schema.columns c
         on c.table_schema = 'public'
        and c.table_name  = e.tabela
        and c.column_name = e.coluna
 order by (c.column_name is not null), e.tabela, e.coluna;


-- ----------------------------------------------------------------------------
-- 2b · O CAMINHO INVERSO: o que o banco tem e o repositório não conhece
--
-- Rode a seção 1, salve o CSV e compare com as migrations. Toda coluna que
-- aparecer só no CSV nasceu no SQL Editor. É ela que precisa virar migration
-- versionada antes de o Build 0 fechar — inclusive as seis de `familias`.
-- ----------------------------------------------------------------------------
select 'familias' as tabela, column_name, data_type, column_default, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'familias'
   and column_name not in ('id','org_id','nome','observacoes','created_at','updated_at')
 order by ordinal_position;


-- ============================================================================
-- 3 · CONSTRAINTS (PK, FK, UNIQUE, CHECK)
-- As UNIQUE importam para idempotência: são elas que barram a segunda inserção
-- do mesmo efeito (ver Build 2).
-- ============================================================================
select con.conrelid::regclass::text        as tabela,
       con.conname                         as constraint_nome,
       case con.contype when 'p' then 'PRIMARY KEY'
                        when 'f' then 'FOREIGN KEY'
                        when 'u' then 'UNIQUE'
                        when 'c' then 'CHECK'
                        when 'x' then 'EXCLUDE'
                        else con.contype::text end as tipo,
       pg_get_constraintdef(con.oid)       as definicao
  from pg_constraint con
  join pg_class     rel on rel.oid = con.conrelid
  join pg_namespace ns  on ns.oid  = rel.relnamespace
 where ns.nspname = 'public'
 order by tabela, tipo, constraint_nome;


-- ============================================================================
-- 4 · ÍNDICES
-- ============================================================================
select schemaname, tablename, indexname, indexdef
  from pg_indexes
 where schemaname = 'public'
 order by tablename, indexname;


-- ============================================================================
-- 5 · RLS: QUAIS TABELAS ESTÃO PROTEGIDAS
--
-- `rls_ativo = false` numa tabela com dado de família é achado de segurança,
-- não detalhe de configuração. Este é o insumo do Build 1.
-- ============================================================================
select c.relname                              as tabela,
       c.relrowsecurity                       as rls_ativo,
       c.relforcerowsecurity                  as rls_forcado,
       count(p.polname)                       as qtd_policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policy p on p.polrelid = c.oid
 where n.nspname = 'public'
   and c.relkind = 'r'
 group by c.relname, c.relrowsecurity, c.relforcerowsecurity
 order by c.relrowsecurity, qtd_policies, c.relname;


-- ============================================================================
-- 6 · POLICIES, UMA A UMA
--
-- Procure aqui o achado central da auditoria: policies que só comparam
-- `org_id = current_org_id()` e NÃO distinguem o papel `campo` do `admin`.
-- Toda linha em que `qual` não mencione papel/executora é candidata a P0.
-- ============================================================================
select pol.polrelid::regclass::text          as tabela,
       pol.polname                           as policy,
       case pol.polcmd when 'r' then 'SELECT'
                       when 'a' then 'INSERT'
                       when 'w' then 'UPDATE'
                       when 'd' then 'DELETE'
                       when '*' then 'ALL' end as operacao,
       pol.polpermissive                     as permissiva,
       coalesce(
         (select string_agg(r.rolname, ', ' order by r.rolname)
            from pg_roles r where r.oid = any(pol.polroles)),
         'PUBLIC')                           as papeis,
       pg_get_expr(pol.polqual,      pol.polrelid) as condicao_leitura,
       pg_get_expr(pol.polwithcheck, pol.polrelid) as condicao_escrita
  from pg_policy pol
  join pg_class     c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
 order by tabela, operacao, policy;


-- ============================================================================
-- 7 · GRANTS DE TABELA
--
-- RLS só age depois do GRANT. Uma tabela sem RLS mas com grant para
-- `authenticated` está aberta a qualquer sessão logada — inclusive a de campo,
-- que tem a chave anônima e o token no navegador.
-- ============================================================================
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privilegios
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee in ('anon', 'authenticated', 'service_role', 'public', 'PUBLIC')
 group by table_name, grantee
 order by case grantee when 'anon' then 1 when 'public' then 2
                       when 'PUBLIC' then 2 when 'authenticated' then 3
                       else 4 end,
          table_name;


-- ============================================================================
-- 8 · FUNÇÕES: INVENTÁRIO
--
-- `security definer` roda com os privilégios de quem criou, ignorando RLS.
-- Cada uma precisa de `search_path` fixo e validação interna própria; sem isso,
-- é um caminho para contornar toda a autorização do Build 1.
-- ============================================================================
select p.proname                              as funcao,
       pg_get_function_identity_arguments(p.oid) as argumentos,
       case when p.prosecdef then 'SECURITY DEFINER' else 'invoker' end as seguranca,
       coalesce(array_to_string(p.proconfig, ', '), '(sem search_path fixo)')  as config,
       pg_get_userbyid(p.proowner)            as dono,
       coalesce(
         (select string_agg(r.rolname, ', ' order by r.rolname)
            from pg_roles r
           where has_function_privilege(r.rolname, p.oid, 'EXECUTE')
             and r.rolname in ('anon','authenticated','service_role')),
         '(nenhum)')                          as quem_pode_executar
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
 order by p.prosecdef desc, p.proname;


-- ============================================================================
-- 9 · O CÓDIGO-FONTE DAS FUNÇÕES QUE SÓ EXISTEM NO BANCO
--
-- Copie a coluna `create_function` inteira e salve como migration versionada.
-- Enquanto essas funções viverem só no banco, restaurar um backup em ambiente
-- limpo NÃO reconstrói o sistema — e o Build 0 não fecha.
-- ============================================================================
select p.proname as funcao,
       pg_get_functiondef(p.oid) as create_function
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname like 'sureya%'
 order by p.proname;


-- ============================================================================
-- 10 · TRIGGERS
-- ============================================================================
select c.relname                as tabela,
       t.tgname                 as trigger,
       pg_get_triggerdef(t.oid) as definicao
  from pg_trigger t
  join pg_class     c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and not t.tgisinternal
 order by c.relname, t.tgname;


-- ============================================================================
-- 11 · TIPOS ENUM
-- O `checar-enums.js` compara os valores usados no código com esta lista.
-- ============================================================================
select t.typname as tipo,
       string_agg(e.enumlabel, ' | ' order by e.enumsortorder) as valores
  from pg_type t
  join pg_enum e     on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
 where n.nspname = 'public'
 group by t.typname
 order by t.typname;


-- ============================================================================
-- 12 · STORAGE: BUCKETS
--
-- A auditoria aponta como P1: o helper da aplicação cria buckets PÚBLICOS sob
-- demanda. `public = true` em bucket de foto de túmulo ou de comprovante é
-- decisão de privacidade, não detalhe técnico — e precisa virar aceite formal
-- ou virar bucket privado com URL assinada (Build 6).
-- ============================================================================
select id, name, public as publico, file_size_limit, allowed_mime_types, created_at
  from storage.buckets
 order by public desc, name;


-- ============================================================================
-- 13 · STORAGE: POLICIES
-- ============================================================================
select pol.polname as policy,
       case pol.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
                       when 'w' then 'UPDATE' when 'd' then 'DELETE'
                       when '*' then 'ALL' end as operacao,
       coalesce(
         (select string_agg(r.rolname, ', ' order by r.rolname)
            from pg_roles r where r.oid = any(pol.polroles)),
         'PUBLIC') as papeis,
       pg_get_expr(pol.polqual,      pol.polrelid) as condicao_leitura,
       pg_get_expr(pol.polwithcheck, pol.polrelid) as condicao_escrita
  from pg_policy pol
  join pg_class     c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'storage'
   and c.relname = 'objects'
 order by operacao, policy;


-- ============================================================================
-- 14 · HISTÓRICO DE MIGRATIONS
--
-- Se vier "nenhum controle de migration", está confirmado que a ordem de
-- execução dos 46 arquivos não existe em lugar nenhum — e a baseline extraída
-- por este arquivo passa a ser a única verdade sobre o schema.
-- ============================================================================
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise notice 'Nenhum controle de migration encontrado (supabase_migrations.schema_migrations não existe).';
    raise notice 'A ordem em que os 46 arquivos rodaram NÃO está registrada no banco.';
  else
    raise notice 'Tabela de migrations encontrada — rode a consulta abaixo.';
  end if;
end $$;

-- select version, name, statements from supabase_migrations.schema_migrations order by version;


-- ============================================================================
-- 15 · EXTENSÕES
-- `pgcrypto` importa: a 0014 corrigiu justamente um uso de gen_random_bytes.
-- ============================================================================
select extname as extensao, extversion as versao, n.nspname as schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
 order by extname;


-- ============================================================================
-- 16 · VOLUME POR TABELA
-- Serve para dimensionar backup, restauração e o tamanho do piloto.
-- ============================================================================
select relname as tabela,
       n_live_tup as linhas_aprox,
       pg_size_pretty(pg_total_relation_size(relid)) as tamanho
  from pg_stat_user_tables
 where schemaname = 'public'
 order by n_live_tup desc;
