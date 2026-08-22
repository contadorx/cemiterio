-- ============================================================================
-- SUREYA — 0054 · A BASELINE EM 3 CONSULTAS (em vez de 16)
--
-- NÃO ALTERA NADA. Só SELECT. Pode rodar em produção.
--
-- POR QUE ESTE ARQUIVO EXISTE
-- ---------------------------------------------------------------------------
-- A 0053 tem 16 seções e o SQL Editor do Supabase mostra um resultado por vez.
-- Na prática isso são 16 execuções e 16 exportações — e o que veio de volta foi
-- só a seção 16 (o volume por tabela).
--
-- Aqui cada consulta devolve UMA linha com UM JSON. Rode, clique no valor,
-- copie inteiro e mande. Três colagens resolvem o Build 1.
--
-- ORDEM: A → B → C. A consulta A é a que destrava as policies.
-- ============================================================================


-- ############################################################################
-- CONSULTA A — SEGURANÇA
--
-- É esta que decide o Build 1. Ela responde: quais tabelas têm RLS, o que cada
-- policy realmente exige, quem recebeu GRANT, e quais funções rodam como
-- SECURITY DEFINER (ignorando RLS por completo).
--
-- Rode e copie o JSON inteiro.
-- ############################################################################
select jsonb_pretty(jsonb_build_object(

  'rls_por_tabela', (
    select jsonb_agg(x order by x->>'tabela')
      from (
        select jsonb_build_object(
                 'tabela',       c.relname,
                 'rls_ativo',    c.relrowsecurity,
                 'rls_forcado',  c.relforcerowsecurity,
                 'qtd_policies', count(p.polname)
               ) as x
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          left join pg_policy p on p.polrelid = c.oid
         where n.nspname = 'public' and c.relkind = 'r'
         group by c.relname, c.relrowsecurity, c.relforcerowsecurity
      ) s
  ),

  'policies', (
    select jsonb_agg(x order by x->>'tabela', x->>'policy')
      from (
        select jsonb_build_object(
                 'tabela',    pol.polrelid::regclass::text,
                 'policy',    pol.polname,
                 'operacao',  case pol.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
                                              when 'w' then 'UPDATE' when 'd' then 'DELETE'
                                              when '*' then 'ALL' end,
                 'permissiva', pol.polpermissive,
                 'papeis',    coalesce((select string_agg(r.rolname, ',' order by r.rolname)
                                          from pg_roles r where r.oid = any(pol.polroles)), 'PUBLIC'),
                 'using',     pg_get_expr(pol.polqual,      pol.polrelid),
                 'withcheck', pg_get_expr(pol.polwithcheck, pol.polrelid)
               ) as x
          from pg_policy pol
          join pg_class c     on c.oid = pol.polrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
      ) s
  ),

  -- RLS só age DEPOIS do grant. Tabela sem RLS e com grant para
  -- `authenticated` está aberta a qualquer sessão logada — inclusive a de
  -- campo, que carrega a chave anônima e o token no navegador.
  'grants', (
    select jsonb_agg(x order by x->>'grantee', x->>'tabela')
      from (
        select jsonb_build_object(
                 'tabela',  table_name,
                 'grantee', grantee,
                 'privs',   string_agg(privilege_type, ',' order by privilege_type)
               ) as x
          from information_schema.role_table_grants
         where table_schema = 'public'
           and grantee in ('anon','authenticated','service_role','PUBLIC')
         group by table_name, grantee
      ) s
  ),

  -- SECURITY DEFINER roda com os privilégios do dono e ignora RLS.
  -- Sem `search_path` fixo, é também um caminho de escalonamento.
  'funcoes', (
    select jsonb_agg(x order by x->>'funcao')
      from (
        select jsonb_build_object(
                 'funcao',     p.proname,
                 'args',       pg_get_function_identity_arguments(p.oid),
                 'definer',    p.prosecdef,
                 'search_path', coalesce(array_to_string(p.proconfig, ','), null),
                 'execute',    coalesce((select string_agg(r.rolname, ',' order by r.rolname)
                                           from pg_roles r
                                          where has_function_privilege(r.rolname, p.oid, 'EXECUTE')
                                            and r.rolname in ('anon','authenticated','service_role')), '')
               ) as x
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
      ) s
  ),

  'buckets', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'nome', name, 'publico', public, 'limite', file_size_limit)), '[]'::jsonb)
      from storage.buckets
  ),

  'policies_storage', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'policy',   pol.polname,
             'operacao', case pol.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
                                         when 'w' then 'UPDATE' when 'd' then 'DELETE'
                                         when '*' then 'ALL' end,
             'using',    pg_get_expr(pol.polqual, pol.polrelid))), '[]'::jsonb)
      from pg_policy pol
      join pg_class c     on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'storage' and c.relname = 'objects'
  )

)) as baseline_seguranca;


