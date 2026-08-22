-- ============================================================================
-- SUREYA — 0067 · BUILD 1b · A FRONTEIRA ENTRE CAMPO E ADMINISTRAÇÃO
--
-- Rodar DEPOIS da 0055 (que cria `is_admin()` e `is_campo()`).
--
-- GRAVIDADE: P0. Uma das correções abaixo fecha uma ESCALADA DE PRIVILÉGIO.
--
-- ---------------------------------------------------------------------------
-- O QUE A EXTRAÇÃO DAS POLICIES MOSTROU
-- ---------------------------------------------------------------------------
-- São 62 policies em 55 tabelas. **Todas** são `FOR ALL`, permissivas, para o
-- papel `PUBLIC`, e a condição é sempre a mesma:
--
--     org_id = current_org_id()
--
-- E os grants são idênticos em toda tabela, para `anon` E `authenticated`:
--
--     DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
-- Ou seja: a única coisa entre uma conta de campo e o banco inteiro da
-- organização é `current_org_id()` devolver a org dela — o que sempre devolve.
-- **A conta de campo tem INSERT, UPDATE e DELETE nas 55 tabelas**, incluindo
-- `movimentos`, `conta_corrente`, `comprovantes` e `membros`.
--
-- ---------------------------------------------------------------------------
-- A ESCALADA DE PRIVILÉGIO
-- ---------------------------------------------------------------------------
-- A policy de `membros` é `membros_self`, `FOR ALL`, com
-- `using (org_id = current_org_id())` e o mesmo no `with check`. E
-- `authenticated` tem UPDATE na tabela. Conferido no banco.
--
-- Então isto funciona hoje, direto no PostgREST, com a chave anônima e o token
-- que estão no navegador de quem lava:
--
--     update membros set papel = 'admin' where user_id = auth.uid();
--
-- A linha é da própria pessoa (passa no `using`), a org não muda (passa no
-- `with check`). **A conta de campo se promove a administradora.**
--
-- Isso derrota tudo o mais: as guardas `is_admin()` da migration 0060, estas
-- policies aqui, e qualquer controle futuro — basta virar admin antes.
-- É a correção mais urgente deste arquivo.
--
-- ---------------------------------------------------------------------------
-- POR QUE POLICY *RESTRICTIVE*, E NÃO TROCAR AS 62
-- ---------------------------------------------------------------------------
-- A extração revelou também que **7 tabelas têm policies DUPLICADAS**, com
-- nomes diferentes e a mesma regra:
--
--     assinaturas_push        assinaturas_push_org + push_org
--     categorias_financeiras  cat_fin_org          + categorias_financeiras_org
--     entradas_banco          entradas_banco_org   + entradas_org
--     historico_cliente       hist_cliente_org     + historico_cliente_org
--     lancamentos             lanc_org             + lancamentos_org
--     servicos_extras         extras_org           + servicos_extras_org
--     telefones_ignorados     tel_ign_org          + telefones_ignorados_org
--
-- São exatamente as 7 policies que faltavam no placar (62 no banco, 55 no
-- repositório). Não são regras novas: são a mesma regra criada duas vezes, por
-- migrations diferentes, com nomes diferentes.
--
-- E é justamente o cenário que torna `drop policy` perigoso: policies
-- permissivas se somam com OU. Apagar `lanc_org` e recriar apertado deixa
-- `lancamentos_org` valendo — a tabela continua aberta, e o commit parece ter
-- apertado. Uma correção que não corrige e não avisa.
--
-- Policy **RESTRICTIVE** resolve isso pela natureza: ela entra com E, não com
-- OU. Vale sobre TODAS as permissivas ao mesmo tempo, existentes e futuras,
-- duplicadas ou não. Nenhuma das 62 é tocada, então não há risco de derrubar a
-- operação por errar um nome.
--
--     acesso = (qualquer permissiva) E (todas as restrictive)
--
-- ---------------------------------------------------------------------------
-- O QUE FOI CONFERIDO ANTES DE APERTAR
-- ---------------------------------------------------------------------------
-- Rota por rota, quais tabelas o app de campo toca COM A SESSÃO da pessoa
-- (`auth.db`) — porque essas passam por RLS e quebrariam:
--
--     servicos, dias_campo, materiais, clientes, tumulos,
--     conversas, mensagens, ocorrencias
--
-- Nenhuma delas entra na lista de bloqueio total abaixo. As rotas que usam
-- `supabaseAdmin()` não passam por RLS e não são afetadas.
-- ============================================================================

begin;

-- ############################################################################
-- 1) A ESCALADA — `membros` só o admin escreve
--
-- SELECT continua liberado: a pessoa de campo precisa enxergar a equipe para o
-- briefing, e `roles.ts:autenticar()` lê a própria linha a cada requisição.
-- O que fecha é a ESCRITA.
-- ############################################################################
drop policy if exists membros_so_admin_escreve on membros;
create policy membros_so_admin_escreve on membros
  as restrictive
  for all
  using (true)                                   -- leitura livre
  with check (is_admin());                       -- escrita só de admin

