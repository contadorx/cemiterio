-- 0028 — CRIA OS DEPÓSITOS DE ARQUIVO (buckets) DO STORAGE
--
-- Por que existe: a migration 0009 fazia apenas
--     update storage.buckets set public = true where id = 'servicos';
-- que NÃO cria nada — se a linha não existe, o update afeta 0 linhas e não
-- reclama. Como ninguém nunca criou o bucket no painel do Supabase, toda foto
-- do sistema batia em "Bucket not found".
--
-- Rode este arquivo inteiro no SQL Editor do Supabase. Pode rodar mais de uma
-- vez sem problema.

-- 'servicos'    — fotos de lavagem (antes/depois), fotos de referência do jazigo
--                 e foto da família. Público de leitura: a família abre o link
--                 direto que chega no WhatsApp.
-- 'comprovantes'— imagens de comprovante de pagamento enviadas no WhatsApp.
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('servicos',     'servicos',     true, 26214400),
  ('comprovantes', 'comprovantes', true, 26214400)
on conflict (id) do update
  set public = true,
      file_size_limit = greatest(coalesce(storage.buckets.file_size_limit, 0), 26214400);

-- Conferência (deve retornar as duas linhas com public = true):
select id, name, public, file_size_limit from storage.buckets
where id in ('servicos', 'comprovantes');
