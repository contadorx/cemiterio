-- 0123 — O PAGAMENTO TEM PARTES: DESCONTO, JUROS, MULTA E OUTROS
--
-- O PEDIDO
--   "Pensando nesses 10 reais a mais crie na ficha de pagamentos o campo de
--    desconto, juros e multa e outros"
--
-- DE ONDE VEIO
--
-- A Josiane pagou R$ 100,00 por tres competencias de R$ 30,00. Os R$ 10,00 que
-- sobraram viraram saldo credor — o numero fica certo, mas a ficha nao conta o
-- que aconteceu. Daqui a tres meses ninguem lembra se foi arredondamento,
-- gorjeta, uma flor avulsa ou erro de digitacao.
--
-- E o caso inverso e pior: quando a familia atrasa e a Sureya cobra juros, ou
-- quando ela perdoa parte da divida, hoje nao ha onde escrever isso. Ou o
-- valor entra inteiro e a divida some sem explicacao, ou entra pela metade e a
-- familia fica devendo o que ja foi perdoado.
--
-- O DESENHO: CADA PARTE E UMA LINHA, COM SEU PROPRIO LADO
--
--   valor recebido  -> CREDITO, origem `pagamento`   (o dinheiro que caiu)
--   desconto        -> CREDITO, origem `desconto`    (abate sem dinheiro)
--   juros           -> DEBITO,  origem `juros`       (cobranca que o dinheiro paga)
--   multa           -> DEBITO,  origem `multa`
--   outros          -> DEBITO,  origem `outros`
--
-- Ler assim resolve os tres casos de uma vez:
--
--   arredondamento  recebeu 100, outros 10   -> saldo anda +90, e os 90 sao as
--                                               tres competencias. Fecha em zero.
--   atraso          recebeu 65, juros 5      -> saldo anda +60, que e a divida.
--                                               Os 5 aparecem como receita.
--   perdao          recebeu 50, desconto 10  -> saldo anda +60, a divida some
--                                               inteira, e a receita do mes cai
--                                               10 — que e a verdade.
--
-- POR QUE UMA FUNCAO E NAO CINCO INSERTS NA ROTA
--
-- Cinco escritas separadas podem falhar no meio: o credito entra, o debito de
-- juros nao, e a familia fica com saldo a favor que nunca existiu. Aqui as
-- cinco linhas nascem na mesma transacao ou nenhuma nasce.
--
-- A COMPETENCIA NAO E ESCRITA AQUI. Quem carimba e o gatilho
-- `trg_cc_competencia`, que ja existia. Escrever de novo seria a segunda
-- versao da mesma regra — o defeito que este projeto mais repete.

-- ============================================================================
-- 1. AS QUATRO ORIGENS NOVAS
-- ============================================================================
--
-- `add value` fora de transacao de proposito: o Postgres nao deixa usar um
-- valor de enum na mesma transacao em que ele nasce.
alter type sureya_origem_lancamento add value if not exists 'desconto';
alter type sureya_origem_lancamento add value if not exists 'juros';
alter type sureya_origem_lancamento add value if not exists 'multa';
alter type sureya_origem_lancamento add value if not exists 'outros';

-- ============================================================================
-- 2. A PORTA DO PAGAMENTO COMPOSTO
-- ============================================================================

