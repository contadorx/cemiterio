-- =====================================================================
-- 0050 · FILA DE LIBERAÇÃO DO WHATSAPP
-- =====================================================================
--
-- SEM NENHUMA IA. O sistema prepara, a Sureya decide.
--
-- POR QUE ISTO EXISTE
-- O diferencial do serviço é a família receber a foto do túmulo limpo com
-- uma palavra de carinho, vinda de uma pessoa. Robô respondendo idoso quebra
-- exatamente aquilo que faz o cliente ficar.
--
-- Mas digitar tudo à mão também não escala: baixar a foto, procurar o
-- contato, escrever o texto, colar a chave Pix. É trabalho repetitivo que
-- cansa e faz a Sureya deixar de mandar.
--
-- A fila resolve os dois: o sistema monta o RASCUNHO pronto (fotos + texto
-- com o nome preenchido) e para. Nada sai sem a Sureya olhar e aprovar, um
-- por um. Ela vê a prévia exata do que vai ser enviado e escolhe:
--     enviar · editar e enviar · não enviar
--
-- SEGURANÇA: só cria. Rodar duas vezes é inofensivo.
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname='sureya_status_fila') then
    create type sureya_status_fila as enum ('aguardando','enviado','descartado');
  end if;
  if not exists (select 1 from pg_type where typname='sureya_tipo_mensagem') then
    create type sureya_tipo_mensagem as enum ('foto','cobranca','lembrete','agradecimento');
  end if;
end $$;

create table if not exists fila_liberacao (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  familia_id    uuid not null references familias(id) on delete cascade,

  -- Para quem vai. Cobrança vai ao responsável financeiro; foto de carinho
  -- pode ir a qualquer pessoa da família que queira receber.
  cliente_id    uuid references clientes(id) on delete set null,

  tumulo_id     uuid references tumulos(id) on delete set null,
  servico_id    uuid references servicos(id) on delete set null,

  tipo          sureya_tipo_mensagem not null,
  status        sureya_status_fila not null default 'aguardando',

  texto         text not null,          -- rascunho montado pelo sistema
  texto_final   text,                   -- o que a Sureya realmente mandou
  fotos         jsonb not null default '[]'::jsonb,   -- urls do antes e do depois

  criado_em     timestamptz not null default now(),
  decidido_em   timestamptz,
  decidido_por  uuid
);

create index if not exists idx_fila_pendente
  on fila_liberacao (org_id, status, criado_em)
  where status = 'aguardando';

alter table fila_liberacao enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='fila_liberacao' and policyname='fila_por_org') then
    create policy fila_por_org on fila_liberacao
      using (org_id in (select org_id from membros where user_id = auth.uid()));
  end if;
end $$;

-- NÃO existe rotina que envie sozinha. Não há cron, não há gatilho, não há
-- disparo automático apontando para esta tabela. A única forma de uma
-- mensagem sair é a Sureya tocar em "enviar" — por desenho, não por
-- esquecimento.
comment on table fila_liberacao is
  'Rascunhos aguardando aprovação manual da Sureya. Nada aqui é enviado automaticamente.';
