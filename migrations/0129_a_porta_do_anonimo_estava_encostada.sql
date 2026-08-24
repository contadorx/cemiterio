-- ============================================================================
-- 0129 — A PORTA DO ANONIMO ESTAVA ENCOSTADA
-- ============================================================================
--
-- ACHADO EM 24/08/2026, E PROVADO, NAO SUPOSTO.
--
-- Dez funcoes `security definer` estavam com EXECUTE concedido ao papel `anon`.
-- A chave anonima do Supabase e PUBLICA por desenho — vai no pacote que o
-- navegador baixa. Qualquer pessoa com ela chamava essas funcoes.
--
-- A prova: dentro de um bloco desfeito, com `set local role anon`, a
-- `sureya_saude_whatsapp` DEVOLVEU os numeros de producao. Nao foi teste de
-- mesa.
--
-- POR QUE AS TABELAS ESTAO BEM E AS FUNCOES NAO
--
-- O anonimo tem SELECT em quase toda tabela — e isso NAO e problema: a RLS esta
-- ligada em todas, com politica `org_id = current_org_id()`, e para o anonimo
-- `current_org_id()` e nulo. Nenhuma linha volta.
--
-- Funcao `security definer` NAO passa pela RLS. Ela roda com os poderes de quem
-- a criou. E a licao que a 0079 deixou escrita neste repositorio:
--
--     "SECURITY DEFINER ignora RLS — so o GRANT EXECUTE protege."
--
-- Nessas dez, o unico cadeado tinha sido aberto por omissao. O Supabase concede
-- EXECUTE a anon/authenticated/service_role por padrao em `public`; migration
-- que nao revoga, publica.
--
-- O AGRAVANTE: A GUARDA TEM UMA SAIDA PARA QUEM NAO TEM SESSAO
--
-- Varias delas guardam assim:
--
--     if auth.uid() is not null and not is_admin() then
--       raise exception 'somente_admin';
--     end if;
--
-- Isso quer dizer "sem sessao, pode" — e existe por um motivo legitimo: o cron
-- e o psql chamam sem `auth.uid()` (a licao da 0103). A guarda esta certa PARA
-- QUEM PODE CHAMAR. O erro nunca foi a guarda: foi deixar o anonimo entrar na
-- lista de quem pode chamar. Com o EXECUTE revogado, a saida volta a servir so
-- ao cron.
--
-- A PIOR DELAS
--
-- `sureya_registrar_pagamento` ESCREVE DINHEIRO e recebe `p_org` por
-- parametro — nao dependia nem de sessao para saber a org. Um pagamento falso
-- ali zera a divida de uma familia. NAO exercitei essa em producao de
-- proposito: a ACL e identica a da funcao que eu provei, e escrever para
-- confirmar seria causar o dano que estou consertando.
--
-- O QUE CONTINUA ABERTO AO ANONIMO, DE PROPOSITO
--
--   sureya_portal_*      o portal da familia e anonimo por token — e o desenho
--   sureya_primeiro_nome, sureya_data_no_ano, sureya_lavagens_no_mes,
--   sureya_meses_da_cobranca, sureya_proxima_data_extra
--                        contas puras, sem tocar em dado de ninguem
--   as de gatilho        o PostgREST nao expoe funcao que devolve `trigger`
--
-- IDEMPOTENTE: `revoke` de quem ja nao tem nao falha.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ESCREVEM (as tres primeiras mexem em dinheiro)
-- ---------------------------------------------------------------------------
revoke execute on function
  sureya_registrar_pagamento(uuid, numeric, numeric, numeric, numeric, numeric,
                             date, text, uuid, uuid, uuid)
  from anon, public;

revoke execute on function
  sureya_importar_extrato(jsonb, text, text, boolean, uuid) from anon, public;

revoke execute on function
  sureya_classificar_saidas(uuid[], text, uuid) from anon, public;

-- APAGA eventos de webhook. Destrutiva, e sem guarda de admin.
revoke execute on function
  sureya_limpar_eventos_webhook(integer, uuid) from anon, public;

-- ---------------------------------------------------------------------------
-- 2. LEEM DADO DE FAMILIA — vazamento, nao adulteracao
-- ---------------------------------------------------------------------------
-- devolve cliente_id e NOME das familias candidatas a uma entrada do banco
revoke execute on function
  sureya_palpites_entrada(uuid, uuid) from anon, public;

-- devolve o rastro de mensagens de UM telefone: quem sabe o numero de uma
-- familia lia o historico dela com a empresa
revoke execute on function
  sureya_rastro_telefone(text, integer, uuid) from anon, public;

-- numeros de operacao da casa
revoke execute on function sureya_saude_whatsapp(uuid) from anon, public;

-- se a familia recebe foto — preferencia dela, nao informacao publica
revoke execute on function sureya_envia_fotos(uuid) from anon, public;

-- os textos que a casa manda, com nome e jazigo interpolados
revoke execute on function
  sureya_texto_modelo(uuid, sureya_tipo_mensagem, text, text, text) from anon, public;

revoke execute on function
  sureya_textos_do_tipo(uuid, sureya_tipo_mensagem, text, text) from anon, public;

-- ---------------------------------------------------------------------------
-- 3. E QUEM DEVE PODER, CONTINUA PODENDO
-- ---------------------------------------------------------------------------
-- Todas as dez sao chamadas SO por rota de servidor atras de `exigirAdmin()`
-- ou pelo cliente de service_role do cron. Conferido uma por uma no codigo
-- antes de revogar: nenhum caminho anonimo passa por elas.
grant execute on function
  sureya_registrar_pagamento(uuid, numeric, numeric, numeric, numeric, numeric,
                             date, text, uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function
  sureya_importar_extrato(jsonb, text, text, boolean, uuid) to authenticated, service_role;
grant execute on function
  sureya_classificar_saidas(uuid[], text, uuid) to authenticated, service_role;
grant execute on function
  sureya_limpar_eventos_webhook(integer, uuid) to authenticated, service_role;
grant execute on function
  sureya_palpites_entrada(uuid, uuid) to authenticated, service_role;
grant execute on function
  sureya_rastro_telefone(text, integer, uuid) to authenticated, service_role;
grant execute on function sureya_saude_whatsapp(uuid) to authenticated, service_role;
grant execute on function sureya_envia_fotos(uuid) to authenticated, service_role;
grant execute on function
  sureya_texto_modelo(uuid, sureya_tipo_mensagem, text, text, text) to authenticated, service_role;
grant execute on function
  sureya_textos_do_tipo(uuid, sureya_tipo_mensagem, text, text) to authenticated, service_role;
