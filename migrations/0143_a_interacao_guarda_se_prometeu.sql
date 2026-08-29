-- ============================================================================
-- 0143 — A INTERACAO GUARDA SE PROMETEU
--
-- (Em producao esta trilha entrou junto com a 0142, com o nome `0142b`. Aqui
-- ela e um arquivo proprio porque a 0142 cria a TABELA e esta mexe em outra —
-- misturar as duas faria um arquivo que nao se le de uma vez.)
-- ============================================================================
--
-- A 0142 criou o lugar onde a promessa vira linha. Falta o outro lado: saber,
-- OLHANDO A RESPOSTA, se ela prometeu alguma coisa.
--
-- POR QUE ISSO NAO E DETALHE
--
-- Os 44% medidos em 29/08 sairam de leitura a olho de 25 respostas. Se a
-- unica marca da promessa for a linha em `compromissos`, dali a um mes nao da
-- para responder a pergunta que importa — "melhorou?" —, porque as respostas
-- que prometeram e NAO viraram compromisso (a IA prometeu sem dizer sobre o
-- que, o rascunho foi descartado) somem da conta. Medir so o que deu certo e
-- como contar so as lavagens que deixaram foto.
--
-- Entao a marca fica nos DOIS lugares: na interacao, sempre; na tabela de
-- compromissos, quando a mensagem SAI e ha assunto.
--
-- NADA AQUI ENVIA NADA. Sao duas colunas.
-- ============================================================================

alter table interacoes_ia
  -- NOT NULL DEFAULT FALSE, e nao nullable: "nao sei se prometeu" e um estado
  -- que nao serve para nada numa conta. As 145 linhas antigas entram como
  -- `false` sabendo-se que e chute — e por isso a medicao de "melhorou" comeca
  -- da data desta migration, nao do inicio do mundo.
  add column if not exists prometeu_voltar boolean not null default false,
  -- SOBRE O QUE. Sem isto, "prometeu" e uma estatistica que nao vira trabalho:
  -- ninguem consegue cumprir "voce prometeu alguma coisa".
  add column if not exists promessa_sobre text;

comment on column interacoes_ia.prometeu_voltar is
  'A resposta prometeu voltar depois (0143). Em 29/08, 44% prometiam e nenhuma deixava marca.';
comment on column interacoes_ia.promessa_sobre is
  'O que foi prometido, em uma linha. Vira `compromissos.sobre` quando a mensagem sai.';