create or replace function sureya_registrar_pagamento(
  p_familia     uuid,
  p_recebido    numeric,
  p_desconto    numeric default 0,
  p_juros       numeric default 0,
  p_multa       numeric default 0,
  p_outros      numeric default 0,
  p_data        date    default null,
  p_descricao   text    default null,
  p_comprovante uuid    default null,
  p_tumulo      uuid    default null,
  p_org         uuid    default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org   uuid := coalesce(p_org, current_org_id());
  v_data  date := coalesce(p_data, current_date);
  v_rec   numeric := round(coalesce(p_recebido, 0), 2);
  v_desc  numeric := round(coalesce(p_desconto, 0), 2);
  v_jur   numeric := round(coalesce(p_juros,    0), 2);
  v_mul   numeric := round(coalesce(p_multa,    0), 2);
  v_out   numeric := round(coalesce(p_outros,   0), 2);
  v_texto text;
  v_n     int := 0;
begin
  if v_org is null then
    raise exception 'sureya_registrar_pagamento: sem org';
  end if;
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;
  if not exists (select 1 from familias where id = p_familia and org_id = v_org) then
    raise exception 'familia_nao_encontrada' using errcode = '42704';
  end if;

  -- NENHUMA PARTE PODE SER NEGATIVA. O lado do dinheiro mora no `tipo`, nunca
  -- no sinal do numero — um desconto de -10 viraria uma cobranca silenciosa.
  if v_rec < 0 or v_desc < 0 or v_jur < 0 or v_mul < 0 or v_out < 0 then
    raise exception 'sureya_registrar_pagamento: nenhuma parte pode ser negativa';
  end if;

  -- RECEBER ZERO E LEGITIMO — mas so quando houve perdao. "Nao entrou dinheiro
  -- e nao perdoei nada" nao e um pagamento, e um clique errado.
  if v_rec = 0 and v_desc = 0 then
    raise exception 'sureya_registrar_pagamento: informe o valor recebido ou um desconto';
  end if;

  -- AS PARTES NAO PODEM ENGOLIR O RECEBIDO. Juros + multa + outros maiores que
  -- o que entrou deixariam a familia devendo MAIS depois de pagar — que e
  -- sempre erro de digitacao, nunca intencao.
  if v_jur + v_mul + v_out > v_rec + 0.005 then
    raise exception
      'sureya_registrar_pagamento: juros + multa + outros (%) passam do valor recebido (%)',
      v_jur + v_mul + v_out, v_rec;
  end if;

  v_texto := nullif(btrim(coalesce(p_descricao, '')), '');

  if v_rec > 0 then
    insert into conta_corrente (org_id, familia_id, tumulo_id, tipo, origem, valor,
                                descricao, comprovante_id, data)
    values (v_org, p_familia, p_tumulo, 'credito', 'pagamento', v_rec,
            coalesce(v_texto, 'Pagamento recebido'), p_comprovante, v_data);
    v_n := v_n + 1;
  end if;

  if v_desc > 0 then
    insert into conta_corrente (org_id, familia_id, tumulo_id, tipo, origem, valor, descricao, data)
    values (v_org, p_familia, p_tumulo, 'credito', 'desconto', v_desc,
            coalesce(v_texto || ' · desconto', 'Desconto concedido'), v_data);
    v_n := v_n + 1;
  end if;

  if v_jur > 0 then
    insert into conta_corrente (org_id, familia_id, tumulo_id, tipo, origem, valor, descricao, data)
    values (v_org, p_familia, p_tumulo, 'debito', 'juros', v_jur,
            coalesce(v_texto || ' · juros', 'Juros por atraso'), v_data);
    v_n := v_n + 1;
  end if;

  if v_mul > 0 then
    insert into conta_corrente (org_id, familia_id, tumulo_id, tipo, origem, valor, descricao, data)
    values (v_org, p_familia, p_tumulo, 'debito', 'multa', v_mul,
            coalesce(v_texto || ' · multa', 'Multa por atraso'), v_data);
    v_n := v_n + 1;
  end if;

  if v_out > 0 then
    insert into conta_corrente (org_id, familia_id, tumulo_id, tipo, origem, valor, descricao, data)
    values (v_org, p_familia, p_tumulo, 'debito', 'outros', v_out,
            coalesce(v_texto || ' · outros', 'Outros'), v_data);
    v_n := v_n + 1;
  end if;

  return jsonb_build_object(
    'linhas',   v_n,
    'recebido', v_rec,
    'desconto', v_desc,
    'juros',    v_jur,
    'multa',    v_mul,
    'outros',   v_out,
    -- QUANTO A DIVIDA ANDOU. E o unico numero que a tela precisa repetir de
    -- volta para a Sureya conferir se entendeu o que ia fazer.
    'abateu',   round(v_rec + v_desc - v_jur - v_mul - v_out, 2)
  );
end;
$$;

revoke all on function sureya_registrar_pagamento(uuid, numeric, numeric, numeric, numeric, numeric, date, text, uuid, uuid, uuid) from public;
grant execute on function sureya_registrar_pagamento(uuid, numeric, numeric, numeric, numeric, numeric, date, text, uuid, uuid, uuid)
  to authenticated, service_role;

-- ============================================================================
-- 3. O PAINEL PRECISA SABER QUE ISSO EXISTE
-- ============================================================================
--
-- Juros e multa sao RECEITA e nao apareciam em lugar nenhum. Desconto e
-- receita que a Sureya abriu mao — some do total, e nao vira "recebi menos".
--
-- Sem esta parte, a partir de hoje o painel mostraria uma receita menor do que
-- a verdade toda vez que ela cobrasse juros. Duas telas com contas diferentes
-- sobre os mesmos fatos e o defeito que ja mordeu a agenda (0092), o painel
-- (0105), a lista de familias (0106) e a previa (0115).
--
-- PATCH POR SUBSTITUICAO DE TEXTO, e nao um `create or replace` de trezentas
-- linhas: menos superficie para divergir da 0120. Se o alvo nao existir mais,
-- isto FALHA em vez de nao fazer nada em silencio.
do $$
declare
  v_src  text := pg_get_functiondef('sureya_painel_do_mes(date, uuid)'::regprocedure);
  v_novo text;

  -- Aspas-cifrao com etiqueta propria: o alvo fica IDENTICO ao que esta na
  -- 0120, linha por linha, sem escape nenhum no meio. Um alvo escapado e um
  -- alvo que ninguem consegue conferir de olho.
  v_alvo1 text := $q$      coalesce(sum(valor) filter (where origem = 'abertura'    and tipo = 'debito'), 0) as abertura,$q$;
  v_troca1 text := $q$      coalesce(sum(valor) filter (where origem = 'abertura'    and tipo = 'debito'), 0) as abertura,
      coalesce(sum(valor) filter (where origem = 'juros'       and tipo = 'debito'), 0) as juros,
      coalesce(sum(valor) filter (where origem = 'multa'       and tipo = 'debito'), 0) as multa,
      coalesce(sum(valor) filter (where origem = 'outros'      and tipo = 'debito'), 0) as outros,
      coalesce(sum(valor) filter (where origem = 'desconto'    and tipo = 'credito'), 0) as descontos,$q$;

  v_alvo2 text := $q$      'contratos', r.contratos, 'avulsos', r.avulsos, 'abertura', r.abertura,
      'total', r.contratos + r.avulsos + r.abertura, 'cobrancas', r.cobrancas),$q$;
  v_troca2 text := $q$      'contratos', r.contratos, 'avulsos', r.avulsos, 'abertura', r.abertura,
      'juros', r.juros, 'multa', r.multa, 'outros', r.outros, 'descontos', r.descontos,
      'total', r.contratos + r.avulsos + r.abertura + r.juros + r.multa + r.outros - r.descontos,
      'cobrancas', r.cobrancas),$q$;

  v_alvo3  text := $q$      'receita', r.contratos + r.avulsos + r.abertura,$q$;
  v_troca3 text := $q$      'receita', r.contratos + r.avulsos + r.abertura + r.juros + r.multa + r.outros - r.descontos,$q$;
begin
  -- FALHAR EM VEZ DE NAO FAZER NADA. Um patch por texto que nao acha o alvo e
  -- pior que um erro: passa verde e deixa o painel contando errado para sempre.
  if position(v_alvo1 in v_src) = 0 then
    raise exception '0123: nao achei a linha da abertura em sureya_painel_do_mes';
  end if;
  if position(v_alvo2 in v_src) = 0 then
    raise exception '0123: nao achei o bloco de receita em sureya_painel_do_mes';
  end if;
  if position(v_alvo3 in v_src) = 0 then
    raise exception '0123: nao achei a receita do resultado em sureya_painel_do_mes';
  end if;

  v_novo := replace(v_src,  v_alvo1, v_troca1);
  v_novo := replace(v_novo, v_alvo2, v_troca2);
  v_novo := replace(v_novo, v_alvo3, v_troca3);
  execute v_novo;
end $$;
