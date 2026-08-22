-- ============================================================================
-- SUREYA — 0046 · EXTRAIR O QUE SÓ EXISTE NO SEU BANCO
--
-- ESTE ARQUIVO NÃO ALTERA NADA. É só SELECT. Ele COPIA de volta para o
-- repositório a parte do sistema que nasceu no SQL Editor e nunca voltou.
--
-- POR QUE ISTO EM VEZ DE EU ESCREVER AS FUNÇÕES
-- ---------------------------------------------------------------------------
-- Faltam 24 funções (`sureya_*`) que o código chama todo dia — inclusive as que
-- movimentam dinheiro: `sureya_pagamento_avulso`, `sureya_entrada_identificada`,
-- `sureya_pagar_equipe`, `sureya_estornar_servico`, `sureya_fluxo_caixa`…
--
-- Eu NUNCA vi o corpo dessas funções. Se eu as reescrevesse "do jeito que
-- provavelmente são" e você rodasse um `create or replace`, o resultado seria
-- SUBSTITUIR funções que hoje funcionam por palpites meus — em cima de dinheiro
-- de família. Um palpite bem escrito é pior que um buraco declarado: parece
-- certo.
--
-- Então o caminho é o inverso: o seu banco dita, e o repositório copia.
--
-- COMO USAR (leva uns 5 minutos)
--   1. Rode o BLOCO 1 no SQL Editor.
--   2. Copie a coluna `definicao` do resultado INTEIRA.
--   3. Cole num arquivo novo chamado
--      `migrations/0047_funcoes_extraidas_do_banco.sql`
--      (coloque no topo um comentário dizendo a data da extração).
--   4. Pronto: o repositório passa a reproduzir o produto.
--
--   Depois disso, um ambiente novo sobe rodando as migrations em ordem — e a
--   restauração deixa de depender de o Supabase de produção estar vivo.
-- ============================================================================


-- ============================================================================
-- BLOCO 1 — AS FUNÇÕES, PRONTAS PARA COLAR
--
-- `pg_get_functiondef` devolve o `CREATE OR REPLACE FUNCTION` completo, com
-- corpo, tipos e atributos (security definer, search_path). É o texto real.
-- ============================================================================
select string_agg(
         pg_get_functiondef(p.oid) || E';\n\n' ||
         -- as permissões também importam: a 0016 revogou o acesso público
         'revoke all on function ' || p.oid::regprocedure || E' from public, anon;\n' ||
         'grant execute on function ' || p.oid::regprocedure || E' to authenticated;\n',
         E'\n-- ----------------------------------------------------------------\n'
         order by p.proname
       ) as definicao
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname like 'sureya\_%';


-- ============================================================================
-- BLOCO 2 — CONFERÊNCIA: o que o código chama e o banco não tem
--
-- Tem que voltar VAZIO. Qualquer linha aqui é um botão que devolve erro ao
-- clicar — e que ninguém descobre até alguém clicar.
-- ============================================================================
select f.nome as funcao_que_o_codigo_chama
  from (values
    ('sureya_a_conferir_no_banco'),('sureya_anonimizar_cliente'),('sureya_apagar_gps'),
    ('sureya_aplicar_reajuste'),('sureya_conciliar_comprovante'),('sureya_conferir_no_banco'),
    ('sureya_contadores_conversas'),('sureya_conversa_equipe'),('sureya_debitos_em_aberto'),
    ('sureya_desidentificar_entrada'),('sureya_emitir_avaliacao'),('sureya_emitir_token_portal'),
    ('sureya_entrada_identificada'),('sureya_entregar_extra'),('sureya_estornar_servico'),
    ('sureya_excluir_servico'),('sureya_fechar_dia'),('sureya_fluxo_caixa'),
    ('sureya_gerar_codigo_indicacao'),('sureya_identificar_entrada'),('sureya_marcar_conversa'),
    ('sureya_pagamento_avulso'),('sureya_pagar_equipe'),('sureya_palpites_entrada'),
    ('sureya_portal_cabecalho'),('sureya_portal_historico'),('sureya_portal_irmaos'),
    ('sureya_pular_servico'),('sureya_puxar_servicos'),('sureya_reembolso_material'),
    ('sureya_registrar_acao_ia'),('sureya_registrar_consentimento'),
    ('sureya_registrar_entrada_banco'),('sureya_registrar_gps'),('sureya_registrar_indicacao'),
    ('sureya_registrar_pagamento_manual'),('sureya_registrar_uso_ia'),('sureya_remarcar_servico'),
    ('sureya_reorganizar_agenda'),('sureya_responder_avaliacao'),('sureya_resultado_por_jazigo'),
    ('sureya_revogar_token_portal'),('sureya_saldo_abertura'),('sureya_saldo_equipe')
  ) f(nome)
 where not exists (
   select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = f.nome
 )
 order by 1;


