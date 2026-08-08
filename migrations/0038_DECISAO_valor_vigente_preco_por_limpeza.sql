-- ============================================================================
-- SUREYA — 0038 · A DECISÃO DA 0027, TOMADA
--
-- REGRA: `planos.valor_vigente` é o PREÇO DE UMA LIMPEZA.
-- Quem decide quanto a família paga por mês é a PERIODICIDADE, não uma
-- multiplicação escondida no momento de salvar. (Opção B da migration 0027.)
--
-- O CÓDIGO JÁ FOI AJUSTADO JUNTO — não rode isto sozinho:
--   · src/lib/vencimento.ts        precoPorLimpeza() + valorMensalEfetivo()
--   · src/app/api/planos/route.ts  grava o valor digitado nas DUAS colunas
--   · src/app/api/planos/[id]/route.ts  parou de recalcular ciclo no Salvar
--   · src/lib/jazigo.ts            idem, no cadastro pela ficha
--   · telas de Carteira/Jazigos    rótulo virou "Valor por limpeza"
--
-- O QUE ISSO CONSERTA EM DINHEIRO
--   · plano quinzenal (mensal, 2 limpezas) de R$ 40: debitava R$ 80/mês;
--   · plano anual criado pela tela nova (R$ 40 x 12 = 480): CADA lavagem
--     nascia valendo R$ 480;
--   · reajuste aplicado sumia semanas depois, porque o RPC escreve só
--     valor_vigente e o Salvar da tela recalculava a partir do valor_mensal
--     antigo.
--
-- ============================================================================
-- PARTE 1 — CONFIRA ANTES (só SELECT; nada muda)
-- ============================================================================

-- 1.1 — Quantos planos serão tocados pela Parte 2, e quanto muda em cada um.
--       LEIA LINHA POR LINHA: é o preço da família mudando. Se alguma linha
--       tiver "valor_novo" que você não reconhece como o preço de UMA limpeza,
--       PARE e corrija esse plano à mão antes de seguir.
select p.id,
       c.nome                                   as familia,
       t.identificacao                          as jazigo,
       p.cadencia,
       p.lavagens_por_ciclo,
       p.valor_vigente                          as valor_hoje,
       p.valor_mensal                           as mensal_hoje,
       p.valor_mensal                           as valor_novo,
       round(p.valor_vigente - p.valor_mensal, 2) as diferenca
  from planos p
  left join clientes c on c.id = p.cliente_id
  left join tumulos  t on t.id = p.tumulo_id
 where p.valor_mensal is not null
   and p.cadencia <> 'mensal'
   and round(p.valor_vigente, 2) = round(p.valor_mensal * case p.cadencia
         when 'bimestral' then 2 when 'trimestral' then 3
         when 'semestral' then 6 when 'anual' then 12 else 1 end, 2)
 order by diferenca desc;

-- 1.2 — Planos SEM valor_mensal (vieram da importação/seed). A Parte 2 copia o
--       valor_vigente para valor_mensal, sem mudar o que é cobrado. Se aqui
--       aparecer um valor que é claramente de um CICLO (ex.: R$ 480 num plano
--       anual), esse plano precisa ser corrigido à mão: o número certo é o de
--       uma limpeza.
select p.id, c.nome as familia, t.identificacao as jazigo,
       p.cadencia, p.lavagens_por_ciclo, p.valor_vigente, p.ativo
  from planos p
  left join clientes c on c.id = p.cliente_id
  left join tumulos  t on t.id = p.tumulo_id
 where p.valor_mensal is null
 order by p.valor_vigente desc;

-- 1.3 — O que já foi COBRADO fica como está. Esta consulta é só para você ver
--       o histórico e saber que ele não muda: servicos.valor é o valor
--       congelado de cada lavagem e a Parte 2 não toca nele.
select date_trunc('month', s.data_prevista)::date as mes,
       count(*) as lavagens, min(s.valor) as menor,
       round(avg(s.valor), 2) as media, max(s.valor) as maior
  from servicos s
 where s.data_prevista >= current_date - interval '12 months'
 group by 1 order by 1 desc;

-- ============================================================================
-- PARTE 2 — A CORREÇÃO (dois UPDATEs)
--
-- ⚠ O QUE SE PERDE: os dois UPDATEs sobrescrevem `valor_vigente` e
--   `valor_mensal` dos planos listados na Parte 1. NÃO há histórico dessas
--   colunas em lugar nenhum — desfazer só com backup.
--
--   COMO CONFERIR ANTES (rode e guarde o resultado, é o seu backup):
--     select id, cadencia, valor_vigente, valor_mensal from planos order by id;
--     -- salve num arquivo; se precisar voltar, é um update id a id.
--
--   O QUE NÃO SE PERDE: nada do que já foi cobrado. `servicos.valor` e
--   `movimentos.valor` guardam o valor de cada lavagem no dia em que ela
--   aconteceu, e não são tocados aqui.
--
-- Rode as duas linhas JUNTAS, nesta ordem, num mesmo Run.
-- ============================================================================

