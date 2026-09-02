-- ===========================================================================
-- 0154 — O BALDE DAS LÁPIDES FECHA
--
-- Medido em 02/09/2026: `storage.buckets` tinha `servicos` com public = true e
-- 822 arquivos dentro. Desses, 534 são as fotos de referência e enquadramento
-- dos 267 jazigos — a lápide inteira, com o nome e as datas de quem está ali.
-- Qualquer pessoa de posse do endereço via a foto, para sempre, sem passar por
-- login nenhum. E esses endereços trafegam pelo WhatsApp das famílias, onde
-- ficam em históricos e encaminhamentos que ninguém controla.
--
-- A 0139 fechou `comprovantes` e `conversas` e deixou este aberto de propósito,
-- porque três leitores dependiam da URL direta. Eles foram convertidos no
-- commit desta peça.
--
-- NENHUMA LINHA DO BANCO MUDA. O endereço guardado continua no mesmo formato;
-- é `assinar()` que o transforma em algo que abre. Foi essa escolha, feita na
-- 0139, que permitiu fechar um balde sem migrar dado nenhum.
--
-- A ORDEM IMPORTA: rode isto DEPOIS que o deploy do código estiver no ar. Antes
-- dele, as telas ainda devolvem o endereço cru e as fotos ficariam quebradas na
-- janela entre um e outro.
-- ===========================================================================

update storage.buckets set public = false where id = 'servicos';

-- prova: os três baldes fechados
select id, public from storage.buckets order by id;
