-- 0033 — A conversa inteira: o que ela responde pelo celular + vincular lead a
--        cliente que ja existe
-- ---------------------------------------------------------------------------
-- O PEDIDO (Leandro, 01/08):
--   "nos leads quero ter a capacidade de vincular a conversa a um cliente
--    existente e queria ter nao so as conversas que a pessoa enviou mas as
--    respostas do whatsapp da Sureya tambem, que escreveu no whatsapp do
--    celular"
--
-- DUAS COISAS:
--
-- 1) TELEFONE ADICIONAL POR CLIENTE (telefones_cliente)
--    Hoje o sistema so reconhece a familia pelo `clientes.telefone` — um unico
--    numero. Quando a mesma pessoa escreve de outro numero (o do marido, o do
--    filho, o comercial), ela cai como LEAD e a conversa nasce solta.
--    Vincular o lead a um cliente existente sem guardar o numero resolveria uma
--    vez so: na mensagem seguinte viraria lead de novo. Com esta tabela, o
--    numero passa a pertencer aquela familia para sempre.
--
-- 2) DE ONDE SAIU A RESPOSTA (mensagens.pelo_celular)
--    O webhook do Evolution jogava fora tudo que era `fromMe` — ou seja, tudo
--    que ela digitava direto no celular sumia. O painel mostrava so metade da
--    conversa. Agora essas mensagens sao gravadas, e esta coluna marca que
--    vieram do aparelho, nao do painel.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- PARTE A — outros numeros da mesma familia
-- ===========================================================================
create table if not exists telefones_cliente (
  id uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  telefone   text not null,
  rotulo     text,                       -- "filho", "comercial", "whatsapp antigo"
  created_at timestamptz not null default now()
);

-- um numero pertence a UMA familia so
create unique index if not exists uq_telefones_cliente
  on telefones_cliente(org_id, telefone);
create index if not exists idx_telefones_cliente_cli
  on telefones_cliente(org_id, cliente_id);

alter table telefones_cliente enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies
                  where tablename = 'telefones_cliente' and policyname = 'telefones_cliente_org') then
    create policy telefones_cliente_org on telefones_cliente
      using (org_id = current_org_id()) with check (org_id = current_org_id());
  end if;
end $$;

comment on table telefones_cliente is
  'Numeros ADICIONAIS de uma familia. O principal continua em clientes.telefone. Usado para reconhecer quem escreve de outro aparelho.';


-- ===========================================================================
-- PARTE B — a mensagem veio do aparelho, nao do painel
-- ===========================================================================
alter table mensagens add column if not exists pelo_celular boolean not null default false;

comment on column mensagens.pelo_celular is
  'true = digitada direto no WhatsApp do celular e capturada pelo webhook (fromMe), nao enviada pelo painel.';

create index if not exists idx_mensagens_conversa_data
  on mensagens(conversa_id, created_at);


-- ---------------------------------------------------------------------------
-- CONFERENCIA (so leitura)
-- ---------------------------------------------------------------------------
-- select telefone, rotulo, cliente_id from telefones_cliente;
-- select created_at, direcao, autor, pelo_celular, left(texto, 60)
--   from mensagens order by created_at desc limit 30;
