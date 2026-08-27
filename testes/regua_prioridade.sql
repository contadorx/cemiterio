-- ============================================================================
-- A REGUA DE PRIORIDADE (0136)
--
-- Antes havia um numero so: servicos.prioridade, +15 por adiamento. Nada mais
-- levantava — nem a familia que ligou pedindo, nem a data de memoria chegando,
-- nem o contrato novo que nunca foi lavado.
--
-- O QUE PODE DAR ERRADO AQUI E MUDO: um peso que nao entra na soma, ou um
-- criterio que pega todo mundo, muda a ordem da rota da Nina sem dar erro
-- nenhum. Ela lava na ordem errada durante semanas e ninguem descobre pelo log.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci36(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'PRIORIDADE FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

do $$
declare
  v_org uuid := '11111111-1111-1111-1111-111111111111';
  v_q   uuid := '33333333-3333-3333-3333-333333333333';
  v_fam uuid := '44444444-4444-4444-4444-444444444444';
  t_novo  uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  t_velho uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  t_mem   uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  s_novo  uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  s_velho uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  s_mem   uuid := 'bbbbbbbb-0000-0000-0000-000000000003';
  v_n int; v_pontos int; v_motivos text[];
begin
  insert into orgs (id, nome) values (v_org, 'Teste Prioridade') on conflict (id) do nothing;
  insert into cemiterios (id, org_id, nome)
    values ('22222222-2222-2222-2222-222222222222', v_org, 'Cem') on conflict (id) do nothing;
  insert into quadras (id, org_id, cemiterio_id, codigo)
    values (v_q, v_org, '22222222-2222-2222-2222-222222222222', 'Q1') on conflict (id) do nothing;
  insert into familias (id, org_id, nome) values (v_fam, v_org, 'Fam') on conflict (id) do nothing;

  -- A REGUA E SEMEADA PELA MIGRATION para TODA org. Se ela nao chegar na org
  -- nova, os pesos ficam zerados e a regua nao faz nada — em silencio.
  select count(*) into v_n from prioridade_regua where org_id = v_org;
  perform ci36('a regua nasce com os seis criterios', v_n = 6, 'vieram ' || v_n);

  -- ---------------------------------------------------------------------
  -- OS CASOS
  -- ---------------------------------------------------------------------
  insert into tumulos (id, org_id, quadra_id, familia_id, identificacao) values
    (t_novo,  v_org, v_q, v_fam, 'T-NOVO'),
    (t_velho, v_org, v_q, v_fam, 'T-VELHO')
  on conflict (id) do nothing;

  -- um tumulo com data de memoria daqui a 3 dias
  insert into tumulos (id, org_id, quadra_id, familia_id, identificacao, datas_gatilho)
  values (t_mem, v_org, v_q, v_fam, 'T-MEM',
          jsonb_build_array(jsonb_build_object(
            'tipo','falecimento',
            'data', to_char(current_date + 3, 'MM-DD'))))
  on conflict (id) do nothing;

  -- NOVO: nunca lavado, no prazo
  insert into servicos (id, org_id, tumulo_id, status, data_prevista)
  values (s_novo, v_org, t_novo, 'pendente', current_date + 5) on conflict (id) do nothing;

  -- VELHO: ja teve lavagem ha 90 dias, e esta atrasado 2 semanas
  insert into servicos (id, org_id, tumulo_id, status, data_prevista, data_executada)
  values ('cccccccc-0000-0000-0000-000000000001', v_org, t_velho, 'executado',
          current_date - 90, now() - interval '90 days') on conflict (id) do nothing;
  insert into servicos (id, org_id, tumulo_id, status, data_prevista)
  values (s_velho, v_org, t_velho, 'pendente', current_date - 14) on conflict (id) do nothing;

  -- MEMORIA: nunca lavado E com data chegando
  insert into servicos (id, org_id, tumulo_id, status, data_prevista)
  values (s_mem, v_org, t_mem, 'pendente', current_date + 5) on conflict (id) do nothing;

  -- ---------------------------------------------------------------------
  -- 1. CADA CRITERIO SOMA O QUE DIZ QUE SOMA
  -- ---------------------------------------------------------------------
  select pontos, motivos into v_pontos, v_motivos
    from sureya_prioridade_calculada(v_org) where servico_id = s_novo;
  -- nunca lavado (25). Nada mais: esta no prazo e nunca foi adiado.
  perform ci36('nunca lavado soma 25', v_pontos = 25, 'veio ' || v_pontos);
  perform ci36('e diz por que, em vez de so dar um numero',
               'nunca foi lavado' = any(v_motivos), array_to_string(v_motivos, ', '));

  select pontos into v_pontos
    from sureya_prioridade_calculada(v_org) where servico_id = s_velho;
  -- atrasado 2 semanas (2 x 10) + sem lavar ha 3 meses (3 x 5) = 35.
  -- NAO soma "nunca lavado": este ja teve uma lavagem.
  perform ci36('atrasado e velho somam, e o novo nao entra', v_pontos = 35,
               'veio ' || v_pontos || ', esperado 35');

  select pontos, motivos into v_pontos, v_motivos
    from sureya_prioridade_calculada(v_org) where servico_id = s_mem;
  -- memoria (40) + nunca lavado (25) = 65. E o mais alto de proposito: a data
  -- de memoria e o unico criterio com prazo fatal.
  perform ci36('memoria chegando + nunca lavado somam 65', v_pontos = 65,
               'veio ' || v_pontos);
  perform ci36('e a memoria e o caso mais forte da fila',
               v_pontos > 35, 'memoria deveria vencer o atrasado');

  -- ---------------------------------------------------------------------
  -- 2. MEXER NO PESO MUDA A CONTA — e este e o ponto de ser configuracao
  -- ---------------------------------------------------------------------
  update prioridade_regua set peso = 100 where org_id = v_org and criterio = 'nunca_lavado';
  select pontos into v_pontos from sureya_prioridade_calculada(v_org) where servico_id = s_novo;
  perform ci36('mudar o peso na tela muda a ordem da rota', v_pontos = 100,
               'veio ' || v_pontos || ' depois de por 100');

  -- DESLIGAR ZERA AQUELE CRITERIO, e so ele.
  update prioridade_regua set ativo = false where org_id = v_org and criterio = 'nunca_lavado';
  select pontos into v_pontos from sureya_prioridade_calculada(v_org) where servico_id = s_novo;
  perform ci36('desligar um criterio o tira da conta', v_pontos = 0, 'veio ' || v_pontos);

  select pontos into v_pontos from sureya_prioridade_calculada(v_org) where servico_id = s_velho;
  perform ci36('e nao mexe nos outros', v_pontos = 35, 'veio ' || v_pontos);

  -- Peso negativo REBAIXA de proposito: manda para o fim sem desligar.
  update prioridade_regua set ativo = true, peso = -50
    where org_id = v_org and criterio = 'nunca_lavado';
  select pontos into v_pontos from sureya_prioridade_calculada(v_org) where servico_id = s_novo;
  perform ci36('peso negativo empurra para o fim da fila', v_pontos = -50, 'veio ' || v_pontos);

  -- ---------------------------------------------------------------------
  -- 3. O ALCANCE E O QUE FAZ A TELA NAO SER UM FORMULARIO NO ESCURO
  -- ---------------------------------------------------------------------
  select alcanca into v_n from sureya_prioridade_alcance(v_org) where criterio = 'nunca_lavado';
  perform ci36('o alcance conta os que se encaixam', v_n = 2,
               'vieram ' || v_n || ' (esperado 2: o novo e o da memoria)');

  select alcanca into v_n from sureya_prioridade_alcance(v_org) where criterio = 'pedido_da_familia';
  -- Zero AQUI e a resposta certa, e e por isso que a tela mostra o numero:
  -- criterio que nao alcanca ninguem nao esta quebrado, so nao tem caso ainda.
  perform ci36('criterio sem caso nenhum alcanca zero, e isso e resposta', v_n = 0,
               'vieram ' || v_n);

  -- ---------------------------------------------------------------------
  -- 4. A PORTA DO ANONIMO (licao da 0129)
  -- ---------------------------------------------------------------------
  select count(*) into v_n
    from pg_proc p
   where p.proname in ('sureya_prioridade_calculada','sureya_prioridade_alcance')
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  perform ci36('anon nao executa as funcoes da regua', v_n = 0,
               v_n || ' funcao(oes) abertas para anon');

  raise exception 'ENSAIO DESFEITO >> tudo passou';
exception when others then
  if sqlerrm not like 'ENSAIO DESFEITO%' then raise; end if;
  raise notice '  ok  o ensaio foi desfeito, nada ficou no banco';
end $$;
