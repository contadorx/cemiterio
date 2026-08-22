-- ============================================================================
-- SUREYA — DADOS DE TESTE (3 conjuntos)
--
-- COMO USAR
--   1) Rode este arquivo no SQL Editor do Supabase DEPOIS das migrations 0001–0011.
--   2) Ele detecta sua org automaticamente (a primeira cadastrada).
--   3) Para APAGAR os testes depois, rode a última seção (LIMPEZA) — está comentada.
--
-- OS TRÊS CENÁRIOS
--   A) Dona Cecília  — cliente exemplar: paga adiantado, plano mensal, histórico
--                      de limpezas com foto, avaliação feita. Serve pra ver o
--                      fluxo "tudo certo": saldo positivo, portal, relatório.
--   B) Sr. Antônio   — cliente problemático: saldo NEGATIVO (limpezas feitas e não
--                      pagas), sem limpeza há meses. Serve pra ver cobrança gentil,
--                      relatório "em aberto" e a régua de cobrança.
--   C) Família Souza — cliente novo: acabou de entrar, plano trimestral, primeira
--                      limpeza AGENDADA (ainda não feita), datas de memória
--                      preenchidas. Serve pra ver agenda, app de campo e gatilhos.
--   + Um LEAD (número desconhecido) e uma INDICAÇÃO, pra ver essas telas.
-- ============================================================================

do $$
declare
  v_org        uuid;
  v_cem        uuid;
  v_quadra     uuid;
  -- A
  v_cliA uuid; v_tumA uuid; v_planoA uuid; v_servA1 uuid; v_servA2 uuid;
  -- B
  v_cliB uuid; v_tumB uuid; v_planoB uuid; v_servB1 uuid; v_servB2 uuid;
  -- C
  v_cliC uuid; v_tumC uuid; v_planoC uuid; v_servC1 uuid;