-- ############################################################################
-- CONSULTA B — SCHEMA: as colunas que o código usa
--
-- Confirma (ou derruba) as divergências já encontradas por leitura estática:
--   · tumulos.proximo_servico   — corrigida pela migration 0052
--   · as seis colunas de contrato de familias — ainda sem migration
--   · quitacoes — a tabela existe no banco e não tem `create table` em lugar
--     nenhum do repositório (só é citada no LEIA-ME_entrada_identificada.md)
-- ############################################################################
select jsonb_pretty(jsonb_build_object(

  'colunas_criticas', (
    select jsonb_agg(x order by x->>'tabela', x->>'coluna')
      from (
        select jsonb_build_object(
                 'tabela', e.tabela,
                 'coluna', e.coluna,
                 'onde',   e.onde,
                 'existe', (c.column_name is not null),
                 'tipo',   c.data_type,
                 'default', c.column_default,
                 'nulavel', c.is_nullable
               ) as x
          from (values
                  ('tumulos','proximo_servico','lib/agenda.ts:207,296'),
                  ('tumulos','contratado','lib/agenda.ts:209'),
                  ('tumulos','periodicidade','lib/agenda.ts:210'),
                  ('tumulos','freq_pagamento','lib/conta-corrente.ts'),
                  ('tumulos','valor_lavagem','lib/valor-limpeza.ts:49'),
                  ('tumulos','familia_id','lib/agenda.ts:207'),
                  ('familias','contratado','lib/competencia.ts:39'),
                  ('familias','valor_mensal','lib/competencia.ts:37'),
                  ('familias','valor_base','api/familias/[id]:63'),
                  ('familias','freq_pagamento','lib/competencia.ts:37'),
                  ('familias','inicio_cobranca','lib/competencia.ts:37'),
                  ('familias','modo_cobranca','lib/competencia.ts:41'),
                  ('membros','ativo','lib/agenda.ts:505'),
                  ('membros','papel','autenticacao'),
                  ('clientes','envio_automatico','lib/proativo.ts:111'),
                  ('clientes','ativacao_ativa','lib/ativacao.ts:127'),
                  ('clientes','anonimizado_em','lib/proativo.ts:112')
               ) as e(tabela, coluna, onde)
          left join information_schema.columns c
                 on c.table_schema='public' and c.table_name=e.tabela and c.column_name=e.coluna
      ) s
  ),

  -- Tudo que familias tem além das 6 colunas que a migration 0049 cria.
  -- O que aparecer aqui nasceu no SQL Editor e precisa virar migration.
  'familias_colunas_fora_da_migration', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'coluna', column_name, 'tipo', data_type,
             'default', column_default, 'nulavel', is_nullable) order by ordinal_position), '[]'::jsonb)
      from information_schema.columns
     where table_schema='public' and table_name='familias'
       and column_name not in ('id','org_id','nome','observacoes','created_at','updated_at')
  ),

  -- A tabela de quitações: existe no banco, não existe em migration nenhuma.
  'quitacoes', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'coluna', column_name, 'tipo', data_type,
             'default', column_default, 'nulavel', is_nullable) order by ordinal_position), '[]'::jsonb)
      from information_schema.columns
     where table_schema='public' and table_name='quitacoes'
  ),

  -- Quantos jazigos o gerador de agenda vai enxergar depois da 0052.
  -- Se `contratados` vier 0, a agenda continua vazia mesmo com a coluna criada:
  -- o problema passa a ser a ficha, não o schema.
  'contratos_hoje', (
    select jsonb_build_object(
             'tumulos_total',        count(*),
             'contratados',          count(*) filter (where contratado),
             'com_periodicidade',    count(*) filter (where contratado and periodicidade is not null),
             'servicos_no_banco',    (select count(*) from servicos),
             'servicos_pendentes',   (select count(*) from servicos where status = 'pendente')
           )
      from tumulos
  ),

  'enums', (
    select jsonb_object_agg(t.typname, v)
      from (
        select t.typname, jsonb_agg(e.enumlabel order by e.enumsortorder) as v
          from pg_type t
          join pg_enum e      on e.enumtypid = t.oid
          join pg_namespace n on n.oid = t.typnamespace
         where n.nspname='public'
         group by t.typname
      ) t(typname, v)
  )

)) as baseline_schema;


-- ############################################################################
-- CONSULTA C — O CÓDIGO-FONTE DAS FUNÇÕES QUE SÓ EXISTEM NO BANCO
--
-- Separada das outras porque é volumosa. É ela que precisa virar migration
-- versionada: enquanto essas funções viverem só no banco, restaurar um backup
-- em ambiente limpo NÃO reconstrói o sistema — e o Build 0 não fecha.
--
-- Se o resultado ficar grande demais para colar, mande primeiro só os nomes
-- (a chave `funcoes` da CONSULTA A já traz) e depois as de dinheiro:
-- sureya_pagamento_avulso, sureya_entrada_identificada, sureya_pagar_equipe,
-- sureya_estornar_servico, sureya_fluxo_caixa.
-- ############################################################################
select p.proname                  as funcao,
       p.prosecdef                as security_definer,
       pg_get_functiondef(p.oid)  as create_function
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname like 'sureya%'
 order by p.prosecdef desc, p.proname;
