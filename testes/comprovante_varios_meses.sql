-- ============================================================================
-- UM PAGAMENTO COBRE VARIOS MESES (0144)
--
-- O caso real: a Thais mandou R$ 240 e escreveu "referente julho-dezembro".
-- Seis competencias num pagamento so, num tumulo que nem contratado esta.
--
-- O QUE PODE DAR ERRADO AQUI E DINHEIRO, E TODO ERRO E SILENCIOSO:
--
--   creditar duas vezes   o saldo mente A FAVOR da familia — ninguem reclama,
--                         entao ninguem descobre.
--   perder centavo        a soma das linhas nao bate com o comprovante e a
--                         conferencia acusa diferenca para sempre.
--   mes repetido          "julho, julho, agosto" gastaria julho duas vezes e
--                         deixaria agosto sem nada — e o total ainda fecharia.
--   sobra escondida       o que nao coube some dentro do ultimo mes, e aquele
--                         mes passa a mentir no relatorio por competencia.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci44(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'VARIOS MESES FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

do $$
declare
  v_org uuid := '44444444-4444-4444-4444-444444444444';
  v_fam uuid := '44444444-0000-0000-0000-0000000000fa';
  v_cli uuid := '44444444-0000-0000-0000-0000000000c1';
  v_cem uuid := '44444444-0000-0000-0000-0000000000ce';
  v_qua uuid := '44444444-0000-0000-0000-0000000000dd';
  v_tum uuid := '44444444-0000-0000-0000-0000000000a1';
  k_thais uuid := '44444444-0000-0000-0000-0000000000b1';
  k_um    uuid := '44444444-0000-0000-0000-0000000000b2';
  k_terco uuid := '44444444-0000-0000-0000-0000000000b3';
  k_curto uuid := '44444444-0000-0000-0000-0000000000b4';
  v_n int; v_soma numeric; v_erro text; v_linhas int;
begin
  insert into orgs (id, nome) values (v_org, 'Teste 0144') on conflict (id) do nothing;
  insert into cemiterios (id, org_id, nome) values (v_cem, v_org, 'Cem') on conflict (id) do nothing;
  insert into quadras (id, org_id, cemiterio_id, codigo) values (v_qua, v_org, v_cem, 'Q1')
    on conflict (id) do nothing;
  insert into familias (id, org_id, nome) values (v_fam, v_org, 'Meglior') on conflict (id) do nothing;
  insert into clientes (id, org_id, nome, familia_id)
    values (v_cli, v_org, 'Thais', v_fam) on conflict (id) do nothing;
  insert into tumulos (id, org_id, quadra_id, familia_id, identificacao, codigo)
    values (v_tum, v_org, v_qua, v_fam, 'T-1', 'Q4-R8-007') on conflict (id) do nothing;

  -- =========================================================================
  -- O CASO DA THAIS: R$ 240, julho a dezembro, SEM divida lancada ainda.
  -- =========================================================================
  insert into comprovantes (id, org_id, cliente_id, valor_extraido, data_extraida, status)
  values (k_thais, v_org, v_cli, 240.00, date '2026-08-29', 'a_conferir')
  on conflict (id) do nothing;

  -- A linha pendente que o webhook cria quando a imagem chega.
  perform sureya_lancar(
    p_cliente := v_cli, p_tipo := 'credito', p_valor := 240.00, p_origem := 'pagamento',
    p_descricao := 'Comprovante de Pix (aguardando conferência)',
    p_data := date '2026-08-29', p_status := 'a_conferir',
    p_comprovante := k_thais, p_org := v_org);

  -- ENSAIO PRIMEIRO: a previa nao pode escrever nada.
  perform sureya_conciliar_comprovante_meses(
    k_thais,
    array[date '2026-07-01', date '2026-08-01', date '2026-09-01',
          date '2026-10-01', date '2026-11-01', date '2026-12-01'],
    v_org, null, null, null, true);

  select count(*) into v_n from conta_corrente
   where comprovante_id = k_thais and status_conc = 'confirmado';
  perform ci44('o ensaio nao cria credito nenhum', v_n = 0,
               'a previa escreveu no razao — abrir uma tela virou lancar dinheiro');

  select count(*) into v_n from comprovantes where id = k_thais and status = 'a_conferir';
  perform ci44('e nao mexe no estado do comprovante', v_n = 1,
               'o ensaio conferiu o comprovante sozinho');

  -- AGORA VALENDO.
  perform sureya_conciliar_comprovante_meses(
    k_thais,
    array[date '2026-07-01', date '2026-08-01', date '2026-09-01',
          date '2026-10-01', date '2026-11-01', date '2026-12-01'],
    v_org);

  select count(*), sum(valor) into v_n, v_soma from conta_corrente
   where comprovante_id = k_thais and status_conc = 'confirmado';
  perform ci44('R$ 240 viram seis linhas, uma por mes', v_n = 6,
               'vieram ' || v_n || ' linhas — o relatorio por competencia continuaria torto');
  perform ci44('e a soma bate com o comprovante, ao centavo', v_soma = 240.00,
               'a soma deu ' || v_soma || ' e o comprovante e 240,00');

  perform ci44('cada mes ficou com R$ 40',
               (select count(*) from conta_corrente
                 where comprovante_id = k_thais and status_conc = 'confirmado'
                   and valor = 40.00) = 6,
               'a divisao igual nao foi igual');

  perform ci44('julho recebeu credito, e nao so agosto',
               exists (select 1 from conta_corrente
                        where comprovante_id = k_thais and status_conc = 'confirmado'
                          and competencia = date '2026-07-01'),
               'o defeito de origem continua: tudo carimbado no mes do Pix');

  -- A LINHA PENDENTE TEM DE SAIR. Se ficar, o saldo conta R$ 240 duas vezes.
  perform ci44('a linha pendente do webhook sai',
               not exists (select 1 from conta_corrente
                            where comprovante_id = k_thais and status_conc = 'a_conferir'),
               'o mesmo dinheiro esta contado duas vezes no saldo da familia');

  perform ci44('e o comprovante fica confirmado',
               (select status from comprovantes where id = k_thais)::text = 'confirmado',
               'o dinheiro entrou e o comprovante continua na fila de conferir');

  -- JA CONFERIDO NAO SE CONFERE DE NOVO.
  begin
    perform sureya_conciliar_comprovante_meses(
      k_thais, array[date '2026-07-01'], v_org);
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform ci44('conferir de novo e recusado', v_erro like '%ja_conferido%',
               'deu para creditar o mesmo comprovante duas vezes');

  -- =========================================================================
  -- O MES QUE JA TEM DIVIDA MANDA NO VALOR — nao o rateio igual.
  -- =========================================================================
  insert into conta_corrente (org_id, familia_id, cliente_id, tumulo_id, tipo, origem,
                              competencia, valor, descricao, data)
  values (v_org, v_fam, v_cli, v_tum, 'debito', 'competencia',
          date '2026-05-01', 55.00, 'Contrato · 05/2026', date '2026-05-10')
  on conflict do nothing;

  insert into comprovantes (id, org_id, cliente_id, valor_extraido, data_extraida, status)
  values (k_um, v_org, v_cli, 95.00, date '2026-06-02', 'a_conferir')
  on conflict (id) do nothing;

  perform sureya_conciliar_comprovante_meses(
    k_um, array[date '2026-05-01', date '2026-06-01'], v_org);

  perform ci44('o mes com divida recebe o valor da divida',
               (select valor from conta_corrente
                 where comprovante_id = k_um and competencia = date '2026-05-01') = 55.00,
               'inventou um rateio por cima de uma divida que o sistema ja sabia');
  perform ci44('e o que sobra vai para o mes sem divida',
               (select valor from conta_corrente
                 where comprovante_id = k_um and competencia = date '2026-06-01') = 40.00,
               'a sobra nao chegou no mes seguinte');

  -- =========================================================================
  -- O CENTAVO DA DIVISAO NAO SE PERDE.
  -- =========================================================================
  insert into comprovantes (id, org_id, cliente_id, valor_extraido, data_extraida, status)
  values (k_terco, v_org, v_cli, 100.00, date '2026-03-02', 'a_conferir')
  on conflict (id) do nothing;

  perform sureya_conciliar_comprovante_meses(
    k_terco, array[date '2026-01-01', date '2026-02-01', date '2026-03-01'], v_org);

  select sum(valor) into v_soma from conta_corrente where comprovante_id = k_terco;
  perform ci44('R$ 100 em tres meses somam R$ 100, nao R$ 99,99', v_soma = 100.00,
               'sumiu centavo: a conferencia vai acusar diferenca para sempre');

  -- =========================================================================
  -- MES REPETIDO NAO GASTA O MES DUAS VEZES.
  -- =========================================================================
  insert into comprovantes (id, org_id, cliente_id, valor_extraido, data_extraida, status)
  values (k_curto, v_org, v_cli, 80.00, date '2026-04-02', 'a_conferir')
  on conflict (id) do nothing;

  perform sureya_conciliar_comprovante_meses(
    k_curto, array[date '2026-04-01', date '2026-04-15', date '2026-04-30'], v_org);

  select count(*), sum(valor) into v_linhas, v_soma
    from conta_corrente where comprovante_id = k_curto;
  perform ci44('tres datas do mesmo mes viram UMA competencia',
               v_linhas = 1 and v_soma = 80.00,
               'vieram ' || v_linhas || ' linhas: abril foi gasto mais de uma vez');

  -- =========================================================================
  -- SEM MES APONTADO E RECUSADO — a funcao existe para dizer os meses.
  -- =========================================================================
  begin
    perform sureya_conciliar_comprovante_meses(
      k_thais, '{}'::date[], v_org);
    v_erro := null;
  exception when others then v_erro := sqlerrm;
  end;
  perform ci44('sem dizer os meses e recusado', v_erro like '%sem_competencia%'
               or v_erro like '%ja_conferido%',
               'aceitou repartir um pagamento entre nenhum mes');

  -- =========================================================================
  -- QUEM PODE MOVER DINHEIRO — licao da 0129.
  -- =========================================================================
  perform ci44('anon nao concilia comprovante',
               not has_function_privilege('anon',
                 'sureya_conciliar_comprovante_meses(uuid,date[],uuid,numeric,date,uuid,boolean)',
                 'execute'),
               'uma funcao que credita dinheiro esta aberta no endereco publico da API');

  raise notice '  ---';
end $$;

drop function ci44(text, boolean, text);
