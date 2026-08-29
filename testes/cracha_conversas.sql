-- ============================================================================
-- O CRACHA CONTA O QUE A LISTA MOSTRA (0148)
--
-- MEDIDO EM 29/08, EM PRODUCAO: o crachá de "Precisam de você" dizia **7** e a
-- lista mostrava **1**.
--
-- DUAS CAUSAS SOMADAS, e as duas silenciosas:
--
--   1. O CONTADOR NAO EXCLUIA `resolvida`. A lista excluia (`.eq("resolvida",
--      false)`). Conversa resolvida que ainda estivesse `sem_resposta`
--      continuava no crachá e sumia da lista: "resolvi e continua pendente".
--
--   2. RESOLVER NAO FECHAVA O RASCUNHO da IA. Cinco das seis de diferenca eram
--      conversas ja resolvidas com `interacoes_ia.acao_humana is null` — e
--      `tem_rascunho` entra na conta. A conversa voltava a pesar depois de
--      atendida.
--
-- E A CAUSA DE FUNDO E A DE SEMPRE: a mesma regra escrita duas vezes, uma em
-- SQL (o contador) e outra em TypeScript (a lista). O comentario da rota ja
-- avisava — "esta regra tem que ser a MESMA usada pelo contador, senao a aba
-- diz (1) e a lista vem vazia" — e mesmo assim elas divergiram de novo.
--
-- Este arquivo nao confere um numero: confere que as DUAS REGRAS DAO O MESMO
-- RESULTADO, sobre os casos que sabidamente as separam.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci48(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'CRACHA FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into auth.users (id, email)
  values ('48484848-0000-0000-0000-000000000001','cracha@sureya.test') on conflict (id) do nothing;
select set_config('request.jwt.claim.sub','48484848-0000-0000-0000-000000000001', false);

insert into orgs (id, nome) values ('48484848-4848-4848-4848-484848484848','CI Cracha')
  on conflict (id) do nothing;
insert into membros (org_id, user_id, papel, ativo)
  values ('48484848-4848-4848-4848-484848484848','48484848-0000-0000-0000-000000000001','admin', true)
  on conflict do nothing;

do $$
declare
  v_org uuid := '48484848-4848-4848-4848-484848484848';
  v_fam uuid := '48484848-0000-0000-0000-0000000000fa';
  v_cli uuid := '48484848-0000-0000-0000-0000000000c1';
  k_pede uuid := '48484848-0000-0000-0000-0000000000a1'; -- pendente de verdade
  k_res  uuid := '48484848-0000-0000-0000-0000000000a2'; -- resolvida, sem_resposta
  k_rasc uuid := '48484848-0000-0000-0000-0000000000a3'; -- resolvida, com rascunho
  k_arq  uuid := '48484848-0000-0000-0000-0000000000a4'; -- arquivada
  v_cracha int; v_lista int;
begin
  insert into familias (id, org_id, nome) values (v_fam, v_org, 'Cracha') on conflict (id) do nothing;
  insert into clientes (id, org_id, nome, telefone, familia_id)
    values (v_cli, v_org, 'Gente', '5511944440000', v_fam) on conflict (id) do nothing;

  insert into conversas (id, org_id, cliente_id, estado, resolvida)
    values (k_pede, v_org, v_cli, 'sem_resposta', false) on conflict (id) do nothing;
  insert into conversas (id, org_id, cliente_id, estado, resolvida)
    values (k_res, v_org, v_cli, 'sem_resposta', true) on conflict (id) do nothing;
  insert into conversas (id, org_id, cliente_id, estado, resolvida)
    values (k_rasc, v_org, v_cli, 'respondida', true) on conflict (id) do nothing;
  insert into conversas (id, org_id, cliente_id, estado, resolvida, arquivada_em)
    values (k_arq, v_org, v_cli, 'sem_resposta', false, now()) on conflict (id) do nothing;

  -- O rascunho que sobrou numa conversa JA RESOLVIDA — o caso das cinco.
  insert into interacoes_ia (org_id, cliente_id, conversa_id, assunto, rascunho, acao_humana)
    values (v_org, v_cli, k_rasc, 'duvida', 'texto que ninguem vai usar', null);

  -- =========================================================================
  -- A REGRA DA LISTA, escrita aqui do jeito que a rota escreve em TypeScript:
  --   nao arquivada  E  nao resolvida  E  (equipe | rascunho | escalada |
  --                                        estado em sem_resposta/lida)
  -- =========================================================================
  select count(*) into v_lista
    from conversas c
   where c.org_id = v_org
     and c.arquivada_em is null
     and not c.resolvida
     and (c.tipo = 'equipe'
          or exists (select 1 from interacoes_ia i
                      where i.conversa_id = c.id and i.acao_humana is null)
          or c.escalada_humano
          or c.estado in ('sem_resposta','lida_sem_resposta'));

  select pendentes into v_cracha from sureya_contadores_conversas();

  perform ci48('o cracha e a lista dao o mesmo numero',
               v_cracha = v_lista,
               'cracha diz ' || v_cracha || ' e a lista mostra ' || v_lista
               || ' — foi 7 contra 1 em producao');

  perform ci48('e o numero e o da conversa que realmente pede',
               v_cracha = 1,
               'veio ' || v_cracha);

  -- =========================================================================
  -- OS TRES CASOS QUE SEPARAVAM AS DUAS REGRAS.
  -- =========================================================================
  perform ci48('conversa resolvida NAO pesa, mesmo sem resposta',
               not exists (
                 select 1 from conversas c where c.id = k_res and c.resolvida
                   and c.estado in ('sem_resposta','lida_sem_resposta'))
               or v_cracha = 1,
               'resolver deixou de tirar a conversa da pendencia');

  perform ci48('resolvida com rascunho aberto tambem nao pesa',
               v_cracha = 1,
               'o rascunho esquecido faz a conversa atendida voltar a pesar');

  perform ci48('arquivada nao entra na conta',
               v_cracha = 1, 'arquivada voltou para a fila');

  -- =========================================================================
  -- E QUANDO A CONVERSA QUE PEDE E RESOLVIDA, O CRACHA ZERA.
  -- =========================================================================
  update conversas set resolvida = true where id = k_pede;
  select pendentes into v_cracha from sureya_contadores_conversas();
  perform ci48('resolver a ultima zera o cracha',
               v_cracha = 0,
               'resolveu tudo e o cracha continua com ' || v_cracha);

  perform ci48('anon nao le os contadores',
               not has_function_privilege('anon', 'sureya_contadores_conversas()', 'execute'),
               'da para contar as conversas da casa sem entrar no sistema');

  raise notice '  ---';
end $$;

select set_config('request.jwt.claim.sub', '', false);
drop function ci48(text, boolean, text);
