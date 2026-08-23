-- =====================================================================
-- 0093 — A ULTIMA LAVAGEM DO JAZIGO, e o jazigo que ficava orfao depois
--        de salvo
--
-- DUAS COISAS, e a segunda e um defeito com data e nome
-- ---------------------------------------------------------------------
-- 1. A pergunta "quando este jazigo foi lavado pela ultima vez?" nao
--    tinha resposta em lugar nenhum. Existe `tumulos.ultima_lavagem_
--    informada`, que e outra coisa: e o que a FAMILIA disse na hora do
--    cadastro, nao o que a equipe fez.
--
-- 2. Medido em producao em 23/08/2026: SEIS jazigos ja vinculados a uma
--    familia continuavam aparecendo na lista de "sem familia", por mais
--    vezes que fossem salvos. Todos na Quadra 4, entre eles o
--    "Americo damo" (Q4-T6-010), ligado a familia DAMO 2.
--
--    A causa nao esta neste arquivo — esta no codigo, que perguntava
--    `cliente_id is null` para saber se o jazigo tinha familia. Desde a
--    0091 `cliente_id` e o CONTATO, derivado da familia, e ele e nulo
--    justamente nas familias que ainda nao tem com quem falar. Salvar
--    funcionava; a pergunta e que estava errada.
--
--    A view `sureya_jazigos_sem_familia` (0091) ja fazia a pergunta
--    certa e nao era usada por ninguem. Passa a ser.
--
-- POR QUE UMA VIEW E NAO UM CAMPO EM `tumulos`
-- ---------------------------------------------------------------------
-- Um campo `ultima_lavagem` teria de ser mantido por gatilho em toda
-- conclusao, todo estorno e toda mudanca de data — tres lugares para
-- esquecer de atualizar, e um numero errado na tela e pior do que numero
-- nenhum. A view le do fato: o servico executado mais recente.
--
-- ESTORNO NAO CONTA. Uma lavagem estornada foi anulada: o valor voltou
-- para a familia como credito. Continuar dizendo que o jazigo foi lavado
-- naquele dia e afirmar que aconteceu o que a propria casa ja disse que
-- nao aconteceu.
-- =====================================================================

-- ---------------------------------------------------------------------
-- `no_campo` SEPARA O QUE A EQUIPE FEZ DO QUE FOI ANOTADO DEPOIS.
--
-- Nao existe coluna de origem, mas existe o fato: `iniciado_em` so e
-- carimbado por `sureya_iniciar_lavagem` (0068), que e o botao "Comecar"
-- do aplicativo de campo. Lavagem registrada pelo painel
-- (`/api/servico/registrar-feito`) nasce executada, sem inicio.
--
-- A diferenca importa para quem le: "lavada em 12/08" com foto e hora e
-- uma coisa; "anotada como lavada em 12/08" e outra, e so uma delas tem
-- prova.
-- ---------------------------------------------------------------------
create or replace view public.sureya_ultima_lavagem_jazigo
with (security_invoker = true) as
select distinct on (s.tumulo_id)
  s.tumulo_id,
  s.org_id,
  s.id                          as servico_id,
  s.data_executada,
  (s.data_executada at time zone 'America/Sao_Paulo')::date as dia,
  s.executora_id,
  m.nome                        as executora,
  s.foto_depois_url,
  (s.iniciado_em is not null)   as no_campo,
  s.duracao_minutos
from servicos s
left join membros m
       on m.user_id = s.executora_id
      and m.org_id  = s.org_id
where s.status = 'executado'
  and s.data_executada is not null
  and s.estornado_em is null
order by s.tumulo_id, s.data_executada desc;

comment on view public.sureya_ultima_lavagem_jazigo is
  'A lavagem executada mais recente de cada jazigo, ja descontando as estornadas. Diferente de tumulos.ultima_lavagem_informada, que e o que a familia disse no cadastro. no_campo = true quando passou pelo botao Comecar do aplicativo de campo.';

-- O dia e o de Sao Paulo, nao o de UTC. `data_executada` e timestamptz:
-- uma lavagem concluida as 21h30 de Brasilia e 00h30 do dia seguinte em
-- UTC, e a tela mostraria a lavagem de ontem com a data de hoje — o
-- mesmo erro que ja custou a lista vazia do aplicativo de campo.

revoke all    on public.sureya_ultima_lavagem_jazigo from public, anon;
grant  select on public.sureya_ultima_lavagem_jazigo to authenticated, service_role;
