-- ============================================================================
-- SUREYA — 0063 · O BANCO ESCREVE A PRÓPRIA MIGRATION
--
-- NÃO ALTERA NADA. Só SELECT. Rode no Supabase de PRODUÇÃO.
--
-- POR QUE
-- ---------------------------------------------------------------------------
-- As migrations 0059 e 0061 recriam, no repositório, 32 colunas e 1 tabela que
-- hoje só existem dentro do banco. Os tipos delas foram RECONSTRUÍDOS a partir
-- de como o código as usa — é uma inferência informada, não a verdade.
--
-- Enquanto forem inferência, homologação pode divergir de produção num detalhe
-- que só aparece tarde: um `text` onde lá é enum, um default diferente, um
-- `not null` que falta.
--
-- Este arquivo elimina a dúvida da forma mais direta possível: **o banco gera o
-- próprio DDL**. Rode, copie a coluna `ddl` inteira, e substitua o conteúdo das
-- migrations 0059 e 0061 pelo que voltar. Aí a baseline deixa de ser palpite.
--
-- É o último item aberto do critério de saída do Build 0:
--   "schema real comparado à baseline sem diferença desconhecida".
-- ============================================================================


-- ############################################################################
-- CONSULTA 1 — O DDL EXATO DAS 32 COLUNAS
--
-- Devolve um `alter table ... add column if not exists ...` por coluna, com o
-- tipo, o default e a nulabilidade que estão gravados no banco.
-- ############################################################################
with alvo(tabela, coluna) as (values
  ('conversas','tipo'),('conversas','estado'),('conversas','resolvida'),
  ('conversas','arquivada_em'),('conversas','membro_id'),('conversas','fixada'),
  ('conversas','ultima_msg_em'),('conversas','ultima_msg_cliente_em'),
  ('conversas','aguardando_desde'),('conversas','ultimo_autor'),
  ('conversas','lida_em'),('conversas','lida_por'),
  ('conversas','respondida_em'),('conversas','respondida_por'),
  ('familias','contratado'),('familias','valor_mensal'),('familias','valor_base'),
  ('familias','freq_pagamento'),('familias','inicio_cobranca'),('familias','modo_cobranca'),
  ('leads','origem'),('leads','contexto'),('leads','jazigo_ref'),('leads','cliente_novo_id'),
  ('orgs','dias_semana'),('orgs','hora_inicio'),('orgs','hora_fim'),
  ('orgs','intervalo_almoco_min'),('orgs','custo_mensal_ajudante'),('orgs','minutos_padrao_limpeza'),
  ('planos','reajuste_adiado_ate'),('planos','reajuste_motivo_adiamento'),
  -- as cinco de movimentos, da migration 0059
  ('movimentos','conferido_em'),('movimentos','conferido_por'),('movimentos','nota_conferencia'),
  ('movimentos','sem_comprovante'),('movimentos','estorna_movimento')
)
select
  a.tabela,
  a.coluna,
  case when c.column_name is null then '-- NAO EXISTE NEM EM PRODUCAO: conferir se o codigo esta morto'
  else
    'alter table ' || a.tabela || ' add column if not exists ' || a.coluna || ' ' ||
    -- format_type devolve o tipo verdadeiro, inclusive enums e arrays
    format_type(att.atttypid, att.atttypmod) ||
    coalesce(' default ' || c.column_default, '') ||
    case when c.is_nullable = 'NO' then ' not null' else '' end || ';'
  end as ddl,
  c.data_type, c.udt_name, c.column_default, c.is_nullable
from alvo a
left join information_schema.columns c
       on c.table_schema = 'public' and c.table_name = a.tabela and c.column_name = a.coluna
left join pg_attribute att
       on att.attrelid = ('public.' || a.tabela)::regclass
      and att.attname  = a.coluna
      and att.attnum > 0
order by a.tabela, a.coluna;


-- ############################################################################
-- CONSULTA 2 — `quitacoes` INTEIRA, DO JEITO QUE ESTÁ
--
-- Compare com a migration 0059. O que importa mais: existe a restrição única
-- em (credito_id, debito_id)? Sem ela, o `on conflict do nothing` de
-- `sureya_entrada_identificada` não impede quitar o mesmo débito duas vezes.
-- ############################################################################
select 'alter table quitacoes add column if not exists ' || column_name || ' ' ||
       format_type(a.atttypid, a.atttypmod) ||
       coalesce(' default ' || column_default, '') ||
       case when is_nullable = 'NO' then ' not null' else '' end || ';' as ddl,
       ordinal_position
  from information_schema.columns c
  join pg_attribute a on a.attrelid = 'public.quitacoes'::regclass and a.attname = c.column_name
 where c.table_schema='public' and c.table_name='quitacoes'
 order by ordinal_position;

select conname, pg_get_constraintdef(oid) as definicao
  from pg_constraint where conrelid = 'public.quitacoes'::regclass
 order by contype, conname;


-- ############################################################################
-- CONSULTA 3 — OS `CREATE TRIGGER` QUE FALTAM
--
-- A migration 0062 recria as funções de gatilho
-- (`sureya_atualiza_estado_conversa`, `sureya_familia_para_cliente`,
-- `sureya_reagenda_apos_execucao`) mas NÃO os gatilhos que as ligam às tabelas
-- — a extração devolveu funções, não gatilhos.
--
-- Sem eles, o banco reconstruído tem a função e não tem o disparo: a conversa
-- não muda de estado, a família não é criada junto com o cadastro, e concluir
-- uma lavagem não reagenda a próxima. Silenciosamente.
--
-- Copie a coluna `definicao` inteira — cada linha já é um comando pronto.
-- ############################################################################
select c.relname as tabela,
       t.tgname  as gatilho,
       pg_get_triggerdef(t.oid) || ';' as definicao
  from pg_trigger t
  join pg_class     c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and not t.tgisinternal
 order by c.relname, t.tgname;


-- ############################################################################
-- CONSULTA 4 — `unaccent_simples()`
--
-- Usada por `sureya_palpites_entrada`. Não tem o prefixo `sureya_`, então não
-- apareceu na extração das funções. É a última peça conhecida que só existe
-- dentro do banco.
-- ############################################################################
select p.proname, pg_get_functiondef(p.oid) || ';' as ddl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname not like 'sureya\_%'
   and p.proname not in ('current_org_id','current_member_role','is_admin','is_campo','set_updated_at')
   and p.prolang = (select oid from pg_language where lanname in ('plpgsql','sql') limit 1)
 order by p.proname;


-- ############################################################################
-- CONSULTA 5 — O PLACAR
--
-- Depois de aplicar tudo, estes números têm de bater com o que
-- `npm run migrar-limpo` imprime no fim.
-- ############################################################################
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE')                as tabelas,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'sureya\_%')                as funcoes_sureya,
  (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
     join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal)                        as gatilhos,
  (select count(*) from pg_policy pol join pg_class c on c.oid=pol.polrelid
     join pg_namespace n on n.oid=c.relnamespace where n.nspname='public')   as policies;
