-- ============================================================================
-- SUREYA — 0055 · BUILD 1a · PAPEL NO BANCO E DESLIGAMENTO QUE DESLIGA
--
-- ESTA MIGRATION NÃO REMOVE NENHUMA POLICY. Ela só acrescenta funções e
-- corrige uma. É deliberadamente conservadora: as policies por operação
-- (Build 1b) precisam ser escritas contra o estado REAL das policies atuais,
-- que ainda não foi extraído. Trocar policy no escuro derruba a operação.
--
-- O QUE ELA RESOLVE AGORA
-- ---------------------------------------------------------------------------
-- 1) O banco não sabe dizer se quem está consultando é `admin` ou `campo`.
--    A RLS de hoje (migration 0001, linhas 274-292) cria UMA policy por tabela:
--
--        create policy <t>_org on <t>
--          using (org_id = current_org_id())
--          with check (org_id = current_org_id());
--
--    Uma policy só, permissiva, para TODAS as operações, sem uma palavra sobre
--    papel. Quem é da org faz tudo que a tabela permite. A separação existe
--    apenas em `exigirAdmin()` no TypeScript — e o navegador da pessoa de campo
--    tem a URL, a chave anônima e o token de sessão para chamar o PostgREST
--    direto, sem passar por rota nenhuma.
--
--    Sem `current_member_role()` no banco, a policy do Build 1b não teria como
--    ser escrita. Esta migration cria essa fundação.
--
-- 2) Desativar uma pessoa não desativava nada.
--    `membros.ativo` existe desde a 0011, mas NINGUÉM o consulta na autenticação:
--      · `current_org_id()` (0001, linha 47) devolve a org sem olhar `ativo`;
--      · `src/lib/roles.ts:autenticar()` seleciona só `papel,nome`.
--    Resultado: a linha vira `ativo = false`, a pessoa continua entrando, e
--    toda policy `org_id = current_org_id()` continua liberando.
--
--    Corrigido aqui no banco e, no mesmo commit, em `src/lib/roles.ts`.
--
-- ATENÇÃO — MUDANÇA DE COMPORTAMENTO REAL
-- ---------------------------------------------------------------------------
-- Depois desta migration, QUEM ESTIVER COM `ativo = false` PERDE O ACESSO NA
-- HORA, em todas as tabelas de uma vez (porque toda policy existente chama
-- `current_org_id()`). Isso é o objetivo. Mas confira antes quem são:
--
--     select user_id, nome, papel, ativo from membros order by ativo, nome;
--
-- Se alguém que trabalha estiver marcado como inativo por engano, corrija a
-- linha ANTES de rodar. Depois de rodar, essa pessoa fica de fora.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) A org corrente passa a exigir membro ATIVO
--
-- Mesma assinatura e mesmo nome: todas as policies existentes continuam
-- funcionando, e todas ganham a checagem de desligamento de graça.
-- ----------------------------------------------------------------------------
create or replace function current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id
    from membros
   where user_id = auth.uid()
     and ativo
   limit 1;
$$;

comment on function current_org_id() is
  'Org do usuário autenticado. Exige membro ATIVO desde a migration 0055: '
  'desligar alguém em `membros.ativo` revoga o acesso em todas as policies '
  'que chamam esta função.';


-- ----------------------------------------------------------------------------
-- 2) O papel, legível pelo banco
--
-- Devolve `admin`, `campo` ou NULL (não é membro, ou está inativo).
-- É a peça que faltava para escrever policy por operação no Build 1b.
-- ----------------------------------------------------------------------------
create or replace function current_member_role()
returns sureya_papel_membro
language sql
stable
security definer
set search_path = public
as $$
  select papel
    from membros
   where user_id = auth.uid()
     and ativo
   limit 1;
$$;

comment on function current_member_role() is
  'Papel do usuário autenticado (admin | campo), ou NULL se não for membro '
  'ativo. Base das policies por operação do Build 1b.';


-- ----------------------------------------------------------------------------
-- 3) Atalhos booleanos
--
-- Existem para a policy ficar legível. Uma policy que se lê em voz alta é uma
-- policy que alguém consegue revisar:
--
--     using (org_id = current_org_id() and is_admin())
--
-- `coalesce(..., false)` é essencial: sem ele, um NULL em policy não é
-- "false", e o comportamento de um `using` nulo é negar sem explicar.
-- ----------------------------------------------------------------------------
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
           (select papel = 'admin'
              from membros
             where user_id = auth.uid() and ativo
             limit 1),
           false);
$$;

create or replace function is_campo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
           (select papel = 'campo'
              from membros
             where user_id = auth.uid() and ativo
             limit 1),
           false);
$$;

comment on function is_admin() is 'true somente para membro ATIVO com papel admin.';
comment on function is_campo() is 'true somente para membro ATIVO com papel campo.';


-- ----------------------------------------------------------------------------
-- 4) Permissões de execução
--
-- `public` inclui todo papel presente e futuro; é sempre amplo demais.
-- `anon` continua podendo executar de propósito: sem sessão, `auth.uid()` é
-- nulo, a consulta não acha linha e a função devolve NULL/false. Se `anon` NÃO
-- pudesse executar, a policy estouraria erro de permissão em vez de negar
-- silenciosamente — e erro de permissão em policy vaza a existência do objeto.
-- ----------------------------------------------------------------------------
revoke execute on function current_org_id()      from public;
revoke execute on function current_member_role() from public;
revoke execute on function is_admin()            from public;
revoke execute on function is_campo()            from public;

grant execute on function current_org_id()      to anon, authenticated, service_role;
grant execute on function current_member_role() to anon, authenticated, service_role;
grant execute on function is_admin()            to anon, authenticated, service_role;
grant execute on function is_campo()            to anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 5) Índice
--
-- As quatro funções são chamadas uma vez por linha avaliada em policy. Com
-- `membros` pequena o plano seria seq scan mesmo, mas o índice parcial deixa a
-- intenção explícita e evita surpresa quando a equipe crescer.
-- ----------------------------------------------------------------------------
create index if not exists idx_membros_user_ativo
  on membros (user_id)
  where ativo;

commit;


-- ============================================================================
-- CONFERÊNCIA DEPOIS DE RODAR
--
-- (a) As quatro funções existem e são SECURITY DEFINER com search_path fixo?
--     select proname, prosecdef, proconfig
--       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname='public'
--        and proname in ('current_org_id','current_member_role','is_admin','is_campo');
--
-- (b) Logada como ADMIN, no SQL Editor com a sessão do usuário (ou via
--     PostgREST com o token dele):
--     select current_org_id(), current_member_role(), is_admin(), is_campo();
--     → espera-se: <uuid>, 'admin', true, false
--
-- (c) Logada como CAMPO:
--     → espera-se: <uuid>, 'campo', false, true
--
-- (d) O TESTE QUE IMPORTA — desligar de verdade desliga?
--     Pegue uma conta de teste, marque `ativo = false` e, com a sessão ANTIGA
--     dela ainda válida, tente ler qualquer tabela pelo PostgREST.
--     → espera-se: nenhuma linha (current_org_id() virou NULL).
--     Depois devolva `ativo = true`.
--
--     ATENÇÃO: isto revoga o acesso a DADOS, não o token do Auth. A sessão
--     continua tecnicamente válida até expirar. Revogar a sessão no Auth
--     (banir/remover o usuário) continua sendo entrega do Build 1b.
--
-- (e) A aplicação continua de pé? Entre como admin e abra painel, agenda,
--     famílias e financeiro. Nada deve mudar — nenhuma policy foi trocada.
-- ============================================================================