-- ============================================================================
-- BLOCO 3 — CONFERÊNCIA AO CONTRÁRIO: função no banco que o código NÃO chama
--
-- Não é erro — pode ser função auxiliar chamada de dentro de outra. Mas se
-- aparecer algo aqui que você não reconhece, vale olhar: função esquecida com
-- `security definer` é superfície de ataque parada.
-- ============================================================================
select p.proname as no_banco_mas_o_codigo_nao_chama,
       p.prosecdef as security_definer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname like 'sureya\_%'
   and p.proname not in (
     'sureya_a_conferir_no_banco','sureya_anonimizar_cliente','sureya_apagar_gps',
     'sureya_aplicar_reajuste','sureya_conciliar_comprovante','sureya_conferir_no_banco',
     'sureya_contadores_conversas','sureya_conversa_equipe','sureya_debitos_em_aberto',
     'sureya_desidentificar_entrada','sureya_emitir_avaliacao','sureya_emitir_token_portal',
     'sureya_entrada_identificada','sureya_entregar_extra','sureya_estornar_servico',
     'sureya_excluir_servico','sureya_fechar_dia','sureya_fluxo_caixa',
     'sureya_gerar_codigo_indicacao','sureya_identificar_entrada','sureya_marcar_conversa',
     'sureya_pagamento_avulso','sureya_pagar_equipe','sureya_palpites_entrada',
     'sureya_portal_cabecalho','sureya_portal_historico','sureya_portal_irmaos',
     'sureya_pular_servico','sureya_puxar_servicos','sureya_reembolso_material',
     'sureya_registrar_acao_ia','sureya_registrar_consentimento',
     'sureya_registrar_entrada_banco','sureya_registrar_gps','sureya_registrar_indicacao',
     'sureya_registrar_pagamento_manual','sureya_registrar_uso_ia','sureya_remarcar_servico',
     'sureya_reorganizar_agenda','sureya_responder_avaliacao','sureya_resultado_por_jazigo',
     'sureya_revogar_token_portal','sureya_saldo_abertura','sureya_saldo_equipe',
     'sureya_herdar_cemiterio'
   )
 order by 1;


-- ============================================================================
-- BLOCO 4 — O SCHEMA REAL DAS TABELAS QUE A 0045 DEDUZIU
--
-- A 0045 escreveu essas tabelas a partir do USO no código, não do seu banco.
-- Rode isto e compare: onde divergir, quem está certo é o seu banco — corrija
-- a 0045 (ela é `if not exists`, então nunca vai consertar sozinha uma coluna
-- que já existe com outro tipo).
--
-- O que olhar: coluna que existe no banco e não está na 0045 (o código não usa,
-- mas alguma RPC pode usar), e tipo diferente do que eu deduzi.
-- ============================================================================
select table_name, ordinal_position as pos, column_name, data_type,
       is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('categorias_financeiras','lancamentos','entradas_banco','conta_equipe',
                      'servicos_extras','pedidos_extras','dias_sem_campo','telefones_ignorados',
                      'assinaturas_push','pedidos_ajuda','historico_cliente','acertos_equipe',
                      'rotinas')
 order by table_name, ordinal_position;


-- ============================================================================
-- BLOCO 5 — AS CHAVES E ÍNDICES REAIS DESSAS TABELAS
--
-- Especialmente as FKs: é a FK que faz o PostgREST aceitar os embeds
-- (`categorias_financeiras(nome,grupo)` dentro de `lancamentos`). Se uma FK que
-- a 0045 declara não existir no seu banco, a tela correspondente já estaria
-- quebrada — então provavelmente existe, e vale copiar o nome real.
-- ============================================================================
select tc.table_name, tc.constraint_type, tc.constraint_name,
       kcu.column_name,
       ccu.table_name  as referencia_tabela,
       ccu.column_name as referencia_coluna
  from information_schema.table_constraints tc
  left join information_schema.key_column_usage kcu
         on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
  left join information_schema.constraint_column_usage ccu
         on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
 where tc.table_schema = 'public'
   and tc.table_name in ('categorias_financeiras','lancamentos','entradas_banco','conta_equipe',
                         'servicos_extras','pedidos_extras','dias_sem_campo','telefones_ignorados',
                         'assinaturas_push','pedidos_ajuda','historico_cliente')
 order by tc.table_name, tc.constraint_type, tc.constraint_name;

select tablename, indexname, indexdef
  from pg_indexes
 where schemaname = 'public'
   and tablename in ('categorias_financeiras','lancamentos','entradas_banco','conta_equipe',
                     'servicos_extras','pedidos_extras','dias_sem_campo','telefones_ignorados',
                     'assinaturas_push','pedidos_ajuda','historico_cliente')
 order by tablename, indexname;


-- ============================================================================
-- BLOCO 6 — TESTE DE FOGO (para quando você quiser ter certeza)
--
-- A prova de que o repositório reproduz o produto é criar um projeto Supabase
-- vazio, rodar as migrations 0001 → 0047 na ordem, e o app subir.
--
-- Não precisa ser agora, e não precisa ter dado nenhum: se todas as migrations
-- passarem sem erro e o painel abrir na tela de login, o objetivo foi atingido.
-- Enquanto isso não for testado uma vez, "temos backup" é uma suposição.
-- ============================================================================