comment on policy membros_so_admin_escreve on membros is
  'Fecha a escalada de privilegio: sem isto, `update membros set papel=''admin'' '
  'where user_id = auth.uid()` promovia a propria conta de campo a administradora.';


-- `orgs` guarda jornada, capacidade, chave Pix e custo. Mesma regra.
drop policy if exists orgs_so_admin_escreve on orgs;
create policy orgs_so_admin_escreve on orgs
  as restrictive
  for all
  using (true)
  with check (is_admin());


-- ############################################################################
-- 2) O FINANCEIRO — campo não lê nem escreve
--
-- Nenhuma destas é tocada pelo app de campo com a sessão da pessoa (conferido
-- rota por rota). O que o campo precisa do financeiro é zero: ele executa
-- lavagem, não movimenta dinheiro.
-- ############################################################################
do $$
declare t text;
begin
  foreach t in array array[
    'movimentos', 'conta_corrente', 'quitacoes', 'comprovantes',
    'entradas_banco', 'lancamentos', 'categorias_financeiras',
    'conta_equipe', 'acertos_equipe', 'reajustes', 'remuneracao_regras',
    'compras_material', 'planos'
  ]
  loop
    execute format('drop policy if exists %I on %I;', t || '_sem_campo', t);
    execute format($p$
      create policy %1$I on %2$I
        as restrictive
        for all
        using (not is_campo())
        with check (not is_campo());
    $p$, t || '_sem_campo', t);
  end loop;
end $$;


-- ############################################################################
-- 3) ADMINISTRAÇÃO, COMUNICAÇÃO E DIAGNÓSTICO — campo não lê nem escreve
--
-- `conversas`, `mensagens` e `ocorrencias` ficam DE FORA de propósito: o app de
-- campo usa as três com a sessão da pessoa (conversa com o apoio, ocorrência
-- de "não deu"). Elas precisam de policy por linha, não de bloqueio — fica
-- para o lote 2, com a contraprova rodada antes e depois.
-- ############################################################################
do $$
declare t text;
begin
  foreach t in array array[
    'config_ia', 'modelos_ia', 'chamadas_ia', 'uso_ia', 'interacoes_ia',
    'campanhas', 'leads', 'pedidos_conversa', 'avaliacoes', 'indicacoes',
    'datas_comemorativas', 'telefones_cliente', 'telefones_ignorados',
    'eventos_webhook', 'fila_envios', 'fila_liberacao', 'historico_cliente',
    'auditoria', 'gatilhos_disparados', 'ativacoes_disparadas', 'rotinas',
    'familias'
  ]
  loop
    execute format('drop policy if exists %I on %I;', t || '_sem_campo', t);
    execute format($p$
      create policy %1$I on %2$I
        as restrictive
        for all
        using (not is_campo())
        with check (not is_campo());
    $p$, t || '_sem_campo', t);
  end loop;
end $$;


-- ############################################################################
-- 4) `servicos` — campo só mexe no que é dele
--
-- É o P0 nº 3 da auditoria, agora também na camada de dados. A função
-- `sureya_concluir_lavagem` (0066) já valida isso, mas ela é SECURITY DEFINER:
-- protege quem passa por ela. Esta policy protege quem NÃO passa — o
-- `update` direto no PostgREST.
--
-- SELECT fica livre: a pessoa precisa enxergar a rota do dia, que inclui
-- serviços ainda sem dono. O que se fecha é a ESCRITA.
--
-- `executora_id is null` é permitido de propósito: é assim que ela pega um
-- serviço ainda não atribuído. O `with check` garante que, ao pegar, ele fique
-- com o nome dela — não com o de outra pessoa.
-- ############################################################################
drop policy if exists servicos_campo_so_o_seu on servicos;
create policy servicos_campo_so_o_seu on servicos
  as restrictive
  for update
  using      (not is_campo() or executora_id is null or executora_id = auth.uid())
  with check (not is_campo() or executora_id = auth.uid());

drop policy if exists servicos_campo_nao_apaga on servicos;
create policy servicos_campo_nao_apaga on servicos
  as restrictive
  for delete
  using (not is_campo());

-- Cadastro de família é da administração. O campo lê (precisa do nome no
-- cartão) e não escreve.
drop policy if exists clientes_campo_nao_escreve on clientes;
create policy clientes_campo_nao_escreve on clientes
  as restrictive
  for all
  using (true)
  with check (not is_campo());

