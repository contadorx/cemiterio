-- ============================================================================
-- 0149 — O CODIGO DO JAZIGO E UNICO DENTRO DO CEMITERIO
-- ============================================================================
--
-- O QUE ACONTECEU EM 30/08, COM ELE DE PE NO SANTA LIDIA
--
-- Ele criou a quadra Q3, chamou a rua de "RUA 1 Q3" e tentou cadastrar o
-- jazigo da familia. A tela respondeu, no celular:
--
--   duplicate key value violates unique constraint "idx_tumulos_codigo_unico"
--
-- DUAS CAUSAS, e a segunda e a que importa.
--
-- 1. `gerarCodigo` colava TODOS os digitos do nome da rua. "RUA 1 Q3" tem o 1
--    da rua e o 3 da quadra que ele repetiu no nome — virou **R13**, e o
--    codigo saiu `Q3-R13-001`. Esse codigo JA EXISTIA no Cemiterio da Saudade,
--    na Rua 13 da Quadra 3. (Consertado no codigo, nao aqui.)
--
-- 2. O INDICE ERA `(org_id, codigo)` — SEM O CEMITERIO. Essa foi so a primeira
--    colisao a estourar. Com nomes perfeitos ela viria igual: assim que ele
--    cadastrasse a Q1 do Santa Lidia, `Q1-R1-001` bateria com o `Q1-R1-001` do
--    Saudade. Bomba armada desde o dia em que o segundo cemiterio nasceu.
--
-- O CODIGO NUNCA FOI GLOBAL, E NAO DEVE SER
--
-- "Q3-R1-001" e um endereco DENTRO de um cemiterio — quadra 3, rua 1, o
-- primeiro cadastrado ali. Dois cemiterios tem uma quadra 3 cada, e as duas
-- sao reais. Exigir unicidade entre eles seria pedir que o mundo fisico
-- coubesse numa chave que ele nao tem.
--
-- NENHUM CODIGO EXISTENTE MUDA. Os 266 jazigos do Saudade continuam com o
-- codigo que ja foi para a ficha da familia e para as fotos.
-- ============================================================================

drop index if exists idx_tumulos_codigo_unico;

create unique index idx_tumulos_codigo_unico
  on tumulos (org_id, cemiterio_id, codigo)
  where codigo is not null;

comment on index idx_tumulos_codigo_unico is
  'Q3-R1-001 e unico DENTRO do cemiterio (0149). Antes era (org_id, codigo) e o Santa Lidia colidia com o Saudade.';
