-- ===========================================================================
-- 0159 — O TETO É EM REAIS, E OS PREÇOS ESTAVAM VELHOS
--
-- DOIS ERROS MEUS NA 0157, os dois encontrados ao conferir a tabela de preços
-- contra a tabela oficial da Anthropic.
--
-- 1. A COLUNA CHAMAVA-SE `teto_ia_dolar_dia` E COMPARAVA REAIS.
--    `custoDaChamada()` devolve R$ — está escrito no comentário dela — e
--    `chamadas_ia.custo` guarda R$. Logo o incidente de 03/09 foram
--    R$ 348,18, e nao US$ 348,18 como eu relatei. A coluna vira
--    `teto_ia_reais_dia` e o teto sobe de 15 para 60: R$ 15 seriam menos de
--    US$ 3 e derrubariam a IA num dia de uso normal.
--
-- 2. OS PREÇOS DE `modelos_ia` ESTAVAM DESATUALIZADOS. Conferidos contra a
--    tabela oficial (Haiku 4.5 US$1/US$5, Sonnet 5 US$2/US$10, Opus 5
--    US$5/US$25 por milhao de tokens):
--
--      apelido    guardado (R$)   equivale a (US$)   preco real (US$)
--      economico     5 /  25         1 /  5             1 /  5      ok
--      padrao       18 /  90         3 / 15             2 / 10      1,8x alto
--      delicado     90 / 450        15 / 75             5 / 25      3,6x alto
--
--    Sonnet e Opus estavam com preco de geracao anterior. A conversao aqui usa
--    R$ 5,50/US$ ARREDONDADO PARA CIMA em cada linha: um teto de gasto deve
--    errar para o lado de gastar menos, nunca para o de gastar mais.
--
--    O que ja foi gravado em `chamadas_ia.custo` NAO e reescrito. Aquele numero
--    e o que o app cobrou na epoca, e reescrever historico para ele "bater" com
--    a tabela nova apagaria a prova de que a tabela estava errada.
-- ===========================================================================

alter table orgs rename column teto_ia_dolar_dia to teto_ia_reais_dia;

comment on column orgs.teto_ia_reais_dia is
  'Teto de gasto com IA por dia, em REAIS. Nulo = padrao do codigo (R$ 60). '
  'Lido por podeChamarIa(), que soma chamadas_ia.custo (tambem em R$) no dia de operacao.';

update orgs set teto_ia_reais_dia = 60 where coalesce(teto_ia_reais_dia, 0) < 60;

-- Precos conferidos contra a tabela oficial da Anthropic, a R$ 5,50/US$.
update modelos_ia set preco_entrada =  6, preco_saida =  30 where apelido = 'economico';
update modelos_ia set preco_entrada = 11, preco_saida =  55 where apelido = 'padrao';
update modelos_ia set preco_entrada = 28, preco_saida = 140 where apelido = 'delicado';

select apelido, modelo, provedor, preco_entrada, preco_saida, ativo
from modelos_ia order by ativo desc, preco_entrada;
