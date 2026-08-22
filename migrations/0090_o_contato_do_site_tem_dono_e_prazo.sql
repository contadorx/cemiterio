-- =====================================================================
-- 0090 · O CONTATO DO SITE TEM DONO, PRAZO E PRÓXIMA AÇÃO
-- =====================================================================
--
-- O BURACO, MEDIDO
-- O formulário público (`POST /api/contato`) grava em `leads` e avisa por push
-- e por WhatsApp. Os dois avisos apontam para `/painel/leads/<id>` — e o
-- middleware devolve **404** para tudo que começa com `/painel/leads` desde que
-- o CRM foi desligado. O comentário da rota ainda promete um "card de leads no
-- Início"; esse card foi removido quando a tela inicial virou "O mês".
--
-- Ou seja: o site diz "respondemos no mesmo dia" e o contato não tem para onde
-- ir. Se o WhatsApp de aviso não estiver configurado, ele fica só no banco.
--
-- O QUE A TABELA JÁ TINHA (e o que faltava)
-- `leads` já tem `origem`, `responsavel`, `proximo_passo` (data) e `contexto`.
-- Falta o que transforma uma lista num atendimento:
--
--   · quantas vezes já se tentou falar — sem isso, "liguei e não atendeu" mora
--     na cabeça de quem ligou;
--   · quando foi a última tentativa;
--   · a próxima ação POR ESCRITO. Uma data sem a frase é um alarme sem motivo:
--     chega o dia, ninguém lembra o que era para fazer;
--   · de qual cemitério a pessoa está falando — é a primeira pergunta da
--     conversa, e o formulário pode entregá-la de graça;
--   · de onde ela veio (página, CTA, campanha, UTMs), para saber onde há
--     demanda sem aumentar o formulário.
--
-- Os 104 leads que já existem são todos `origem = 'whatsapp'`, do tempo do
-- agente de IA — nenhum veio do site. Ou seja: o buraco está aberto e ainda não
-- engoliu nada. É a hora de fechá-lo.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- PRIMEIRO, A DERIVA — de novo
--
-- Escrevendo esta migration, o banco limpo recusou: `column "ignorado" does
-- not exist`. Seis colunas de `leads` existem em PRODUCAO e em migration
-- nenhuma: `nome`, `proximo_passo`, `responsavel`, `ignorado`,
-- `motivo_ignorado` e `cliente_id`. A 0061 ja tinha fechado outras quatro da
-- mesma tabela (`origem`, `contexto`, `jazigo_ref`, `cliente_novo_id`) — estas
-- passaram.
--
-- Nao e detalhe: `POST /api/contato` ESCREVE em `nome` e em `contexto`. Num
-- ambiente reconstruido do repositorio, o formulario do site gravaria o lead e
-- perderia o nome da pessoa em silencio.
--
-- Tipos conferidos contra producao antes de escrever.
-- ---------------------------------------------------------------------
alter table leads add column if not exists nome            text;
alter table leads add column if not exists proximo_passo   date;
alter table leads add column if not exists responsavel     uuid;
alter table leads add column if not exists ignorado        boolean not null default false;
alter table leads add column if not exists motivo_ignorado text;
alter table leads add column if not exists cliente_id      uuid references clientes(id) on delete set null;

-- ---------------------------------------------------------------------
-- E AGORA O QUE FALTAVA PARA VIRAR ATENDIMENTO
-- ---------------------------------------------------------------------
alter table leads add column if not exists tentativas          int not null default 0;
alter table leads add column if not exists ultima_tentativa_em timestamptz;
alter table leads add column if not exists proxima_acao        text;
alter table leads add column if not exists cemiterio_interesse text;
alter table leads add column if not exists utm                 jsonb;

comment on column leads.tentativas is
  'Quantas vezes ja se tentou falar com esta pessoa. Sem isto, "liguei e nao atendeu" mora so na cabeca de quem ligou.';
comment on column leads.ultima_tentativa_em is
  'Quando foi a ultima tentativa de contato.';
comment on column leads.proxima_acao is
  'O que fazer, por escrito. Uma data sem a frase e um alarme sem motivo.';
comment on column leads.cemiterio_interesse is
  'Qual cemiterio a pessoa mencionou no formulario. Primeira pergunta da conversa, entregue de graca.';
comment on column leads.utm is
  'De onde ela veio: pagina, CTA, campanha e utm_*. Campos invisiveis do formulario.';

-- A fila é lida por data de chegada, e o índice acompanha isso.
create index if not exists idx_leads_pendentes
  on leads (org_id, created_at desc)
  where status = 'novo' and coalesce(ignorado, false) = false;

commit;

-- ---------------------------------------------------------------------
-- A FILA — o que está esperando resposta, e há quanto tempo
--
-- `security_invoker` ligado: sem isso a view roda como dona (postgres) e
-- devolveria contato de qualquer organização a quem a consultasse.
-- ---------------------------------------------------------------------
create or replace view sureya_contatos_pendentes
with (security_invoker = true) as
  select l.id,
         l.org_id,
         coalesce(nullif(btrim(l.nome), ''), l.nome_wa) as nome,
         l.telefone,
         l.origem,
         l.cemiterio_interesse,
         l.contexto,
         l.mensagens,
         l.created_at,
         l.tentativas,
         l.ultima_tentativa_em,
         l.responsavel,
         l.proximo_passo,
         l.proxima_acao,
         -- HORAS, e não dias. O site promete "no mesmo dia": um contato de seis
         -- horas atrás já é atraso, e em dias ele apareceria como zero.
         round(extract(epoch from (now() - l.created_at)) / 3600.0)::int as horas_esperando,
         -- ATRASADO é o que a casa prometeu e não cumpriu, não o que é velho:
         -- chegou há mais de 24 h e ninguém tentou falar nenhuma vez.
         (l.tentativas = 0 and l.created_at < now() - interval '24 hours') as atrasado,
         -- Ou tem data marcada para hoje ou antes e ninguém voltou nela.
         (l.proximo_passo is not null and l.proximo_passo <= current_date) as vencido
    from leads l
   where l.status = 'novo'
     and coalesce(l.ignorado, false) = false;

comment on view sureya_contatos_pendentes is
  'A fila de contatos esperando resposta. Atrasado = chegou ha mais de 24h e ninguem tentou falar; vencido = a data da proxima acao chegou.';

-- =====================================================================
-- CONFERENCIA
-- =====================================================================
-- select nome, telefone, origem, horas_esperando, tentativas, atrasado, vencido
--   from sureya_contatos_pendentes order by created_at;