begin;

-- 2.1 — Desfaz a multiplicação por cadência nos planos criados pela tela nova.
--       O filtro é a assinatura exata do bug (valor_vigente = mensal x meses),
--       então plano com preço legítimo diferente do mensal não é tocado.
update planos
   set valor_vigente = valor_mensal
 where valor_mensal is not null
   and cadencia <> 'mensal'
   and round(valor_vigente, 2) = round(valor_mensal * case cadencia
         when 'bimestral' then 2 when 'trimestral' then 3
         when 'semestral' then 6 when 'anual' then 12 else 1 end, 2);

-- 2.2 — Completa o valor_mensal dos planos antigos com o próprio valor gravado.
--       A partir daqui as duas colunas guardam o mesmo número (o preço de uma
--       limpeza) e o reajuste para de ser desfeito no Salvar seguinte.
update planos
   set valor_mensal = valor_vigente
 where valor_mensal is null;

commit;

-- ============================================================================
-- PARTE 3 — CONFIRA DEPOIS
-- ============================================================================

-- 3.1 — Tem que voltar VAZIA: nenhuma coluna discordando da outra.
select id, cadencia, valor_vigente, valor_mensal
  from planos
 where valor_mensal is null
    or round(valor_vigente, 2) <> round(valor_mensal, 2);

-- 3.2 — Retrato final da carteira, agora com o "por mês" calculado direito:
--       preço da limpeza x limpezas do ciclo / meses do ciclo.
select p.cadencia,
       count(*) as planos,
       round(avg(p.valor_vigente), 2) as preco_medio_por_limpeza,
       round(sum(
         p.valor_vigente * greatest(coalesce(p.lavagens_por_ciclo, 1), 1)
         / nullif(case p.cadencia
             when 'mensal' then 1 when 'bimestral' then 2 when 'trimestral' then 3
             when 'semestral' then 6 when 'anual' then 12 else 0 end, 0)
       ), 2) as rende_por_mes
  from planos p
 where p.ativo
 group by 1
 order by rende_por_mes desc nulls last;

-- ============================================================================
-- PARTE 4 — O REAJUSTE, AGORA QUE A REGRA EXISTE
--
-- `sureya_aplicar_reajuste` (0006/0016) grava só `valor_vigente` e
-- `data_valor_vigente`. Com a regra "preço por limpeza", valor_mensal precisa
-- acompanhar — senão as duas colunas voltam a divergir no primeiro reajuste e
-- o problema renasce.
--
-- É a função de 0006 palavra por palavra, com UMA linha a mais:
-- `valor_mensal = p_novo_valor`. Nada mais muda — mesma assinatura, mesma
-- trilha em `reajustes`, mesmas permissões de 0016.
-- ============================================================================

create or replace function sureya_aplicar_reajuste(
  p_plano      uuid,
  p_novo_valor numeric,
  p_motivo     text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_org uuid;
  v_ant numeric;
  v_cli uuid;
begin
  select org_id, valor_vigente, cliente_id
    into v_org, v_ant, v_cli
    from planos
   where id = p_plano and org_id = current_org_id();

  if v_org is null then
    raise exception 'plano % nao encontrado nesta org', p_plano;
  end if;

  insert into reajustes (org_id, plano_id, cliente_id, valor_anterior, valor_novo, motivo, aprovado_por)
  values (v_org, p_plano, v_cli, v_ant, p_novo_valor, coalesce(p_motivo, 'Reajuste'), auth.uid());

  update planos
     set valor_vigente      = p_novo_valor,
         -- A LINHA NOVA: as duas colunas guardam o preço de UMA limpeza.
         -- Sem ela, o próximo Salvar na tela de Planos regravava valor_vigente
         -- a partir do valor_mensal antigo e o reajuste evaporava.
         valor_mensal       = p_novo_valor,
         data_valor_vigente = current_date
   where id = p_plano;
end $$;

-- permissões idênticas às de 0016 (a função é recriada, então reaplique)
revoke execute on function sureya_aplicar_reajuste(uuid, numeric, text) from public, anon;
grant  execute on function sureya_aplicar_reajuste(uuid, numeric, text) to authenticated;
