-- ============================================================================
-- SUREYA — 0027 · DECISÃO: o que é `planos.valor_vigente`?
--
-- ESTE ARQUIVO NÃO ALTERA NADA. Só lê. É um diagnóstico para você decidir uma
-- regra de negócio que o código hoje entende de TRÊS maneiras diferentes na
-- mesma coluna. Enquanto a decisão não vier, o sistema mostra o que está
-- gravado e não converte nada (evita transformar dinheiro certo em errado).
--
-- OS TRÊS SIGNIFICADOS EM USO
--
-- (1) PREÇO POR LIMPEZA — é como a coluna nasceu:
--     migrations/0001 (linha 123): "valor_vigente numeric ... -- preço por limpeza hoje"
--     migrations/0002 (comment):   "preço SUGERIDO por limpeza p/ o próximo recorrente"
--     E é como o servidor a LÊ até hoje:
--       src/lib/agenda.ts (136, 363, 392): grava servicos.valor = plano.valor_vigente
--         em CADA lavagem agendada;
--       src/app/api/servico/concluir/route.ts (76): debita esse valor por lavagem;
--       src/lib/proativo.ts (79): valor_vigente × qtd_por_passagem = valor do mês.
--
-- (2) VALOR DO CICLO (mensalidade × meses da cadência) — é como o código NOVO
--     a ESCREVE:
--       src/app/api/planos/route.ts (45) e src/app/api/clientes/route.ts (236):
--         valor_vigente = valorDoCiclo(cadencia, valorMensal);
--       src/lib/vencimento.ts: valorDoCiclo().
--
-- (3) VALOR MENSAL cru — é o que entrou pela porta dos dados reais:
--       src/app/api/tumulos/importar/route.ts (167): grava o valor da planilha
--         direto em valor_vigente, com valor_mensal NULL;
--       migrations/SEED_dados_teste.sql: mesma coisa.
--
-- POR QUE ISTO IMPORTA EM DINHEIRO (dois exemplos reais do banco atual)
--   · plano MENSAL com 2 lavagens no mês e valor_vigente = 80: a agenda gera
--     duas lavagens de R$ 80 e a família é debitada em R$ 160 no mês.
--   · plano ANUAL criado pela tela nova (mensal 40 → valor_vigente 480): cada
--     lavagem agendada nasce valendo R$ 480.
--   Nenhum dos dois é bug de digitação: é a mesma coluna lida com duas réguas.
--
-- ============================================================================
-- PARTE 1 — DIAGNÓSTICO (só SELECT; nada muda)
-- ============================================================================

-- 1.1 Retrato da carteira: quantos planos em cada situação de preço.
select
  count(*)                                                            as planos,
  count(*) filter (where valor_mensal is null)                        as sem_valor_mensal,
  count(*) filter (where valor_mensal is not null)                    as com_valor_mensal,
  count(*) filter (where valor_mensal is not null
                     and round(valor_mensal, 2) = round(valor_vigente, 2))
                                                                      as mensal_igual_vigente,
  count(*) filter (where cadencia <> 'mensal' and valor_mensal is not null
                     and round(valor_mensal * case cadencia
                           when 'bimestral' then 2 when 'trimestral' then 3
                           when 'semestral' then 6 when 'anual' then 12
                           else 1 end, 2) = round(valor_vigente, 2))
                                                                      as vigente_igual_ciclo
from planos;
-- COMO LER: "mensal_igual_vigente" alto = o banco está falando (1)/(3), preço
-- por limpeza/mês. "vigente_igual_ciclo" alto = alguém já gravou (2), ciclo.

-- 1.2 Os planos não mensais, um por um — é aqui que os dois mundos se separam.
select p.id, p.cadencia, p.lavagens_por_ciclo, p.qtd_por_passagem,
       p.valor_mensal, p.valor_vigente, p.data_valor_vigente, p.ativo,
       c.nome as familia, t.identificacao as jazigo
  from planos p
  left join clientes c on c.id = p.cliente_id
  left join tumulos  t on t.id = p.tumulo_id
 where p.cadencia <> 'mensal'
 order by p.cadencia, p.valor_vigente desc;