begin
  select id into v_org from orgs order by created_at limit 1;
  if v_org is null then
    raise exception 'Nenhuma org encontrada. Crie a org antes de rodar o seed.';
  end if;

  -- cemitério e quadra de teste ------------------------------------------------
  select id into v_cem from cemiterios where org_id = v_org limit 1;
  if v_cem is null then
    insert into cemiterios (org_id, nome)
    values (v_org, 'Cemitério da Saudade — Vila Vitória, Mauá')
    returning id into v_cem;
  end if;

  insert into quadras (org_id, cemiterio_id, codigo, ordem)
  values (v_org, v_cem, 'TESTE-7', 7)
  returning id into v_quadra;

  -- ==========================================================================
  -- A) DONA CECÍLIA — em dia, adiantada, com histórico
  -- ==========================================================================
  insert into clientes (org_id, nome, telefone, modo, ativo_ia, score, consentimento_em, consentimento_via,
                        perfil_ia, observacoes)
  values (v_org, '[TESTE] Dona Cecília Ramos', '5511990001111', 'automatico', true, 92, now(), 'whatsapp',
          E'- Trata com formalidade carinhosa; gosta de ser chamada de "Dona Cecília".\n- Visita o túmulo do marido no aniversário de casamento (12/09).\n- Paga sempre adiantado, por Pix, no começo do mês.\n- Pede foto de toda limpeza; guarda todas.',
          'Cliente desde 2024. Referência de bom relacionamento.')
  returning id into v_cliA;

  insert into tumulos (org_id, quadra_id, cliente_id, identificacao, falecido_nome, datas_gatilho)
  values (v_org, v_quadra, v_cliA, 'T-101', 'Joaquim Ramos',
          '[{"tipo":"falecimento","data":"03-18"},{"tipo":"nascimento","data":"09-12"}]'::jsonb)
  returning id into v_tumA;

  insert into planos (org_id, cliente_id, tumulo_id, cadencia, qtd_por_passagem, valor_vigente,
                      data_valor_vigente, proximo_servico, ativo)
  values (v_org, v_cliA, v_tumA, 'mensal', 2, 40, current_date - 200, current_date + 5, true)
  returning id into v_planoA;

  -- duas limpezas já executadas (com foto fictícia)
  insert into servicos (org_id, tumulo_id, plano_id, cliente_id, data_prevista, status, data_executada,
                        foto_depois_url, valor, notificado_cliente)
  values (v_org, v_tumA, v_planoA, v_cliA, current_date - 60, 'executado', now() - interval '60 days',
          'https://placehold.co/600x400/12284b/white?text=Limpeza+1', 40, true)
  returning id into v_servA1;

  insert into servicos (org_id, tumulo_id, plano_id, cliente_id, data_prevista, status, data_executada,
                        foto_depois_url, valor, notificado_cliente)
  values (v_org, v_tumA, v_planoA, v_cliA, current_date - 30, 'executado', now() - interval '30 days',
          'https://placehold.co/600x400/12284b/white?text=Limpeza+2', 40, true)
  returning id into v_servA2;

  -- débitos das duas limpezas + pagamentos que deixam ela ADIANTADA
  insert into movimentos (org_id, cliente_id, tipo, valor, origem, servico_id, status_conc, descricao, data)
  values (v_org, v_cliA, 'debito', 40, 'servico', v_servA1, 'confirmado', 'Limpeza executada', current_date - 60),
         (v_org, v_cliA, 'debito', 40, 'servico', v_servA2, 'confirmado', 'Limpeza executada', current_date - 30);

  insert into movimentos (org_id, cliente_id, tipo, valor, origem, status_conc, descricao, data)
  values (v_org, v_cliA, 'credito', 160, 'conciliacao_manual', 'confirmado', 'Pix — 4 limpezas adiantadas', current_date - 62);

  -- portal da família ativo + avaliação respondida
  update tumulos set qr_token = encode(gen_random_bytes(16),'hex') where id = v_tumA;
  insert into avaliacoes (org_id, cliente_id, servico_id, nota, comentario, token, respondida_em)
  values (v_org, v_cliA, v_servA2, 5, 'Ficou impecável, como sempre. Muito obrigada pelo carinho de vocês.',
          encode(gen_random_bytes(12),'hex'), now() - interval '28 days');

  -- conversa de exemplo
  insert into conversas (org_id, cliente_id, aberta, ultimo_assunto)
  values (v_org, v_cliA, true, 'agendamento');

  -- ==========================================================================
  -- B) SR. ANTÔNIO — saldo NEGATIVO, sem limpeza há tempo
  -- ==========================================================================
  insert into clientes (org_id, nome, telefone, modo, ativo_ia, score, consentimento_em, consentimento_via)
  values (v_org, '[TESTE] Sr. Antônio Prado', '5511990002222', 'copiloto', true, 45, now(), 'cadastro')
  returning id into v_cliB;

  insert into tumulos (org_id, quadra_id, cliente_id, identificacao, falecido_nome, datas_gatilho)
  values (v_org, v_quadra, v_cliB, 'T-102', 'Terezinha Prado',
          '[{"tipo":"falecimento","data":"11-05"}]'::jsonb)
  returning id into v_tumB;

  insert into planos (org_id, cliente_id, tumulo_id, cadencia, qtd_por_passagem, valor_vigente,
                      data_valor_vigente, proximo_servico, ativo)
  values (v_org, v_cliB, v_tumB, 'bimestral', 1, 45, current_date - 400, current_date - 10, true)
  returning id into v_planoB;

  insert into servicos (org_id, tumulo_id, plano_id, cliente_id, data_prevista, status, data_executada,
                        foto_depois_url, valor, notificado_cliente)
  values (v_org, v_tumB, v_planoB, v_cliB, current_date - 150, 'executado', now() - interval '150 days',
          'https://placehold.co/600x400/475569/white?text=Limpeza', 45, true)
  returning id into v_servB1;

  insert into servicos (org_id, tumulo_id, plano_id, cliente_id, data_prevista, status, data_executada,
                        foto_depois_url, valor, notificado_cliente)
  values (v_org, v_tumB, v_planoB, v_cliB, current_date - 90, 'executado', now() - interval '90 days',
          'https://placehold.co/600x400/475569/white?text=Limpeza', 45, true)
  returning id into v_servB2;

  -- dois débitos e NENHUM pagamento => saldo -90 (dispara cobrança gentil)
  insert into movimentos (org_id, cliente_id, tipo, valor, origem, servico_id, status_conc, descricao, data)
  values (v_org, v_cliB, 'debito', 45, 'servico', v_servB1, 'confirmado', 'Limpeza executada', current_date - 150),
         (v_org, v_cliB, 'debito', 45, 'servico', v_servB2, 'confirmado', 'Limpeza executada', current_date - 90);

  -- comprovante PENDENTE de conferência (pra você testar o botão Confirmar)
  insert into comprovantes (org_id, cliente_id, imagem_url, valor_extraido, data_extraida, id_transacao, status)
  values (v_org, v_cliB, 'https://placehold.co/600x800/f1f5f9/334155?text=Comprovante+Pix',
          90, current_date - 2, 'E1234567890TESTE', 'a_conferir');

  insert into conversas (org_id, cliente_id, aberta, ultimo_assunto, escalada_humano)
  values (v_org, v_cliB, true, 'cobranca', true);

  -- ==========================================================================
  -- C) FAMÍLIA SOUZA — novo, primeira limpeza AGENDADA (aparece no app da Nina)
  -- ==========================================================================
  insert into clientes (org_id, nome, telefone, modo, ativo_ia, score, consentimento_em, consentimento_via)
  values (v_org, '[TESTE] Marcos Souza', '5511990003333', 'copiloto', true, 50, now(), 'whatsapp')
  returning id into v_cliC;

  insert into tumulos (org_id, quadra_id, cliente_id, identificacao, falecido_nome, datas_gatilho)
  values (v_org, v_quadra, v_cliC, 'T-103', 'Benedita Souza',
          '[{"tipo":"falecimento","data":"07-23"},{"tipo":"nascimento","data":"02-14"}]'::jsonb)
  returning id into v_tumC;

  insert into planos (org_id, cliente_id, tumulo_id, cadencia, qtd_por_passagem, valor_vigente,
                      data_valor_vigente, proximo_servico, ativo)
  values (v_org, v_cliC, v_tumC, 'trimestral', 2, 50, current_date, current_date + 1, true)
  returning id into v_planoC;

  -- serviço AGENDADO PARA HOJE => aparece no app de campo pra você testar a foto
  insert into servicos (org_id, tumulo_id, plano_id, cliente_id, data_prevista, ordem_dia, status, valor)
  values (v_org, v_tumC, v_planoC, v_cliC, current_date, 1, 'agendado', 50)
  returning id into v_servC1;

  -- pagou adiantado a primeira passagem
  insert into movimentos (org_id, cliente_id, tipo, valor, origem, status_conc, descricao, data)
  values (v_org, v_cliC, 'credito', 100, 'pix_comprovante', 'confirmado', 'Pix — primeira passagem', current_date - 1);

  -- ==========================================================================
  -- EXTRAS: um lead e uma indicação
  -- ==========================================================================
  insert into leads (org_id, telefone, nome_wa, mensagens, status)
  values (v_org, '5511990004444', 'Regina (teste)',
          jsonb_build_array(
            jsonb_build_object('t', (now() - interval '2 hours')::text, 'texto', 'Boa tarde, vocês limpam túmulo no Cemitério da Saudade?'),
            jsonb_build_object('t', (now() - interval '1 hour')::text, 'texto', 'É o túmulo do meu pai, faz tempo que ninguém cuida')
          ),
          'novo');

  update clientes set codigo_indicacao = 'TESTECEC' where id = v_cliA;
  insert into indicacoes (org_id, indicador_id, codigo, indicado_nome, indicado_tel, status)
  values (v_org, v_cliA, 'TESTECEC', 'Vera Lúcia (teste)', '5511990005555', 'novo');

  raise notice 'Seed criado com sucesso na org %', v_org;
