-- ============================================================================
-- LAVAGEM FEITA QUE NAO DEIXOU MARCA (0137)
--
-- Uma limpeza concluida deixa quatro marcas: o preco congelado, a baixa do
-- material, o pagamento da equipe e — quando ha foto — a linha na fila da
-- familia. Medido em producao em 27/08: das cinco executadas, DUAS nao tinham
-- preco nenhum e NENHUMA tinha o pagamento da equipe.
--
-- O QUE PODE DAR ERRADO AQUI E MUDO, NOS DOIS SENTIDOS:
--
--   ver de menos  a lista devolve zero e a tela diz "toda limpeza deixou suas
--                 marcas" em cima de trabalho feito que nunca foi contado.
--   ver demais    acusa toda lavagem de "pagamento nao calculado" quando o que
--                 falta e UMA configuracao. Alarme que sempre grita ensina a
--                 ignorar alarme — e ai o dia em que ele estiver certo passa
--                 batido tambem.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci37(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'LAVAGEM INCOMPLETA FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

do $$
declare
  v_org uuid := '17171717-1717-1717-1717-171717171717';
  v_cem uuid := '17171717-0000-0000-0000-0000000000cc';
  v_q   uuid := '17171717-0000-0000-0000-0000000000dd';
  v_fam uuid := '17171717-0000-0000-0000-0000000000fa';
  t_um  uuid := '17171717-0000-0000-0000-0000000000a1';
  s_ok    uuid := '17171717-0000-0000-0000-0000000000b0';
  s_preco uuid := '17171717-0000-0000-0000-0000000000b1';
  s_mat   uuid := '17171717-0000-0000-0000-0000000000b2';
  s_foto  uuid := '17171717-0000-0000-0000-0000000000b3';
  s_est   uuid := '17171717-0000-0000-0000-0000000000b4';
  v_n int; v_falta text[]; v_quantas int; v_preco int; v_semregra boolean;
begin
  insert into orgs (id, nome) values (v_org, 'Teste 0137') on conflict (id) do nothing;
  insert into cemiterios (id, org_id, nome) values (v_cem, v_org, 'Cem') on conflict (id) do nothing;
  insert into quadras (id, org_id, cemiterio_id, codigo) values (v_q, v_org, v_cem, 'Q1')
    on conflict (id) do nothing;
  insert into familias (id, org_id, nome) values (v_fam, v_org, 'Souza') on conflict (id) do nothing;
  insert into tumulos (id, org_id, quadra_id, familia_id, identificacao, codigo)
    values (t_um, v_org, v_q, v_fam, 'T-1', 'Q1-R1-001') on conflict (id) do nothing;

  -- -------------------------------------------------------------------------
  -- A LAVAGEM COMPLETA — o controle. Se ELA aparecer na lista, tudo o mais
  -- que este arquivo afirma nao vale nada: a lista estaria acusando todo mundo.
  -- -------------------------------------------------------------------------
  insert into servicos (id, org_id, tumulo_id, status, data_prevista, data_executada,
                        valor, custo_estimado, foto_depois_url)
  values (s_ok, v_org, t_um, 'executado', current_date - 1, now() - interval '1 day',
          25.00, 3.10, 'depois/ok.jpg') on conflict (id) do nothing;
  insert into fila_liberacao (org_id, familia_id, servico_id, tipo, texto)
  values (v_org, v_fam, s_ok, 'foto', 'A limpeza foi feita.') on conflict do nothing;

  -- SEM PRECO — o caso das duas linhas reais de producao.
  insert into servicos (id, org_id, tumulo_id, status, data_prevista, data_executada,
                        valor, custo_estimado)
  values (s_preco, v_org, t_um, 'executado', current_date - 2, now() - interval '2 days',
          null, 3.10) on conflict (id) do nothing;

  -- SEM BAIXA DE MATERIAL.
  insert into servicos (id, org_id, tumulo_id, status, data_prevista, data_executada,
                        valor, custo_estimado)
  values (s_mat, v_org, t_um, 'executado', current_date - 3, now() - interval '3 days',
          25.00, null) on conflict (id) do nothing;

  -- COM FOTO E SEM FILA — a familia nunca recebeu o que ja existe.
  insert into servicos (id, org_id, tumulo_id, status, data_prevista, data_executada,
                        valor, custo_estimado, foto_depois_url)
  values (s_foto, v_org, t_um, 'executado', current_date - 4, now() - interval '4 days',
          25.00, 3.10, 'depois/sozinha.jpg') on conflict (id) do nothing;

  -- ESTORNADA — trabalho desfeito nao e trabalho pela metade.
  insert into servicos (id, org_id, tumulo_id, status, data_prevista, data_executada,
                        valor, custo_estimado, estornado_em)
  values (s_est, v_org, t_um, 'executado', current_date - 5, now() - interval '5 days',
          null, null, now()) on conflict (id) do nothing;

  -- =========================================================================
  -- SEM NENHUMA REGRA DE PAGAMENTO — o estado real da casa em 27/08.
  -- =========================================================================
  select count(*) into v_n from sureya_lavagens_incompletas(v_org);
  perform ci37('ve as tres quebradas, e so elas', v_n = 3,
               'devolveu ' || v_n || ' (esperava 3: preco, material, foto)');

  perform ci37('a lavagem completa nao aparece',
               not exists (select 1 from sureya_lavagens_incompletas(v_org)
                            where servico_id = s_ok),
               'a completa entrou na lista — a tela acusaria trabalho que esta certo');

  perform ci37('a estornada nao aparece',
               not exists (select 1 from sureya_lavagens_incompletas(v_org)
                            where servico_id = s_est),
               'trabalho desfeito nao e trabalho pela metade');

  select faltando into v_falta from sureya_lavagens_incompletas(v_org) where servico_id = s_preco;
  perform ci37('sem preco: diz que e o preco que falta',
               v_falta @> array['sem preco: a lavagem foi feita e nao tem valor nenhum'],
               'motivos: ' || coalesce(array_to_string(v_falta, ' | '), '(nenhum)'));

  select faltando into v_falta from sureya_lavagens_incompletas(v_org) where servico_id = s_mat;
  perform ci37('sem material: diz que e o estoque que falta',
               v_falta @> array['material nao baixado do estoque'],
               'motivos: ' || coalesce(array_to_string(v_falta, ' | '), '(nenhum)'));

  select faltando into v_falta from sureya_lavagens_incompletas(v_org) where servico_id = s_foto;
  perform ci37('foto sem fila: diz que a familia nao recebeu',
               v_falta @> array['a foto nunca entrou na fila da familia'],
               'motivos: ' || coalesce(array_to_string(v_falta, ' | '), '(nenhum)'));

  -- ESTE E O TESTE DO "VER DEMAIS".
  --
  -- s_preco e s_mat nao tem foto nenhuma. Uma limpeza antiga registrada a mao
  -- nao tem o que mandar — cobrar dela uma linha na fila seria inventar uma
  -- falta. E o mesmo erro de tratar ausencia como medida, agora do lado do
  -- alarme.
  perform ci37('lavagem sem foto nao e cobrada de fila',
               not exists (select 1 from sureya_lavagens_incompletas(v_org)
                            where servico_id in (s_preco, s_mat)
                              and 'a foto nunca entrou na fila da familia' = any(faltando)),
               'acusou de nao mandar uma foto que nunca existiu');

  -- E ESTE E O OUTRO LADO DELE.
  --
  -- Nenhuma das quatro tem valor_executora. Sem regra cadastrada, isso NAO e
  -- defeito de cada lavagem — e uma configuracao que falta, e vira um recado
  -- so, no resumo.
  perform ci37('sem regra: ninguem e acusado de pagamento',
               not exists (select 1 from sureya_lavagens_incompletas(v_org)
                            where 'pagamento da equipe nao calculado' = any(faltando)),
               'acusou lavagem por uma conta que a casa ainda nao sabe fazer');

  select quantas, sem_preco, sem_regra_equipe into v_quantas, v_preco, v_semregra
    from sureya_lavagens_incompletas_resumo(v_org);
  perform ci37('o resumo conta as mesmas linhas da lista', v_quantas = 3,
               'resumo diz ' || v_quantas || ', lista tem 3 — duas contagens que discordam');
  perform ci37('o resumo separa quantas estao sem preco', v_preco = 1,
               'disse ' || v_preco);
  perform ci37('o resumo levanta a falta de regra de pagamento', v_semregra,
               'a casa nao tem regra nenhuma e o resumo nao avisou');

  -- =========================================================================
  -- AGORA A CASA TEM REGRA. O recado se cala e o alarme por lavagem acende.
  -- =========================================================================
  insert into remuneracao_regras (org_id, membro_id, modo, base_jazigo, valor_por_jazigo)
  values (v_org, null, 'por_jazigo', 'fixo', 8.00);

  select quantas, sem_regra_equipe into v_quantas, v_semregra
    from sureya_lavagens_incompletas_resumo(v_org);
  perform ci37('com regra, o recado de configuracao se cala', not v_semregra,
               'continuou pedindo uma regra que ja existe');

  perform ci37('com regra, a lavagem completa passa a ser cobrada do pagamento',
               exists (select 1 from sureya_lavagens_incompletas(v_org)
                        where servico_id = s_ok
                          and 'pagamento da equipe nao calculado' = any(faltando)),
               'ha regra e a lavagem sem valor_executora nao foi apontada');

  perform ci37('com regra, o resumo cresce junto com a lista',
               v_quantas = (select count(*) from sureya_lavagens_incompletas(v_org)),
               'resumo diz ' || v_quantas || ' e a lista tem outro numero');

  -- =========================================================================
  -- QUEM PODE LER — licao da 0129.
  --
  -- SECURITY DEFINER ignora RLS: quem executa le a organizacao inteira, e
  -- estas duas devolvem nome de familia e codigo de jazigo. O Supabase concede
  -- EXECUTE a `anon` POR PADRAO em `public`; migration que nao revoga, publica.
  -- =========================================================================
  perform ci37('anon nao executa a lista',
               not has_function_privilege('anon', 'sureya_lavagens_incompletas(uuid)', 'execute'),
               'a lista de familias esta aberta no endereco publico da API');
  perform ci37('anon nao executa o resumo',
               not has_function_privilege('anon', 'sureya_lavagens_incompletas_resumo(uuid)', 'execute'),
               'o resumo esta aberto para quem nao entrou');

  raise notice '  ---';
end $$;

drop function ci37(text, boolean, text);
