-- 0025 — Vínculo do lead com o cliente que ele virou
--
-- Ao "transformar em cliente", guardamos aqui o cliente criado. Serve para:
--   • pular direto para a ficha do cliente a partir de um lead convertido;
--   • evitar converter o mesmo lead duas vezes (cria cliente duplicado).

alter table leads
  add column if not exists cliente_id uuid references clientes(id) on delete set null;

comment on column leads.cliente_id is
  'Cliente criado quando o lead foi convertido (transformar em cliente). Nulo se ainda não virou cliente.';
