-- =====================================================================
-- 0100 — O CONTRATO É DO TÚMULO, E A LAVAGEM DESCONTA O MÊS
--
-- O QUE SE MEDIU EM PRODUÇÃO (23/08/2026)
-- ---------------------------------------------------------------------
-- Duas linhas da família ALCANTARA contam a história inteira:
--
--   02/08  credito  R$ 25,00  pagamento   (sem tumulo)
--   08/08  debito   R$ 40,00  lavagem     jazigo Alcantara
--
-- O combinado era R$ 25 POR MÊS. A lavagem debitou R$ 40 — que não veio
-- de lugar nenhum do contrato: `tumulos.valor_lavagem` está nulo, e a
-- cascata caiu no último degrau, `coalesce(orgs.valor_referencia, 40)`.
--
-- E há um erro pior, que ainda não apareceu porque a ALCANTARA não tem
-- plano. A cascata de `sureya_concluir_lavagem` faz:
--
--     if v_valor = 0 and plano_id is not null then
--       v_valor := coalesce(plano.valor_vigente, plano.valor_mensal)
--
-- Ou seja: pega o valor MENSAL e cobra como se fosse o de UMA lavagem.
-- Um contrato de R$ 25/mês com lavagem semanal debitaria R$ 25 quatro
-- vezes no mês — R$ 100. **Quatro vezes o combinado.**
--
-- AS DECISÕES
-- ---------------------------------------------------------------------
-- 1. O VALOR COMBINADO É MENSAL E É DO TÚMULO. Uma família pode ter três
--    jazigos com ritmos e preços diferentes (24 famílias têm mais de um,
--    e uma tem três). Guardar o valor na família obriga a inventar um
--    rateio na hora de cobrar; guardar no túmulo é o que a conversa com
--    a família já é: "esse aqui é vinte e cinco por mês".
--
-- 2. CADA LAVAGEM DESCONTA A FRAÇÃO DO MÊS. R$ 25/mês com lavagem
--    semanal = R$ 6,25 por lavagem. É a conta que a Sureya faz de
--    cabeça, e é a que o sistema passa a fazer.
--
-- 3. QUATRO SEMANAS NO MÊS, e não 4,28. O calendário diria 30/7; a
--    combinação com a família é "quatro vezes por mês". Usar o
--    calendário faria o extrato ter centavos que ninguém consegue
--    conferir contra o caderno — e conferir contra o caderno é a
--    operação inteira do piloto.
--
-- 4. `valor_lavagem` NÃO SAI. Ele continua sendo o preço de uma lavagem
--    AVULSA — família sem contrato paga por ida, e aí não há mês para
--    dividir. São dois preços diferentes porque são dois negócios
--    diferentes.
-- =====================================================================

alter table public.tumulos
  add column if not exists valor_mensal numeric(12,2);

comment on column public.tumulos.valor_mensal is
  'O combinado MENSAL deste tumulo, quando a familia tem contrato. Cada lavagem desconta valor_mensal / lavagens_no_mes. Para familia avulsa quem manda e valor_lavagem, que e o preco de UMA ida.';
comment on column public.tumulos.valor_lavagem is
  'O preco de UMA lavagem avulsa. Com contrato, quem manda e valor_mensal rateado pela periodicidade.';

-- ---------------------------------------------------------------------
-- QUANTAS LAVAGENS TEM UM MÊS
--
-- Números da conversa, não do calendário: quatro semanas, dois quinzes,
-- um mês. Para ciclos maiores que o mês o número é fracionário — uma
-- lavagem bimestral vale DOIS meses de contrato, e por isso custa o
-- dobro do mensal.
-- ---------------------------------------------------------------------
create or replace function public.sureya_lavagens_no_mes(p_periodicidade text)
returns numeric
language sql
immutable
as $$
  select case lower(coalesce(p_periodicidade, ''))
    when 'semanal'    then 4
    when 'quinzenal'  then 2
    when 'mensal'     then 1
    when 'bimestral'  then 0.5
    when 'trimestral' then 1.0/3
    when 'semestral'  then 1.0/6
    when 'anual'      then 1.0/12
    else null
  end;
$$;

comment on function public.sureya_lavagens_no_mes(text) is
  'Quantas lavagens um mes tem, na conta da casa: 4 semanais, 2 quinzenais, 1 mensal. Nao usa o calendario (30/7 = 4,28) de proposito — centavos que ninguem confere contra o caderno sao pior que arredondamento.';