end $$;

-- ============================================================================
-- CONFERIR O QUE FOI CRIADO
-- ============================================================================
select c.nome,
       coalesce(sum(case when m.tipo='credito' and m.status_conc='confirmado' then m.valor
                         when m.tipo='debito'  and m.status_conc='confirmado' then -m.valor
                         else 0 end), 0) as saldo
from clientes c
left join movimentos m on m.cliente_id = c.id
where c.nome like '[TESTE]%'
group by c.nome
order by c.nome;
-- Esperado:  Dona Cecília = +80 (adiantada) · Sr. Antônio = -90 (em aberto) · Marcos Souza = +100

-- ============================================================================
-- LIMPEZA — descomente e rode para apagar TODOS os dados de teste
-- ============================================================================
-- do $$
-- declare v_ids uuid[];
-- begin
--   select array_agg(id) into v_ids from clientes where nome like '[TESTE]%';
--   delete from avaliacoes    where cliente_id = any(v_ids);
--   delete from indicacoes    where indicador_id = any(v_ids);
--   delete from movimentos    where cliente_id = any(v_ids);
--   delete from comprovantes  where cliente_id = any(v_ids);
--   delete from servicos      where cliente_id = any(v_ids);
--   delete from planos        where cliente_id = any(v_ids);
--   delete from tumulos       where cliente_id = any(v_ids);
--   delete from mensagens     where cliente_id = any(v_ids);
--   delete from interacoes_ia where cliente_id = any(v_ids);
--   delete from conversas     where cliente_id = any(v_ids);
--   delete from clientes      where id = any(v_ids);
--   delete from leads         where nome_wa like '%(teste)%';
--   delete from quadras       where codigo = 'TESTE-7';
-- end $$;
