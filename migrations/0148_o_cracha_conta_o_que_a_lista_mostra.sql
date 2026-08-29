-- ============================================================================
-- 0148 — O CRACHA CONTA O QUE A LISTA MOSTRA
-- ============================================================================
--
-- MEDIDO EM 29/08, EM PRODUCAO
--
--   7  era o que o cracha de "Precisam de voce" dizia
--   1  era o que a lista mostrava
--   6  de diferenca, e CINCO delas eram conversas ja resolvidas com rascunho
--      da IA ainda aberto
--
-- DUAS CAUSAS SOMADAS
--
-- 1. O CONTADOR NAO EXCLUIA `resolvida`. A lista excluia, no banco:
--
--        sel = sel.eq("resolvida", false)
--
--    Entao uma conversa resolvida que ainda estivesse `sem_resposta`
--    continuava no cracha e sumia da lista. Do lado de ca: "eu resolvi e
--    continua aparecendo como pendente".
--
-- 2. RESOLVER NAO FECHAVA O RASCUNHO (consertado na rota, nao aqui).
--    `tem_rascunho` entra na conta de quem precisa de voce, e o rascunho ficava
--    `acao_humana is null` para sempre — entao a conversa voltava a pesar
--    depois de atendida.
--
-- A CAUSA DE FUNDO E A DE SEMPRE: a mesma regra escrita duas vezes, uma em SQL
-- e outra em TypeScript. O comentario da propria rota ja avisava —
--
--     "Esta regra tem que ser a MESMA usada pelo contador — senao a aba diz
--      (1) e a lista vem vazia, que foi o que aconteceu."
--
-- — e mesmo assim elas divergiram de novo, porque o `.eq("resolvida", false)`
-- da lista mora numa LINHA DIFERENTE do arquivo, longe da funcao que diz a
-- regra. `testes/cracha_conversas.sql` passa a comparar os dois numeros a cada
-- CI, sobre os casos que sabidamente os separam.
--
-- NADA AQUI MEXE EM DADO. E uma funcao de leitura.
-- ============================================================================

create or replace function sureya_contadores_conversas()
returns table (pendentes integer, aguardando integer, escaladas integer,
               arquivadas integer, resolvidas integer)
language sql
security definer
set search_path = public
as $$
  with base as (
    select c.id, c.tipo, c.estado, c.resolvida, c.escalada_humano, c.arquivada_em,
           exists (
             select 1 from interacoes_ia i
             where i.conversa_id = c.id and i.acao_humana is null
           ) as tem_rascunho
    from conversas c
    where c.org_id = current_org_id()
  )
  select
    -- EXATAMENTE o que a aba "Precisam de voce" mostra — incluindo o
    -- `not resolvida`, que era o que faltava.
    count(*) filter (
      where arquivada_em is null
        and not resolvida
        and (
          tipo = 'equipe'
          or tem_rascunho
          or escalada_humano
          or estado in ('sem_resposta','lida_sem_resposta')
        )
    )::int,
    -- "Aguardando" tambem: uma conversa resolvida nao esta aguardando nada.
    count(*) filter (
      where arquivada_em is null and not resolvida
        and estado in ('sem_resposta','lida_sem_resposta')
    )::int,
    count(*) filter (where arquivada_em is null and escalada_humano)::int,
    count(*) filter (where arquivada_em is not null)::int,
    count(*) filter (where arquivada_em is null and resolvida)::int
  from base;
$$;

comment on function sureya_contadores_conversas() is
  'Os contadores das abas de Conversas (0148). Pendentes exclui resolvida, igual a lista.';

revoke execute on function sureya_contadores_conversas() from public, anon;
grant  execute on function sureya_contadores_conversas() to authenticated, service_role;
