-- ===========================================================================
-- APLICAR EM PRODUCAO — 0165 (inteira). Pode rodar em qualquer ordem em
-- relacao as outras duas: so acrescenta uma coluna e um indice.
-- ===========================================================================

-- ===========================================================================
-- 0165 — O COMPROVANTE DIZ QUEM PAGOU
--
-- O QUE FALTAVA, E O LEANDRO VIU: "ele nao consegue olhar os dados do
-- comprovante mais o que tem no extrato? Nao pelo valor, mas valor e nome."
--
-- MEDIDO em 05/11/2026, em producao:
--
--   comprovantes lidos ................. 20
--   com o E2E do Pix guardado .......... 20   (100%)
--   com o NOME de quem pagou ............ 0   (a leitura nunca pediu)
--
-- O extrato traz o nome do remetente em todas as 248 linhas de Pix. O
-- comprovante traz o mesmo nome impresso. Eram as duas pontas do mesmo fio, e
-- uma delas estava sendo jogada fora na leitura.
--
-- SEM O NOME, O VALOR DECIDIA SOZINHO — e valor sozinho empata. Duas familias
-- pagando R$ 40 no dia 3 produziam dois candidatos identicos, e a
-- triangulacao (0163) desistia de proposito, porque escolher "o primeiro"
-- acertaria metade das vezes e erraria a outra metade em silencio. Com o nome,
-- o empate acaba: o extrato diz de quem e aquele Pix.
--
-- E O NOME TAMBEM DESCARTA. `nome_pagador` e o nome que o BANCO imprimiu de
-- quem pagou — a mesma coisa que o extrato traz. Discordar aqui nao e "quem
-- paga nem sempre e quem contratou": e outro pagamento.
--
-- CUSTO ZERO. O nome sai na MESMA chamada que ja lia valor, data e E2E
-- (src/lib/comprovante.ts). Nenhum comprovante novo custa mais caro.
--
-- OS 20 QUE JA EXISTEM FICAM SEM NOME, e assim devem ficar: reler imagem
-- antiga para preencher coluna seria gastar IA em cima de pagamento que ja
-- esta conferido. Ausencia nao e discordancia — a triangulacao nao descarta
-- comprovante sem nome lido, so deixa de ter essa prova a favor.
--
-- NENHUM DADO FOI TOCADO.
-- ===========================================================================

alter table comprovantes add column if not exists nome_pagador text;

comment on column comprovantes.nome_pagador is
  'Nome de quem PAGOU, lido na imagem do comprovante (0165). E ele que casa '
  'com `entradas_banco.remetente` na triangulacao do extrato. Nulo nos 20 '
  'comprovantes anteriores a esta coluna — ausencia nao e discordancia.';

-- O indice e por nome DENTRO DA ORG, e parcial: procurar pagador e sempre
-- "quem pagou isto", nunca "liste todos os nulos".
create index if not exists idx_comprovantes_pagador
  on comprovantes (org_id, nome_pagador) where nome_pagador is not null;

select count(*) filter (where nome_pagador is not null) as com_nome,
       count(*) as total
  from comprovantes;
