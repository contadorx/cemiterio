-- 0024 — Chave mestra de disparos automáticos (liga/desliga)
--
-- Enquanto está DESLIGADO (false):
--   • a IA não responde sozinha (o rascunho é gerado para aprovação humana);
--   • os avisos/convites automáticos e a fila de reenvio ficam parados.
-- O que o cliente manda continua entrando normalmente, e as respostas
-- MANUAIS enviadas pelo painel continuam saindo.
--
-- Começa DESLIGADO por segurança: durante a migração de dados e a captura das
-- quadras, nada dispara sem você ligar de propósito na tela Config.

alter table orgs
  add column if not exists disparos_ativos boolean not null default false;

comment on column orgs.disparos_ativos is
  'Chave mestra dos disparos automáticos. false = IA não responde sozinha e crons proativos/fila de reenvio ficam parados. Respostas manuais e entrada de mensagens seguem normalmente.';