-- Jazigo: idem. O campo cadastra jazigo novo pela rota `/api/tumulos`, que usa
-- service role e não passa por RLS.
drop policy if exists tumulos_campo_nao_escreve on tumulos;
create policy tumulos_campo_nao_escreve on tumulos
  as restrictive
  for all
  using (true)
  with check (not is_campo());


-- ############################################################################
-- 5) OS QUATRO QUE ESCAPAM DO `current_org_id()`
--
-- Quatro policies não usam a função — usam a subconsulta direta:
--
--     org_id IN (SELECT membros.org_id FROM membros WHERE membros.user_id = auth.uid())
--
--     conta_corrente   cc_por_org
--     familias         familias_por_org
--     fila_liberacao   fila_por_org
--     ruas             ruas_por_org
--
-- Consequência: a correção da migration 0055, que fez `current_org_id()` exigir
-- `ativo`, **não alcança estas quatro**. Uma pessoa desligada continuava lendo
-- a conta corrente, as famílias, a fila de mensagens e as ruas.
--
-- Passam a chamar a função, como todas as outras. Aqui o `drop` é seguro
-- porque o nome de cada uma veio da extração, não de suposição.
-- ############################################################################
drop policy if exists cc_por_org on conta_corrente;
create policy cc_por_org on conta_corrente
  using (org_id = current_org_id()) with check (org_id = current_org_id());

drop policy if exists familias_por_org on familias;
create policy familias_por_org on familias
  using (org_id = current_org_id()) with check (org_id = current_org_id());

drop policy if exists fila_por_org on fila_liberacao;
create policy fila_por_org on fila_liberacao
  using (org_id = current_org_id()) with check (org_id = current_org_id());

drop policy if exists ruas_por_org on ruas;
create policy ruas_por_org on ruas
  using (org_id = current_org_id()) with check (org_id = current_org_id());


-- ############################################################################
-- 6) OS GRANTS — tirar o que nunca deveria estar lá
--
-- Toda tabela concede sete privilégios a `anon` e a `authenticated`. Três
-- deles não fazem sentido nenhum pela API:
--
--   TRUNCATE   esvazia a tabela. **RLS NÃO SE APLICA A TRUNCATE** — nenhuma
--              policy protege contra ele. Hoje o PostgREST não expõe TRUNCATE,
--              então não é alcançável pela chave anônima; mas depender disso é
--              depender de um detalhe de implementação da camada HTTP para
--              proteger o banco.
--   REFERENCES cria chave estrangeira apontando para a tabela.
--   TRIGGER    cria gatilho na tabela — ou seja, roda código próprio a cada
--              escrita alheia.
--
-- E `anon` não precisa de escrita em tabela nenhuma: todo o acesso público
-- (portal por QR, avaliação, indicação) passa por função SECURITY DEFINER, já
-- travada na migration 0057. O SELECT dele fica — a RLS já o bloqueia, e tirar
-- privilégio de leitura muda mensagem de erro sem mudar o acesso.
-- ############################################################################
do $$
declare t record;
begin
  for t in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('revoke truncate, references, trigger on table public.%I from anon, authenticated;', t.relname);
    execute format('revoke insert, update, delete on table public.%I from anon;', t.relname);
  end loop;
end $$;

commit;


-- ============================================================================
-- CONFERÊNCIA — a matriz da auditoria, agora executável
--
-- npm run contraprova
--
-- O que TEM de mudar de FALHA para PASSA:
--   · campo não lê conta_corrente, movimentos, comprovantes, entradas_banco,
--     lancamentos
--   · campo não lê config_ia, campanhas, leads
--   · campo não altera cadastro de família
--
-- O que TEM de continuar PASSA (se virar FALHA, apertei demais):
--   · admin lê clientes, familias, tumulos, servicos, conta_corrente
--
-- E o teste que ainda não existe na contraprova — rode à mão, com a sessão de
-- CAMPO, direto no PostgREST:
--
--     update membros set papel = 'admin' where user_id = auth.uid();
--     → tem de falhar. Antes desta migration, funcionava.
--
--     update servicos set status = 'executado' where executora_id <> auth.uid();
--     → 0 linhas afetadas.
--
-- ROLLBACK
--   Toda policy criada aqui tem nome próprio e sufixo previsível. Para desfazer
--   tudo de uma vez:
--
--     do $$ declare p record; begin
--       for p in select polname, polrelid::regclass::text as t from pg_policy
--                 where polname like '%_sem_campo'
--                    or polname in ('membros_so_admin_escreve','orgs_so_admin_escreve',
--                                   'servicos_campo_so_o_seu','servicos_campo_nao_apaga',
--                                   'clientes_campo_nao_escreve','tumulos_campo_nao_escreve')
--       loop execute format('drop policy %I on %s;', p.polname, p.t); end loop;
--     end $$;
--
--   As 62 policies originais não foram tocadas: desfazendo as restritivas, o
--   banco volta exatamente ao estado de antes.
-- ============================================================================
