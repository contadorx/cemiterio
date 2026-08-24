-- ============================================================================
-- O PAGAMENTO TEM PARTES (0123)
--
-- O risco aqui e o mais caro de todos: mexer no que a familia deve. Um
-- desconto que nao abate, um juro que abate ao contrario, ou cinco linhas que
-- entram pela metade — qualquer um dos tres deixa a conta de alguem errada
-- sem ninguem perceber.
--
-- Roda dentro de `migrar-limpo.sh`.
-- ============================================================================
\set ON_ERROR_STOP on
set client_min_messages to notice;

create or replace function ci23(nome text, condicao boolean, porque text) returns void
language plpgsql as $$
begin
  if condicao is distinct from true then
    raise exception 'PAGAMENTO FALHOU — %: %', nome, porque;
  end if;
  raise notice '  ok  %', nome;
end $$;

insert into orgs (id, nome, dia_vencimento) values
  ('aaaaaaaa-0000-0000-0000-000000000023','CI Pagamento', 10)
on conflict do nothing;
insert into familias (id, org_id, nome) values
  ('ffffffff-0000-0000-0000-000000000023','aaaaaaaa-0000-0000-0000-000000000023','Familia CI Josi'),
  ('ffffffff-0000-0000-0000-000000000024','aaaaaaaa-0000-0000-0000-000000000023','Familia CI Atraso'),
  ('ffffffff-0000-0000-0000-000000000025','aaaaaaaa-0000-0000-0000-000000000023','Familia CI Perdao')
on conflict do nothing;

-- Tres competencias de 30 para cada uma, no mes corrente.
insert into conta_corrente (org_id, familia_id, tipo, origem, valor, descricao, data, competencia)
select 'aaaaaaaa-0000-0000-0000-000000000023', f, 'debito', 'competencia', 30.00,
       'CI contrato', date_trunc('month', current_date)::date + 9,
       date_trunc('month', current_date)::date
from unnest(array['ffffffff-0000-0000-0000-000000000023'::uuid,
                  'ffffffff-0000-0000-0000-000000000024'::uuid,
                  'ffffffff-0000-0000-0000-000000000025'::uuid]) f,
     generate_series(1,3);

-- ---------------------------------------------------------------------------
-- 1. O CASO DA JOSIANE: pagou 100 por 90, e os 10 tem nome
-- ---------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  r := sureya_registrar_pagamento(
    'ffffffff-0000-0000-0000-000000000023', 100.00, 0, 0, 0, 10.00,
    current_date, 'Pix de agosto', null, null, 'aaaaaaaa-0000-0000-0000-000000000023');
  perform ci23('recebido 100 com outros 10 cria duas linhas', (r->>'linhas')::int = 2, '');
  perform ci23('e abate exatamente 90 da divida', (r->>'abateu')::numeric = 90.00,
    'era isso que os R$ 10,00 da Josiane precisavam: um nome, sem mudar o saldo');
end $$;

select ci23('a divida da Josi zerou',
  (select coalesce(sum(case when tipo='credito' then valor else -valor end),0)
     from conta_corrente where familia_id='ffffffff-0000-0000-0000-000000000023') = 0.00,
  '90 de contrato, 100 recebidos, 10 de outros: fecha em zero e nao sobra credito sem explicacao');

select ci23('e os 10 ficaram como DEBITO de origem outros',
  (select count(*) from conta_corrente
    where familia_id='ffffffff-0000-0000-0000-000000000023'
      and origem='outros' and tipo='debito' and valor=10.00) = 1,
  'outros e uma cobranca que o dinheiro paga, nao um credito solto');

select ci23('o gatilho carimbou a competencia sozinho',
  (select count(*) from conta_corrente
    where familia_id='ffffffff-0000-0000-0000-000000000023' and competencia is null) = 0,
  'quem carimba e trg_cc_competencia, e nao a funcao nova — uma regra, um lugar');

-- ---------------------------------------------------------------------------
-- 2. ATRASO: juros e multa sao COBRANCA, e o dinheiro cobre as duas
-- ---------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  r := sureya_registrar_pagamento(
    'ffffffff-0000-0000-0000-000000000024', 98.00, 0, 5.00, 3.00, 0,
    current_date, 'Pagou atrasado', null, null, 'aaaaaaaa-0000-0000-0000-000000000023');
  perform ci23('recebido 98 com juros 5 e multa 3 cria tres linhas', (r->>'linhas')::int = 3, '');
  perform ci23('e abate 90 — o contrato, e nao os 98',
    (r->>'abateu')::numeric = 90.00,
    'juros e multa sao receita nova, nao abatimento de divida antiga');
end $$;

select ci23('a familia que atrasou tambem fica quite',
  (select coalesce(sum(case when tipo='credito' then valor else -valor end),0)
     from conta_corrente where familia_id='ffffffff-0000-0000-0000-000000000024') = 0.00, '');

-- ---------------------------------------------------------------------------
-- 3. PERDAO: o desconto abate sem dinheiro nenhum
-- ---------------------------------------------------------------------------
do $$
declare r jsonb;
begin
  r := sureya_registrar_pagamento(
    'ffffffff-0000-0000-0000-000000000025', 80.00, 10.00, 0, 0, 0,
    current_date, 'Perdoei 10', null, null, 'aaaaaaaa-0000-0000-0000-000000000023');
  perform ci23('recebido 80 com desconto 10 abate os 90 inteiros',
    (r->>'abateu')::numeric = 90.00,
    'sem isto, a familia continuaria devendo o que ja foi perdoado');
