-- ============================================================================
-- SUREYA — 0056 · O PONTEIRO INICIAL DA AGENDA (rodar DEPOIS da 0052)
--
-- POR QUE ESTE ARQUIVO EXISTE
-- ---------------------------------------------------------------------------
-- A 0052 traz o `proximo_servico` que já existia em `planos`. Só que o volume
-- do banco mostra que `planos` tem **1 linha** — a tabela é legado morto. Os
-- outros jazigos contratados vão ficar com `proximo_servico = NULL`.
--
-- E o gerador trata NULL assim (src/lib/agenda.ts:226):
--
--     let prox: string = p.proximo_servico || isoHoje();
--
-- Ou seja: **todo jazigo sem ponteiro é tratado como devido HOJE**. Na primeira
-- rodada depois da 0052, o gerador criaria a limpeza de hoje e, como o laço
-- avança de uma cadência por vez dentro do horizonte de 30 dias, criaria também
-- a seguinte. Com 68 jazigos isso é uma enxurrada de serviços datados no mesmo
-- dia, jogada de uma vez na rota de quem lava.
--
-- Nada se perde — o alocador respeita a capacidade diária e espalha. Mas a
-- operação recebe uma fila que não corresponde ao combinado com as famílias, e
-- o Build 7 é explícito: expandir por bloco, nunca a carteira inteira de uma vez.
--
-- Este arquivo existe para o ponteiro nascer de uma decisão, não de um NULL.
--
-- COMO USAR
-- ---------------------------------------------------------------------------
-- Rode a PARTE 1 primeiro. Ela só lê. Olhe o número.
-- Só então escolha entre a PARTE 2 e a PARTE 3 — as duas estão comentadas de
-- propósito. Descomente a que você decidir usar.
-- ============================================================================


-- ############################################################################
-- PARTE 1 — O QUE ACONTECE SE EU NÃO FIZER NADA (só leitura)
-- ############################################################################
select
  count(*) filter (where contratado)                                as contratados,
  count(*) filter (where contratado and proximo_servico is null)    as sem_ponteiro_viram_hoje,
  count(*) filter (where contratado and proximo_servico is not null) as com_ponteiro,
  count(*) filter (where contratado and periodicidade is null)      as contratado_sem_periodicidade,
  (select count(*) from servicos where status = 'pendente')         as servicos_pendentes_hoje
from tumulos;

-- Quem são, e quando cada um foi lavado pela última vez.
-- `ultima_lavagem` nula = nunca teve serviço executado: é jazigo novo na
-- esteira, e a data inicial dele é decisão da responsável, não do sistema.
select t.id,
       t.identificacao,
       t.periodicidade,
       t.proximo_servico,
       max(s.data_executada) as ultima_lavagem
  from tumulos t
  left join servicos s
         on s.tumulo_id = t.id
        and s.status = 'executado'
 where t.contratado
 group by t.id, t.identificacao, t.periodicidade, t.proximo_servico
 order by ultima_lavagem nulls first, t.identificacao;


-- ############################################################################
-- PARTE 2 — PONTEIRO DERIVADO DO HISTÓRICO  (recomendado)
--
-- Para quem já foi lavado: próxima = última lavagem + a cadência combinada.
-- É o que respeita o acordo com a família. Se a conta cair no passado (jazigo
-- atrasado), `greatest(..., current_date)` traz para hoje — atrasado entra na
-- fila, mas não gera retroativo.
--
-- DESCOMENTE PARA APLICAR.
-- ############################################################################
-- begin;
--
-- update tumulos t
--    set proximo_servico = greatest(
--          u.ultima + (case t.periodicidade
--                        when 'semanal'    then  7
--                        when 'quinzenal'  then 15
--                        when 'mensal'     then 30
--                        when 'bimestral'  then 60
--                        when 'trimestral' then 90
--                        when 'semestral'  then 180
--                        when 'anual'      then 365
--                      end),
--          current_date)
--   from (
--         select tumulo_id, max(data_executada) as ultima
--           from servicos
--          where status = 'executado' and data_executada is not null
--          group by tumulo_id
--        ) u
--  where u.tumulo_id = t.id
--    and t.contratado
--    and t.periodicidade is not null
--    and t.proximo_servico is null;
--
-- commit;


-- ############################################################################
-- PARTE 3 — QUEM NUNCA FOI LAVADO: ESCALONAR EM VEZ DE EMPILHAR
--
-- Sem histórico não há data "correta" — mas colocar todo mundo em hoje é a
-- pior opção disponível. Aqui os jazigos são distribuídos ao longo dos
-- próximos dias úteis, em blocos do tamanho da capacidade diária da org.
--
-- A ordem é a mesma da rota física (quadra, rua, ordem na rua), então o
-- escalonamento acompanha o percurso em vez de sortear endereços.
--
-- AJUSTE `dias_a_espalhar` ANTES DE RODAR. O Build 7 pede piloto pequeno:
-- para começar por um bloco só, filtre por quadra no `where` em vez de soltar
-- a carteira inteira.
--
-- DESCOMENTE PARA APLICAR.
-- ############################################################################
-- begin;
--
-- with alvo as (
--   select t.id,
--          row_number() over (
--            order by q.ordem nulls last, t.rua nulls last, t.ordem_na_rua nulls last, t.identificacao
--          ) - 1 as pos
--     from tumulos t
--     left join quadras q on q.id = t.quadra_id
--    where t.contratado
--      and t.periodicidade is not null
--      and t.proximo_servico is null
--      -- PILOTO: descomente para começar por uma quadra só
--      -- and q.codigo = 'Q-01'
-- ),
-- config as (
--   select greatest(1, coalesce(limpezas_por_dia, 10)) as por_dia,
--          14                                          as dias_a_espalhar
--     from orgs
--    limit 1
-- )
-- update tumulos t
--    set proximo_servico = current_date + ((a.pos / c.por_dia) % c.dias_a_espalhar)
--   from alvo a, config c
--  where t.id = a.id;
--
-- commit;


-- ============================================================================
-- CONFERÊNCIA — antes de ligar o cron
--
-- (a) Sobrou alguém sem ponteiro? (esses ainda viram "hoje")
--     select count(*) from tumulos where contratado and proximo_servico is null;
--
-- (b) Como ficou a distribuição?
--     select proximo_servico, count(*)
--       from tumulos where contratado
--      group by proximo_servico order by proximo_servico;
--
-- (c) ENSAIO SEM COMPROMISSO — quantos serviços o gerador criaria?
--     Chame POST /api/agenda/gerar com horizonte 1 (não 30) e olhe `criados`.
--     Horizonte curto cria pouco e mostra se a conta está de pé antes de
--     soltar o mês inteiro.
--
-- (d) Só depois disso, horizonte 30 e o cron diário.
-- ============================================================================
