-- ============================================================================
-- SUREYA — 0064 · OS 4 GATILHOS QUE FALTAVAM
--
-- O PLACAR
-- ---------------------------------------------------------------------------
-- Rodando a trilha do repositório num PostgreSQL vazio e comparando com o
-- placar extraído de produção (consulta 5 do `_diagnostico/0063`):
--
--                    repositório    produção
--     tabelas             55           55     ✅
--     funções sureya_*    56           56     ✅
--     gatilhos            10           14     ← faltam 4
--     policies            55           62     ← faltam 7
--
-- Os quatro gatilhos que faltam são exatamente os das funções que a migration
-- 0062 recuperou: a extração devolveu as FUNÇÕES, e gatilho é outro objeto.
-- Sem eles o banco reconstruído tem a função e não tem o disparo — e o efeito
-- é silencioso, que é o pior tipo.
--
-- COMO A ASSINATURA DE CADA UM FOI DEDUZIDA
-- ---------------------------------------------------------------------------
-- Não por preferência: pelo que o corpo da função exige para funcionar.
--
--   · função que ATRIBUI a `new.` e devolve `new` só tem efeito em BEFORE
--     (em AFTER a linha já foi gravada e a atribuição é descartada);
--   · função que faz UPDATE em outra tabela é AFTER (em BEFORE ela agiria
--     antes de a própria linha existir);
--   · função que lê `old.` é UPDATE; função que nunca lê `old.` é INSERT.
--
-- Cada um vem com o raciocínio ao lado. Onde a dedução for ambígua, está dito.
--
-- ⚠️ CONFIRA CONTRA O BANCO REAL. A consulta 3 do `_diagnostico/0063` devolve
-- o `pg_get_triggerdef()` verdadeiro de cada gatilho. Se divergir, o banco
-- vence. Em produção estes `create trigger` são idempotentes: o `drop trigger
-- if exists` imediatamente antes garante que rodar aqui não duplique nada,
-- mas ele TAMBÉM apaga o gatilho de produção se o nome bater e a definição
-- for diferente — por isso: rode a consulta 3 ANTES.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) mensagens → sureya_atualiza_estado_conversa
--
-- O corpo lê `new.direcao`, `new.conversa_id`, `new.autor` e `new.created_at`,
-- e faz `update conversas set ...`. Nunca menciona `old.`.
--   · mexe em OUTRA tabela          → AFTER
--   · não lê `old.`                  → INSERT
--
-- É o que mantém a coluna `estado` que `sureya_contadores_conversas` conta na
-- aba "Precisam de você". Sem este gatilho, toda conversa fica com `estado`
-- nulo e a aba zera — sem erro nenhum.
-- ----------------------------------------------------------------------------
drop trigger if exists trg_mensagens_estado_conversa on mensagens;
create trigger trg_mensagens_estado_conversa
  after insert on mensagens
  for each row
  execute function public.sureya_atualiza_estado_conversa();


-- ----------------------------------------------------------------------------
-- 2) clientes → sureya_familia_para_cliente
--
-- O corpo faz `new.familia_id := v_familia` e `new.responsavel_financeiro :=
-- true`, e devolve `new`.
--   · ATRIBUI a `new.`               → BEFORE (em AFTER seria descartado)
--   · não lê `old.`, e a primeira linha do corpo é
--     `if new.familia_id is not null then return new; end if;`
--                                     → INSERT
--
-- É ele que cria a família junto com o cadastro da pessoa. Sem ele, toda
-- família nova nasce com `familia_id` nulo — e o financeiro por família, que
-- lê `familias.contratado`, não enxerga ninguém.
-- ----------------------------------------------------------------------------
drop trigger if exists trg_clientes_familia on clientes;
create trigger trg_clientes_familia
  before insert on clientes
  for each row
  execute function public.sureya_familia_para_cliente();


-- ----------------------------------------------------------------------------
-- 3) servicos → sureya_reagenda_apos_execucao
--
-- A primeira linha do corpo é:
--     if new.status <> 'executado' or coalesce(old.status::text,'') = 'executado'
--       then return new; end if;
--
--   · lê `old.status`                → UPDATE
--   · faz `update planos` e `update servicos` em outras linhas → AFTER
--
-- A comparação com `old.status` é justamente para agir uma vez só, na
-- transição para `executado`. Isso só faz sentido em UPDATE.
-- ----------------------------------------------------------------------------
drop trigger if exists trg_servicos_reagenda on servicos;
create trigger trg_servicos_reagenda
  after update on servicos
  for each row
  execute function public.sureya_reagenda_apos_execucao();


-- ----------------------------------------------------------------------------
-- 4) planos → sureya_sincroniza_lavagens
--
-- O corpo compara `new.lavagens_por_ciclo is distinct from old.lavagens_por_ciclo`
-- e atribui a `new.qtd_por_passagem` (ou o contrário), devolvendo `new`.
--   · lê `old.`                      → UPDATE
--   · ATRIBUI a `new.`               → BEFORE
--
-- Mantém as duas colunas gêmeas em sincronia: mexer numa arrasta a outra.
-- Diferente das três acima, esta função NÃO é `security definer` na extração —
-- e não precisa ser: ela só mexe na linha que já está sendo gravada.
-- ----------------------------------------------------------------------------
drop trigger if exists trg_planos_sincroniza_lavagens on planos;
create trigger trg_planos_sincroniza_lavagens
  before update on planos
  for each row
  execute function public.sureya_sincroniza_lavagens();

commit;


-- ============================================================================
-- CONFERÊNCIA
--
-- (a) O placar fecha?  Depois desta migration, `npm run migrar-limpo` tem de
--     imprimir 14 gatilhos — o mesmo número de produção.
--
--     select count(*) from pg_trigger t
--       join pg_class c on c.oid = t.tgrelid
--       join pg_namespace n on n.oid = c.relnamespace
--      where n.nspname='public' and not t.tgisinternal;
--
-- (b) Os NOMES batem com os de produção?  Os quatro nomes acima foram
--     escolhidos por mim seguindo o padrão `trg_<tabela>_<assunto>` que as
--     migrations 0001–0051 já usam. Se em produção tiverem outro nome, o
--     `drop trigger if exists` daqui NÃO os alcança e o banco fica com os dois.
--     Confira e, se preciso, ajuste os nomes:
--
--     select c.relname, t.tgname, pg_get_triggerdef(t.oid)
--       from pg_trigger t join pg_class c on c.oid=t.tgrelid
--       join pg_namespace n on n.oid=c.relnamespace
--      where n.nspname='public' and not t.tgisinternal
--      order by 1,2;
--
-- (c) Prova de comportamento, em HOMOLOGAÇÃO:
--
--     · cadastre uma pessoa nova       → `clientes.familia_id` preenchido e
--                                        uma linha nova em `familias`
--     · insira uma mensagem de entrada → `conversas.estado = 'sem_resposta'`
--     · marque um serviço como executado → `planos.proximo_servico` andou
--                                          (e, pelo gatilho da 0058,
--                                           `tumulos.proximo_servico` também)
--     · mude `planos.lavagens_por_ciclo` → `qtd_por_passagem` acompanhou
--
-- (d) O QUE AINDA FALTA PARA O PLACAR FECHAR: 7 policies.
--     O repositório cria 55 (uma por tabela, do laço da 0001) e produção tem
--     62. As sete extras foram criadas à mão e não estão em migration nenhuma.
--     A CONSULTA A do `_diagnostico/0054` devolve todas com `using` e
--     `with check` — é ela que fecha este último número, e é a mesma que
--     destrava as policies por papel do Build 1b.
-- ============================================================================