end $$;

select ci23('o desconto e CREDITO, e nao dinheiro que entrou',
  (select count(*) from conta_corrente
    where familia_id='ffffffff-0000-0000-0000-000000000025'
      and origem='desconto' and tipo='credito' and valor=10.00) = 1, '');

select ci23('e o recebido de verdade foi 80, nao 90',
  (select sum(valor) from conta_corrente
    where familia_id='ffffffff-0000-0000-0000-000000000025' and origem='pagamento') = 80.00,
  'confundir os dois faria o caixa do mes mentir em 10 reais');

-- ---------------------------------------------------------------------------
-- 4. PERDAO TOTAL: receber zero e legitimo quando houve desconto
-- ---------------------------------------------------------------------------
do $$
declare r jsonb; v_deu boolean := false;
begin
  r := sureya_registrar_pagamento(
    'ffffffff-0000-0000-0000-000000000025', 0, 5.00, 0, 0, 0,
    current_date, 'Perdao', null, null, 'aaaaaaaa-0000-0000-0000-000000000023');
  perform ci23('receber zero com desconto e um lancamento valido', (r->>'linhas')::int = 1, '');

  begin
    perform sureya_registrar_pagamento(
      'ffffffff-0000-0000-0000-000000000025', 0, 0, 0, 0, 0,
      current_date, null, null, null, 'aaaaaaaa-0000-0000-0000-000000000023');
  exception when others then v_deu := true;
  end;
  perform ci23('mas zero em tudo e recusado', v_deu,
    'nao entrou dinheiro e nao perdoei nada nao e pagamento: e clique errado');
end $$;

-- ---------------------------------------------------------------------------
-- 5. AS TRAVAS
-- ---------------------------------------------------------------------------
do $$
declare v_deu boolean := false; v_antes int; v_depois int;
begin
  select count(*) into v_antes from conta_corrente
   where familia_id='ffffffff-0000-0000-0000-000000000023';
  begin
    -- juros + multa + outros (60) maiores que o recebido (50)
    perform sureya_registrar_pagamento(
      'ffffffff-0000-0000-0000-000000000023', 50.00, 0, 20.00, 20.00, 20.00,
      current_date, null, null, null, 'aaaaaaaa-0000-0000-0000-000000000023');
  exception when others then v_deu := true;
  end;
  select count(*) into v_depois from conta_corrente
   where familia_id='ffffffff-0000-0000-0000-000000000023';
  perform ci23('as partes nao podem passar do valor recebido', v_deu,
    'a familia sairia devendo MAIS depois de pagar — sempre erro de digitacao');
  perform ci23('e a recusa nao deixou meia linha para tras', v_antes = v_depois,
    'cinco escritas soltas podem falhar no meio; aqui e tudo ou nada');
end $$;

do $$
declare v_deu boolean := false;
begin
  begin
    perform sureya_registrar_pagamento(
      'ffffffff-0000-0000-0000-000000000023', 50.00, -10.00, 0, 0, 0,
      current_date, null, null, null, 'aaaaaaaa-0000-0000-0000-000000000023');
  exception when others then v_deu := true;
  end;
  perform ci23('parte negativa e recusada', v_deu,
    'o lado do dinheiro mora no tipo; um desconto de -10 seria cobranca silenciosa');
end $$;

do $$
declare v_deu boolean := false;
begin
  begin
    perform sureya_registrar_pagamento(
      '00000000-0000-0000-0000-000000000000', 50.00, 0, 0, 0, 0,
      current_date, null, null, null, 'aaaaaaaa-0000-0000-0000-000000000023');
  exception when others then v_deu := true;
  end;
  perform ci23('familia de outra org nao recebe lancamento', v_deu, '');
end $$;

-- ---------------------------------------------------------------------------
-- 6. O PAINEL CONTA JUROS E MULTA COMO RECEITA, E TIRA O DESCONTO
--
-- Sem esta parte, a receita do mes ficaria MENOR do que a verdade toda vez que
-- ela cobrasse juros — e maior toda vez que perdoasse. Duas telas com contas
-- diferentes sobre os mesmos fatos e o defeito que este projeto mais repete.
-- ---------------------------------------------------------------------------
do $$
declare p jsonb; v_r jsonb;
begin
  p := sureya_painel_do_mes(current_date, 'aaaaaaaa-0000-0000-0000-000000000023');
  v_r := p->'receita';

  perform ci23('o painel enxerga os juros', (v_r->>'juros')::numeric = 5.00, '');
  perform ci23('e a multa', (v_r->>'multa')::numeric = 3.00, '');
  perform ci23('e os outros', (v_r->>'outros')::numeric = 10.00, '');
  perform ci23('e os descontos', (v_r->>'descontos')::numeric = 15.00, '');

  -- 270 de contrato + 5 juros + 3 multa + 10 outros - 15 desconto = 273
  perform ci23('a receita do mes soma tudo e desconta o perdao',
    (v_r->>'total')::numeric = 273.00,
    '270 de contrato + 5 de juros + 3 de multa + 10 de outros - 15 de desconto');

  perform ci23('e o resultado usa a MESMA receita do bloco de cima',
    (p->'resultado'->>'receita')::numeric = (v_r->>'total')::numeric,
    'dois numeros para a mesma pergunta e o defeito de forma que ja mordeu '
    || 'a agenda (0092), o painel (0105), a lista (0106) e a previa (0115)');
end $$;

drop function ci23(text, boolean, text);