-- 1.3 O que a AGENDA está prometendo cobrar por lavagem (leitura (1)) e o que
--     a tela de Planos mostra como ciclo (leitura (2)). Divergiu = decidir.
select p.cadencia, p.lavagens_por_ciclo,
       p.valor_vigente                                        as por_lavagem_hoje,
       p.valor_vigente * greatest(coalesce(p.lavagens_por_ciclo, 1), 1)
                                                              as total_do_ciclo_pela_agenda,
       p.valor_mensal                                         as mensal_declarado,
       count(*)                                               as quantos_planos
  from planos p
 group by 1,2,3,4,5
 order by 1,3;

-- 1.4 Serviços já gerados: qual valor por lavagem está de fato no histórico?
--     (servicos.valor é a fonte da verdade do que foi cobrado — 0002.)
select date_trunc('month', s.data_prevista)::date as mes,
       count(*) as lavagens, min(s.valor) as menor, avg(s.valor)::numeric(10,2) as media,
       max(s.valor) as maior
  from servicos s
 where s.data_prevista >= current_date - interval '12 months'
 group by 1 order by 1 desc;
-- COMO LER: se a média bate com o que a família paga por VISITA, o banco vive
-- na leitura (1). Se bate com a mensalidade, vive na (3).

-- ============================================================================
-- PARTE 2 — OS DOIS CONSERTOS POSSÍVEIS (ambos comentados; escolha UM)
--
-- Rode só depois de olhar a Parte 1 e me dizer qual é a regra. Cada opção tem
-- um par no código — SQL sozinho deixa o sistema meio-a-meio.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- OPÇÃO A — valor_vigente é o VALOR DO CICLO (mensalidade × meses).
-- Consequência: a agenda passa a dividir antes de gravar servicos.valor, senão
-- cada lavagem de um plano anual nasce valendo o ano inteiro.
-- Código que muda comigo: src/lib/agenda.ts (136/363/392),
-- src/app/api/servico/concluir (76), src/lib/proativo.ts (79).
-- ---------------------------------------------------------------------------
-- -- preenche o mensal a partir do ciclo, só onde está NULL:
-- update planos
--    set valor_mensal = round(coalesce(valor_vigente, 0) / case cadencia
--          when 'bimestral' then 2 when 'trimestral' then 3
--          when 'semestral' then 6 when 'anual' then 12 else 1 end, 2)
--  where valor_mensal is null;
-- -- e alinha o ciclo onde as duas colunas discordam:
-- update planos
--    set valor_vigente = round(valor_mensal * case cadencia
--          when 'bimestral' then 2 when 'trimestral' then 3
--          when 'semestral' then 6 when 'anual' then 12 else 1 end, 2)
--  where valor_mensal is not null;

-- ---------------------------------------------------------------------------
-- OPÇÃO B — valor_vigente é o PREÇO POR LIMPEZA (o significado original, e o
-- que a agenda já usa). Nada na agenda muda; muda quem ESCREVE ciclo:
-- src/app/api/planos/route.ts (45), src/app/api/clientes/route.ts (236) e o
-- rótulo "Cobrança do ciclo" das telas.
-- ---------------------------------------------------------------------------
-- -- 1) desfaz o ciclo gravado por engano nos planos não mensais criados pela
-- --    tela nova (só onde valor_vigente = mensal × meses, assinatura da (2)):
-- update planos
--    set valor_vigente = valor_mensal
--  where valor_mensal is not null
--    and cadencia <> 'mensal'
--    and round(valor_vigente, 2) = round(valor_mensal * case cadencia
--          when 'bimestral' then 2 when 'trimestral' then 3
--          when 'semestral' then 6 when 'anual' then 12 else 1 end, 2);
-- -- 2) e completa o mensal dos planos antigos com o próprio valor gravado:
-- update planos set valor_mensal = valor_vigente where valor_mensal is null;

-- ============================================================================
-- PARTE 3 — O QUE O REAJUSTE FAZ HOJE (contexto da decisão)
--
-- sureya_aplicar_reajuste (0006/0016) grava SÓ valor_vigente e
-- data_valor_vigente; valor_mensal fica com o preço antigo. Havia aqui uma
-- migration 0028 que sincronizava as duas dividindo p_novo_valor pelos meses da
-- cadência — ela ASSUMIA a Opção A e foi retirada por isso. Depois da decisão,
-- a função volta em uma linha (dividir na A, copiar na B).
-- ============================================================================
