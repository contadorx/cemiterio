-- ============================================================================
-- SUREYA — 0079 · A POLICY RESTRITIVA ESQUECIA O DELETE
--
-- ACHADO AO RODAR A CONTRAPROVA DE AUTORIZAÇÃO CONTRA PRODUÇÃO — que é o
-- critério de saída do Build 1, e que nunca tinha sido rodado onde vale.
--
-- O QUE ACONTECEU
-- ---------------------------------------------------------------------------
-- Assumindo a sessão de uma pessoa de campo REAL, com o papel `authenticated`,
-- as três primeiras verificações passaram:
--
--     ok  o papel e lido como campo
--     ok  is_admin() nega o campo
--     ok  o campo NAO vira admin
--     ok  o campo nao le conta_corrente
--
-- e a quarta reprovou:
--
--     FALHOU: campo apagou cliente
--
-- (A verificação rodava dentro de um bloco que levanta exceção, então a
--  transação desfez: nenhuma linha foi perdida. Conferido depois — 298
--  clientes, 2 admins, 2 de campo, intactos.)
--
-- POR QUE
-- ---------------------------------------------------------------------------
-- A 0067 escreveu as restritivas nesta forma:
--
--     create policy clientes_campo_nao_escreve on clientes
--       as restrictive for all
--       using (true)
--       with check (not is_campo());
--
-- Em PostgreSQL, numa policy:
--
--     USING       vale para SELECT, UPDATE e **DELETE**
--     WITH CHECK  vale para INSERT e UPDATE
--
-- **DELETE não olha `WITH CHECK`.** A guarda inteira estava no lugar que o
-- DELETE não consulta, e `using (true)` liberava o resto.
--
-- O `using (true)` estava lá por um bom motivo — o campo PRECISA ler clientes e
-- túmulos para a rota do dia aparecer. Pôr a guarda no `USING` da policy `for
-- all` teria cegado o aplicativo de campo. A saída não era mexer nessa policy:
-- é acrescentar uma **segunda restritiva, só para DELETE**.
--
-- QUANTAS ESTAVAM ASSIM
-- ---------------------------------------------------------------------------
-- Cinco, de 43 restritivas. As outras 38 já filtram no `USING`.
--
--   clientes    o campo apagava família
--   tumulos     o campo apagava jazigo
--   membros     **o campo apagava um admin** — e com isso tirava o acesso de quem
--               poderia desfazer
--   orgs        **o campo apagava a organização** — e as chaves em cascata
--               levariam clientes, jazigos, serviços e o financeiro junto
--   movimentos  o congelamento da 0074 barrava insert e update, não delete
--
-- `movimentos` não estava exposto de fato: a 0074 também revogou o privilégio
-- de tabela (`revoke insert, update, delete`), e privilégio é conferido antes
-- da policy. Foi a segunda camada que segurou — exatamente o motivo de ela
-- existir. As outras quatro não tinham segunda camada.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Uma restritiva por tabela, só para DELETE.
--
-- Ela SOMA com a que já existe (restritivas entram com E), então o SELECT do
-- campo continua funcionando: a nova só é consultada quando a operação é
-- DELETE.
-- ----------------------------------------------------------------------------
drop policy if exists clientes_campo_nao_apaga on clientes;
create policy clientes_campo_nao_apaga on clientes
  as restrictive for delete using (not is_campo());

drop policy if exists tumulos_campo_nao_apaga on tumulos;
create policy tumulos_campo_nao_apaga on tumulos
  as restrictive for delete using (not is_campo());

-- Apagar membro é mexer em quem tem acesso. Só admin — e a mesma regra que a
-- 0067 pôs no `with check` para impedir a escalada de privilégio.
drop policy if exists membros_so_admin_apaga on membros;
create policy membros_so_admin_apaga on membros
  as restrictive for delete using (is_admin());

drop policy if exists orgs_so_admin_apaga on orgs;
create policy orgs_so_admin_apaga on orgs
  as restrictive for delete using (is_admin());

-- Congelado é congelado, e não depende só do privilégio de tabela para isso.
drop policy if exists movimentos_nao_apaga on movimentos;
create policy movimentos_nao_apaga on movimentos
  as restrictive for delete using (false);

comment on policy clientes_campo_nao_apaga on clientes is
  'A 0067 pos a guarda em WITH CHECK, que o DELETE nao consulta. Esta policy '
  'fecha o DELETE sem cegar o SELECT, que o aplicativo de campo precisa.';

commit;


-- ============================================================================
-- CONFERÊNCIA
--
--   -- as cinco novas existem
--   select polname from pg_policy pol join pg_class c on c.oid=pol.polrelid
--    where pol.polcmd = 'd' and not pol.polpermissive order by 1;
--
--   -- e nenhuma restritiva de DELETE ficou com `using (true)`
--   select c.relname, pol.polname from pg_policy pol
--     join pg_class c on c.oid=pol.polrelid
--     join pg_namespace n on n.oid=c.relnamespace
--    where n.nspname='public' and not pol.polpermissive
--      and pol.polcmd in ('*','d')
--      and pg_get_expr(pol.polqual, pol.polrelid) = 'true'
--      and not exists (
--        select 1 from pg_policy p2 where p2.polrelid = pol.polrelid
--          and p2.polcmd = 'd' and not p2.polpermissive);
--   -- esperado: zero linhas
--
-- ROLLBACK
--   `drop policy` nas cinco. Mas o rollback reabre o DELETE para o campo em
--   clientes, tumulos, membros e orgs — não faça sem substituir por outra coisa.
-- ============================================================================
