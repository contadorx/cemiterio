-- ============================================================================
-- A PROMESSA TEM DONO E PRAZO (0142)
--
-- O QUE SE MEDIU EM 29/08, EM PRODUCAO
--
--   25  respostas da IA a mensagens de familia
--   11  (44%) prometiam voltar: "deixa eu conferir isso direitinho e ja te falo"
--    0  diziam um prazo
--    0  deixavam registro
--
-- O QUE PODE DAR ERRADO AQUI E MUDO, NOS DOIS SENTIDOS:
--
--   ver de menos  a promessa nao entra na lista, e o "Precisa de voce" fica
--                 limpo em cima de uma familia esperando resposta. E
--                 exatamente o estado de antes desta tabela existir — so que
--                 agora com uma tela dizendo que nao ha nada.
--   ver demais    a promessa cumprida continua na lista, e a lista vira ruido.
--                 Ruido se aprende a ignorar, e ai a promessa de verdade passa
--                 batida junto.
--
-- E o terceiro, o pior: "cumprido" sem dizer O QUE ACONTECEU. Respondida a
-- familia e varrida para debaixo do tapete tem de ser distinguiveis daqui a
-- tres meses.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci42(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'COMPROMISSOS FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

do $$
declare
  v_org  uuid := '42424242-4242-4242-4242-424242424242';
  v_out  uuid := '42424242-0000-0000-0000-0000000000ff';  -- a org do vizinho
  v_cli  uuid := '42424242-0000-0000-0000-0000000000c1';
  v_cli2 uuid := '42424242-0000-0000-0000-0000000000c2';
  k_hoje uuid := '42424242-0000-0000-0000-0000000000a1';
  k_atra uuid := '42424242-0000-0000-0000-0000000000a2';
  k_feito uuid := '42424242-0000-0000-0000-0000000000a3';
  k_outro uuid := '42424242-0000-0000-0000-0000000000a4';
  v_hoje_sp date := (now() at time zone 'America/Sao_Paulo')::date;
  v_erro text;
begin
  insert into orgs (id, nome) values (v_org, 'Teste 0142') on conflict (id) do nothing;
  insert into orgs (id, nome) values (v_out, 'Vizinha 0142') on conflict (id) do nothing;
  insert into clientes (id, org_id, nome) values (v_cli, v_org, 'Dona Ines')
    on conflict (id) do nothing;
  insert into clientes (id, org_id, nome) values (v_cli2, v_out, 'Familia do vizinho')
    on conflict (id) do nothing;

  -- -------------------------------------------------------------------------
  -- TRES PROMESSAS DESTA ORG e uma do vizinho.
  -- -------------------------------------------------------------------------
  insert into compromissos (id, org_id, cliente_id, sobre, vence_em)
  values (k_hoje, v_org, v_cli, 'confirmar o valor da troca de vaso', v_hoje_sp)
  on conflict (id) do nothing;

  insert into compromissos (id, org_id, cliente_id, sobre, vence_em)
  values (k_atra, v_org, v_cli, 'conferir o comprovante de 12/08', v_hoje_sp - 3)
  on conflict (id) do nothing;

  insert into compromissos (id, org_id, cliente_id, sobre, vence_em, cumprido_em, desfecho)
  values (k_feito, v_org, v_cli, 'mandar a foto da limpeza', v_hoje_sp - 5,
          now(), 'respondido')
  on conflict (id) do nothing;

  insert into compromissos (id, org_id, cliente_id, sobre, vence_em)
  values (k_outro, v_out, v_cli2, 'promessa que nao e minha', v_hoje_sp - 9)
  on conflict (id) do nothing;

  -- =========================================================================
  -- O QUE ESTA EM ABERTO
  -- =========================================================================
  perform ci42('a promessa aberta aparece',
               exists (select 1 from sureya_compromissos_abertos(v_org) where id = k_hoje),
               'prometeu e a lista nao mostrou — o "Precisa de voce" fica limpo em cima de gente esperando');

  perform ci42('a promessa cumprida sai da lista',
               not exists (select 1 from sureya_compromissos_abertos(v_org) where id = k_feito),
               'ja respondida e continua cobrando: a lista vira ruido e o ruido se aprende a ignorar');

  perform ci42('a promessa do vizinho nao aparece',
               not exists (select 1 from sureya_compromissos_abertos(v_org) where id = k_outro),
               'p_org nao esta segurando: uma org enxerga a promessa da outra');

  perform ci42('a lista traz o nome da familia',
               (select cliente from sureya_compromissos_abertos(v_org) where id = k_hoje) = 'Dona Ines',
               '"confirmar o valor" sem dizer para quem nao da para cumprir');

  -- =========================================================================
  -- ATRASADO E O DIA DA OPERACAO, NAO O DE UTC
  --
  -- Das 21h a meia-noite o dia em UTC ja virou. Uma promessa que vence HOJE
  -- apareceria vermelha na vespera, e quem ve alarme errado a noite inteira
  -- para de olhar o alarme.
  -- =========================================================================
  perform ci42('vencer hoje ainda nao e atraso',
               (select atrasado from sureya_compromissos_abertos(v_org) where id = k_hoje) = false,
               'a promessa de hoje ja nasceu atrasada — provavelmente o "hoje" veio de UTC');

  perform ci42('vencida ontem e atraso',
               (select atrasado from sureya_compromissos_abertos(v_org) where id = k_atra) = true,
               'tres dias de atraso e a lista diz que esta em dia');

  perform ci42('o mais vencido vem primeiro',
               (select id from sureya_compromissos_abertos(v_org) limit 1) = k_atra,
               'a ordem nao e a do prazo: quem esperou mais fica no fim da lista');

  -- =========================================================================
  -- CUMPRIDO TEM DE DIZER O QUE ACONTECEU
  --
  -- "Respondi a familia" e "o assunto morreu" sao coisas diferentes. Fechar
  -- sem desfecho apagaria a diferenca, e daqui a tres meses ninguem saberia se
  -- a familia foi atendida ou se a pendencia foi varrida para debaixo do tapete.
  -- =========================================================================
  begin
    update compromissos set cumprido_em = now() where id = k_hoje;
    v_erro := null;
  exception when check_violation then v_erro := 'recusou';
  end;
  perform ci42('fechar sem dizer o desfecho e recusado',
               v_erro = 'recusou',
               'deu para marcar cumprido sem dizer o que houve com o assunto');

  begin
    insert into compromissos (org_id, cliente_id, sobre)
    values (v_org, v_cli, '   ');
    v_erro := null;
  exception when check_violation then v_erro := 'recusou';
  end;
  perform ci42('promessa sem assunto e recusada',
               v_erro = 'recusou',
               '"prometeu alguma coisa" sem o que e pior que registro nenhum');

  begin
    update compromissos set cumprido_em = now(), desfecho = 'sumiu' where id = k_hoje;
    v_erro := null;
  exception when check_violation then v_erro := 'recusou';
  end;
  perform ci42('desfecho inventado e recusado',
               v_erro = 'recusou',
               'entrou um desfecho que nenhuma tela sabe ler');

  -- Fechado do jeito certo, some.
  update compromissos set cumprido_em = now(), desfecho = 'nao_cabe' where id = k_hoje;
  perform ci42('fechada por "nao cabe mais", some da lista',
               not exists (select 1 from sureya_compromissos_abertos(v_org) where id = k_hoje),
               'fechou e continua cobrando');

  -- =========================================================================
  -- A INTERACAO GUARDA SE PROMETEU (0142b)
  --
  -- A coluna e o que liga a resposta da IA a linha desta tabela. Sem ela nao
  -- da para medir de novo os 44% depois da mudanca — e o que nao se remede
  -- volta.
  -- =========================================================================
  perform ci42('interacoes_ia guarda que prometeu',
               exists (select 1 from information_schema.columns
                        where table_name = 'interacoes_ia' and column_name = 'prometeu_voltar'),
               'nao da para remedir os 44% depois da mudanca');
  perform ci42('interacoes_ia guarda sobre o que prometeu',
               exists (select 1 from information_schema.columns
                        where table_name = 'interacoes_ia' and column_name = 'promessa_sobre'),
               'sabe que prometeu e nao sabe o que');

  -- =========================================================================
  -- QUEM PODE LER — licao da 0129.
  --
  -- SECURITY DEFINER ignora RLS; so o GRANT protege. Esta devolve nome de
  -- familia e o que foi prometido a ela. O Supabase concede EXECUTE a `anon`
  -- POR PADRAO em `public`: migration que nao revoga, publica.
  -- =========================================================================
  perform ci42('anon nao executa a lista de promessas',
               not has_function_privilege('anon', 'sureya_compromissos_abertos(uuid)', 'execute'),
               'nome de familia e promessa abertos no endereco publico da API');

  raise notice '  ---';
end $$;

drop function ci42(text, boolean, text);
