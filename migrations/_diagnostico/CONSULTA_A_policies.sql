-- ============================================================================
-- CONSULTA A — AS POLICIES, OS GRANTS E QUEM PODE EXECUTAR O QUÊ
--
-- NÃO ALTERA NADA. Só SELECT. Pode rodar em produção.
--
-- É a última peça do Build 1. Sem ela não dá para escrever policy por papel:
-- `drop policy` no escuro derruba a operação — se a policy real tiver outro
-- nome ou outra condição, o `drop` erra o alvo e o `create` deixa a tabela
-- mais aberta do que estava.
--
-- Também fecha o placar do `npm run migrar-limpo`: produção tem 62 policies e
-- o repositório cria 55. As sete que faltam estão no resultado de A1.
--
-- COMO RODAR
-- ---------------------------------------------------------------------------
-- São três consultas independentes. Rode uma, exporte o resultado como JSON
-- (o mesmo caminho que você usou nas anteriores) e mande. Depois a próxima.
--
-- Se for mandar só uma, mande a **A1** — é a que destrava as policies.
-- ============================================================================


-- ############################################################################
-- A1 · AS POLICIES, UMA A UMA          ← a mais importante
--
-- O que procurar no resultado: `qual` (a condição de leitura) que só compara
-- `org_id = current_org_id()`. Toda linha assim é uma tabela onde a conta de
-- campo tem o mesmo acesso que a administração — é o P0 nº 1 da auditoria,
-- com nome e sobrenome.
--
-- `cmd = ALL` e `permissiva = true` juntos significam: uma policy só, valendo
-- para select, insert, update e delete ao mesmo tempo.
-- ############################################################################
select
  pol.polrelid::regclass::text                       as tabela,
  pol.polname                                        as policy,
  case pol.polcmd
    when 'r' then 'SELECT' when 'a' then 'INSERT'
    when 'w' then 'UPDATE' when 'd' then 'DELETE'
    when '*' then 'ALL'    else pol.polcmd::text end  as cmd,
  pol.polpermissive                                  as permissiva,
  coalesce((select string_agg(r.rolname, ',' order by r.rolname)
              from pg_roles r where r.oid = any(pol.polroles)), 'PUBLIC') as papeis,
  pg_get_expr(pol.polqual,      pol.polrelid)        as qual,
  pg_get_expr(pol.polwithcheck, pol.polrelid)        as withcheck
from pg_policy pol
join pg_class     c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
order by tabela, cmd, policy;


-- ############################################################################
-- A2 · RLS LIGADA? E QUEM TEM GRANT NA TABELA
--
-- Estas duas coisas juntas decidem o acesso, e é fácil olhar só uma.
--
-- RLS só age DEPOIS do grant. Uma tabela com `rls_ativo = false` e grant para
-- `authenticated` está aberta a QUALQUER sessão logada — inclusive a de campo,
-- que carrega a chave anônima e o token no navegador. Nesse caso a policy nem
-- é consultada.
--
-- Procure no resultado: linha com `rls_ativo = false` e `authenticated` ou
-- `anon` na coluna `grantee`.
-- ############################################################################
select
  c.relname                                          as tabela,
  c.relrowsecurity                                   as rls_ativo,
  c.relforcerowsecurity                              as rls_forcado,
  (select count(*) from pg_policy p where p.polrelid = c.oid) as qtd_policies,
  g.grantee,
  string_agg(g.privilege_type, ',' order by g.privilege_type) as privilegios
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join information_schema.role_table_grants g
       on g.table_schema = 'public'
      and g.table_name   = c.relname
      and g.grantee in ('anon','authenticated','service_role','PUBLIC')
where n.nspname = 'public'
  and c.relkind = 'r'
group by c.relname, c.relrowsecurity, c.relforcerowsecurity, c.oid, g.grantee
order by c.relrowsecurity, g.grantee nulls last, c.relname;


-- ############################################################################
-- A3 · AS FUNÇÕES: QUEM PODE EXECUTAR, E QUAIS IGNORAM A RLS
--
-- `definer = true` significa que a função roda com os privilégios do dono e
-- IGNORA a RLS. Nessas, o que protege é só o EXECUTE — e é exatamente o que a
-- migration 0057 corrige.
--
-- Este resultado é a PROVA de antes: mostra quais funções `anon` ainda pode
-- executar hoje. Rode de novo DEPOIS da 0057 e a coluna `pode_executar` tem de
-- perder o `anon` em tudo, menos nas cinco do portal/avaliação/indicação.
--
-- `search_path` vazio numa função `definer` é achado de segurança por si só.
-- ############################################################################
select
  p.proname                                           as funcao,
  pg_get_function_identity_arguments(p.oid)           as args,
  p.prosecdef                                         as definer,
  coalesce(array_to_string(p.proconfig, ','), '(sem search_path fixo)') as search_path,
  coalesce((select string_agg(r.rolname, ',' order by r.rolname)
              from pg_roles r
             where r.rolname in ('anon','authenticated','service_role')
               and has_function_privilege(r.rolname, p.oid, 'EXECUTE')), '(ninguem)') as pode_executar
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.prosecdef desc, p.proname;


-- ############################################################################
-- A4 · STORAGE — opcional, mas é o P1 de privacidade da auditoria
--
-- `publico = true` em bucket de foto de túmulo ou de comprovante é decisão de
-- privacidade, não detalhe técnico: a URL não expira e o caminho tem os IDs.
-- ############################################################################
select id, name, public as publico, file_size_limit, allowed_mime_types
  from storage.buckets
 order by public desc, name;