-- ---------------------------------------------------------------------
-- QUANTO CUSTA ESTA LAVAGEM
--
-- A ordem importa e é esta:
--   1. contrato do túmulo (mensal rateado)  — o caso normal
--   2. preço avulso do túmulo               — família sem contrato
--   3. o legado do plano, JÁ RATEADO        — enquanto `planos` existir
--
-- O degrau 3 é o conserto do defeito: ele pegava o mensal e cobrava
-- inteiro. Agora divide pela cadência do próprio plano.
-- ---------------------------------------------------------------------
create or replace function public.sureya_valor_da_lavagem(p_tumulo uuid)
returns numeric
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_t       record;
  v_regime  text;
  v_por_mes numeric;
  v_plano   record;
begin
  select t.id, t.valor_mensal, t.valor_lavagem, t.periodicidade, t.familia_id
    into v_t from tumulos t where t.id = p_tumulo;
  if not found then return null; end if;

  select f.regime::text into v_regime from familias f where f.id = v_t.familia_id;

  -- 1 · CONTRATO: o mensal do túmulo, rateado pelo ritmo dele.
  if coalesce(v_t.valor_mensal, 0) > 0 and v_regime is distinct from 'avulso' then
    -- `::text` obrigatorio: `periodicidade` e o enum `sureya_cadencia`, e o
    -- Postgres nao converte enum para text sozinho na resolucao de funcao.
    -- Sem isto a lavagem estoura com `function does not exist` na hora de
    -- cobrar — e so na hora de cobrar.
    v_por_mes := sureya_lavagens_no_mes(v_t.periodicidade::text);
    -- Sem periodicidade não há por que dividir: o mensal vira o valor da
    -- ida, que é o comportamento antigo — e a conferência já cobra a
    -- periodicidade como pendência, então isto é ponte, não destino.
    if coalesce(v_por_mes, 0) <= 0 then return round(v_t.valor_mensal, 2); end if;
    return round(v_t.valor_mensal / v_por_mes, 2);
  end if;

  -- 2 · AVULSO: o preço de uma ida.
  if coalesce(v_t.valor_lavagem, 0) > 0 then
    return round(v_t.valor_lavagem, 2);
  end if;

  -- 3 · O LEGADO. `planos` guarda o mensal e a cadência; até aqui o
  -- valor saía INTEIRO por lavagem — quatro vezes o combinado num
  -- contrato semanal.
  select p.valor_vigente, p.valor_mensal, p.cadencia into v_plano
    from planos p where p.tumulo_id = p_tumulo and p.ativo
    order by p.data_valor_vigente desc nulls last limit 1;
  if found then
    v_por_mes := sureya_lavagens_no_mes(v_plano.cadencia::text);
    if coalesce(v_por_mes, 0) > 0 then
      return round(coalesce(nullif(v_plano.valor_vigente,0),
                            nullif(v_plano.valor_mensal,0), 0) / v_por_mes, 2);
    end if;
    return round(coalesce(nullif(v_plano.valor_vigente,0),
                          nullif(v_plano.valor_mensal,0), 0), 2);
  end if;

  return null;   -- quem chama decide o que fazer com "não sei"
end $$;

comment on function public.sureya_valor_da_lavagem(uuid) is
  'Quanto custa UMA lavagem deste tumulo: o mensal rateado pela periodicidade (contrato), o preco avulso, ou o plano legado JA RATEADO. Devolve nulo quando nao ha como saber — inventar valor e pior que perguntar.';

revoke execute on function public.sureya_valor_da_lavagem(uuid) from public, anon;
grant  execute on function public.sureya_valor_da_lavagem(uuid) to authenticated, service_role;

