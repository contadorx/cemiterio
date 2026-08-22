-- ON CONFLICT (stripe_id) não consegue inferir um índice PARCIAL. E ele não
-- precisa ser parcial: num índice único, NULLs não conflitam entre si, então a
-- fatura lançada à mão (sem stripe_id) continua podendo ser várias.
drop index if exists walkstamp.fatura_stripe_uk;
create unique index if not exists fatura_stripe_uk on walkstamp.fatura (stripe_id);
