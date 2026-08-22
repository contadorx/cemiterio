-- =====================================================================
-- 0087 · QUANDO ESTA FAMÍLIA RECEBEU FOTO PELA ÚLTIMA VEZ
-- =====================================================================
--
-- O PEDIDO, 22/08
-- "Ainda nos envios das fotos, preciso que tenha a indicação da última data de
-- foto enviada para decidir ou não enviar — não quero manter a frequência toda
-- data."
--
-- Ou seja: a foto é um gesto, não um relatório mensal obrigatório. Mandar toda
-- vez transforma carinho em rotina, e a família de plano semanal receberia
-- cinquenta por ano. A decisão continua sendo dela, uma por uma; o que faltava
-- era o número em cima do qual decidir.
--
-- ONDE ESSE NÚMERO MORA — E POR QUE SÃO DOIS LUGARES
--
-- Existem DOIS caminhos pelos quais uma foto chega à família, e olhar só um
-- deles daria uma data errada com cara de certa:
--
--   1. A FILA DE LIBERAÇÃO — o caminho normal. A Sureya aprova, `status` vira
--      `enviado` e `decidido_em` guarda o instante (carimbado na reserva, e
--      limpo de volta quando o envio falha: só sobrevive em quem saiu mesmo).
--
--   2. O ENVIO AUTOMÁTICO (`notificarFamilia`) — sai na conclusão da lavagem
--      quando as chaves estão ligadas, e não passa pela fila. Ele marca
--      `servicos.notificado_cliente`. Não há coluna de horário: o melhor
--      carimbo disponível é `data_executada`, que é o dia da lavagem — e o
--      envio automático acontece no mesmo minuto dela.
--
-- Hoje os dois estão em zero (nenhuma foto saiu ainda em produção), o que quer
-- dizer que a tela vai dizer "nunca recebeu foto" para todo mundo. Está certo:
-- é a primeira vez mesmo.
--
-- POR QUE VIEW, E NÃO COLUNA EM `familias`
-- Uma coluna `ultima_foto_em` teria de ser mantida por gatilho nos dois
-- caminhos, e ficaria errada em silêncio no dia em que aparecesse um terceiro.
-- A view lê o fato de onde ele acontece. O custo é uma varredura de duas
-- tabelas pequenas, numa tela que a Sureya abre algumas vezes por dia.
--
-- `security_invoker` LIGADO: sem isso a view roda como dona (postgres) e
-- devolveria linhas de qualquer organização a quem a consultasse. As views
-- antigas deste banco não fazem isso; as novas fazem.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 · TODA FOTO QUE SAIU, DE QUALQUER CAMINHO
-- ---------------------------------------------------------------------
create or replace view sureya_fotos_enviadas
with (security_invoker = true) as
  select f.org_id, f.familia_id, f.tumulo_id, f.decidido_em as em, 'fila'::text as caminho
    from fila_liberacao f
   where f.tipo = 'foto'
     and f.status = 'enviado'
     and f.decidido_em is not null
  union all
  select s.org_id, t.familia_id, s.tumulo_id, s.data_executada, 'automatico'::text
    from servicos s
    join tumulos t on t.id = s.tumulo_id
   where s.notificado_cliente
     and s.data_executada is not null;

comment on view sureya_fotos_enviadas is
  'Toda foto que chegou a uma familia, pelos DOIS caminhos: a fila de liberacao e o envio automatico da conclusao. Olhar so um deles daria data errada com cara de certa.';

-- ---------------------------------------------------------------------
-- 2 · A ÚLTIMA POR FAMÍLIA — o número da decisão
-- ---------------------------------------------------------------------
create or replace view sureya_ultima_foto_familia
with (security_invoker = true) as
  select org_id,
         familia_id,
         max(em)  as ultima_em,
         count(*) as total
    from sureya_fotos_enviadas
   where familia_id is not null
   group by org_id, familia_id;

comment on view sureya_ultima_foto_familia is
  'Quando esta familia recebeu foto pela ultima vez, e quantas ja recebeu. E o grao da decisao: quem cansa de receber e a pessoa, nao a pedra.';

-- ---------------------------------------------------------------------
-- 3 · A ÚLTIMA POR JAZIGO — a segunda pergunta, para família com mais de um
-- ---------------------------------------------------------------------
-- Cinco famílias já têm dois jazigos ou mais. Para elas "a família recebeu foto
-- há 8 dias" pode ser de OUTRA pedra, e a resposta muda.
create or replace view sureya_ultima_foto_jazigo
with (security_invoker = true) as
  select org_id,
         tumulo_id,
         max(em)  as ultima_em,
         count(*) as total
    from sureya_fotos_enviadas
   where tumulo_id is not null
   group by org_id, tumulo_id;

comment on view sureya_ultima_foto_jazigo is
  'A ultima foto enviada DESTE jazigo. Para familia com mais de uma pedra, a data da familia sozinha pode enganar.';

-- ---------------------------------------------------------------------
-- 4 · O AVISO — um número que a casa escolhe, não uma regra do sistema
-- ---------------------------------------------------------------------
-- Isto NÃO bloqueia nada e NÃO envia nada. É só o ponto a partir do qual a tela
-- pinta a linha de atenção, para a Sureya achar de relance, numa fila de vinte
-- mensagens, as que ela provavelmente vai descartar. Zero desliga o aviso.
alter table orgs add column if not exists dias_entre_fotos int not null default 30;

comment on column orgs.dias_entre_fotos is
  'So para AVISAR na fila quando a familia recebeu foto ha menos dias que isto. Nao bloqueia envio nem envia nada. Zero desliga o aviso.';

-- =====================================================================
-- CONFERENCIA
-- =====================================================================
-- select f.nome, u.ultima_em, u.total
--   from familias f left join sureya_ultima_foto_familia u on u.familia_id = f.id
--  order by u.ultima_em desc nulls last limit 20;