-- =====================================================================
-- A CASCATA DE `sureya_concluir_lavagem` PASSA A USAR O RATEIO
--
-- Substituição de texto no corpo da função, como na 0091. É feio, e é o
-- jeito certo aqui: reescrever as 260 linhas dela para mudar quatro
-- significaria reintroduzir, de cabeça, tudo que ela aprendeu desde a
-- 0066 — a convergência, a remuneração, os reparos, a fila de foto.
--
-- Falha ALTO se o texto esperado não estiver lá. Uma substituição que
-- não encontra o alvo e segue calada deixaria a função velha em pé, e
-- ninguém saberia: as lavagens continuariam cobrando o mês inteiro.
-- =====================================================================
do $$
declare
  v_src   text;
  v_novo  text;
  v_velho text := '  if v_valor = 0 and v_s.plano_id is not null then'      || chr(10) ||
                  '    select coalesce(nullif(p.valor_vigente,0), nullif(p.valor_mensal,0)) into v_valor' || chr(10) ||
                  '      from planos p where p.id = v_s.plano_id;'          || chr(10) ||
                  '  end if;'                                              || chr(10) ||
                  '  if coalesce(v_valor,0) = 0 and v_s.tumulo_id is not null then' || chr(10) ||
                  '    select nullif(t.valor_lavagem, 0) into v_valor from tumulos t where t.id = v_s.tumulo_id;' || chr(10) ||
                  '  end if;';
  v_troca text := '  -- O CONTRATO E DO TUMULO, e o combinado e MENSAL (0100).' || chr(10) ||
                  '  --' || chr(10) ||
                  '  -- Antes daqui a cascata pegava `plano.valor_mensal` e cobrava INTEIRO' || chr(10) ||
                  '  -- por lavagem: um contrato de R$ 25/mes com lavagem semanal debitava' || chr(10) ||
                  '  -- R$ 100 no mes. `sureya_valor_da_lavagem` divide pelo ritmo.' || chr(10) ||
                  '  if coalesce(v_valor,0) = 0 and v_s.tumulo_id is not null then' || chr(10) ||
                  '    v_valor := coalesce(sureya_valor_da_lavagem(v_s.tumulo_id), 0);' || chr(10) ||
                  '  end if;';
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'sureya_concluir_lavagem';

  if v_src is null then
    raise exception '0100: sureya_concluir_lavagem nao existe';
  end if;

  -- O corpo em producao usa CRLF; o dump pode vir com \r no fim de cada
  -- linha. Normaliza antes de procurar, senao a busca nunca casa.
  v_src := replace(v_src, chr(13), '');

  if position(v_velho in v_src) = 0 then
    -- Ja aplicado? Entao a chamada nova esta la e esta tudo certo.
    if position('sureya_valor_da_lavagem(v_s.tumulo_id)' in v_src) > 0 then
      raise notice '0100: cascata ja usa o rateio, nada a fazer';
      return;
    end if;
    raise exception '0100: nao achei a cascata de valor em sureya_concluir_lavagem — '
                    'ela mudou desde a 0091 e o remendo precisa ser refeito a mao';
  end if;

  v_novo := replace(v_src, v_velho, v_troca);
  execute v_novo;
  raise notice '0100: cascata de valor passa a ratear o mensal';
end $$;

-- =====================================================================
-- O SALDO É DO TÚMULO
--
-- ⚠ ISTO NÃO MUDA QUEM DEVE. O devedor continua sendo a FAMÍLIA (D-10:
-- "é a família, mas sempre tem um responsável financeiro"), e
-- `conta_corrente.familia_id` continua NOT NULL. O que muda é a
-- ATRIBUIÇÃO: cada lançamento passa a poder dizer de qual pedra ele é, e
-- a tela passa a somar por pedra.
--
-- Sem isso, uma família com três jazigos tem um saldo só, e não há como
-- responder "esse aqui está pago e aquele não" — que é a pergunta que
-- aparece quando a família quer cancelar UM dos três.
--
-- O QUE NÃO TEM TÚMULO fica num balde próprio, chamado pelo nome. Um
-- pagamento de R$ 100 da família não é de nenhum jazigo em particular
-- até alguém dizer que é — e distribuir por conta própria seria inventar
-- uma decisão de dinheiro.
-- =====================================================================
create or replace view public.sureya_saldo_por_tumulo
with (security_invoker = true) as
select
  cc.org_id,
  cc.familia_id,
  f.nome                                   as familia,
  cc.tumulo_id,
  t.identificacao                          as jazigo,
  q.codigo                                 as quadra,
  count(*)                                 as eventos,
  sum(case when cc.tipo::text = 'debito'  then cc.valor else 0 end) as debitos,
  sum(case when cc.tipo::text = 'credito' then cc.valor else 0 end) as creditos,
  sum(case when cc.tipo::text = 'credito' then cc.valor else -cc.valor end) as saldo,
  count(*) filter (where cc.origem::text = 'lavagem')              as lavagens,
  max(cc.data) filter (where cc.origem::text = 'lavagem')          as ultima_lavagem,
  count(*) filter (where cc.conferido_em is null)                  as a_conferir
from conta_corrente cc
join familias f on f.id = cc.familia_id
left join tumulos t on t.id = cc.tumulo_id
left join quadras q on q.id = t.quadra_id
group by cc.org_id, cc.familia_id, f.nome, cc.tumulo_id, t.identificacao, q.codigo;

comment on view public.sureya_saldo_por_tumulo is
  'O saldo somado por jazigo. NAO muda quem deve — o devedor continua sendo a familia (D-10). O que nao tem tumulo aparece com jazigo nulo: e o dinheiro que ninguem atribuiu ainda, e distribui-lo sozinho seria inventar decisao.';

revoke all    on public.sureya_saldo_por_tumulo from public, anon;
grant  select on public.sureya_saldo_por_tumulo to authenticated, service_role;
