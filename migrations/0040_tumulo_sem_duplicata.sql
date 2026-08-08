-- ============================================================================
-- SUREYA — 0040 · O BANCO PASSA A RECUSAR TÚMULO DUPLICADO
--
-- Já aconteceu de dois túmulos virarem um registro só. A trava contra isso era
-- 100% do aplicativo — e havia CINCO portas de criação com TRÊS travas
-- diferentes. O banco aceitava tudo: `create table tumulos` (0001) não tem
-- unique nenhum sobre (quadra_id, identificacao).
--
-- Pior: como a checagem era SELECT e depois INSERT, nem era atômica. Dois
-- toques ao mesmo tempo (duplo clique, duas abas, retry de rede) passavam os
-- dois.
--
-- ⚠ ORDEM OBRIGATÓRIA. Rode a PARTE 1 primeiro. O índice NÃO nasce enquanto
--   existir duplicata — e é isso mesmo que deve acontecer: ele está dizendo
--   que há dado a resolver antes.
--
-- ⚠ O QUE SE PERDE: NADA. Esta migration não apaga nem altera uma linha
--   sequer; ela só cria um índice. O que muda é o FUTURO: a partir daqui, uma
--   tentativa de gravar jazigo repetido na mesma quadra falha com erro em vez
--   de criar a cópia.
--   COMO CONFERIR ANTES: a consulta 1.1 lista exatamente o que hoje impede o
--   índice de existir. Se ela voltar vazia, não há nada a perder nem a decidir.
-- ============================================================================

-- ============================================================================
-- PARTE 1 — O QUE PRECISA SER RESOLVIDO ANTES (só SELECT)
-- ============================================================================

-- 1.1 — As duplicatas de verdade: mesma identificação, mesma quadra.
--       A comparação é a mesma do índice: sem espaços nas pontas, sem
--       diferenciar maiúsculas — então "45", "45 " e "45" contam como iguais.
--
--       COMO RESOLVER CADA LINHA (pelo painel, sem SQL):
--         · abra /painel/jazigos e procure a identificação;
--         · a tela mostra a FOTO ao lado de cada registro — foi feita para isto;
--         · se forem o MESMO túmulo, apague a cópia que não tem serviço nem
--           plano (a coluna abaixo diz qual é);
--         · se forem túmulos DIFERENTES (acontece: mesmo número em ruas
--           diferentes), renomeie um deles incluindo a rua, ex.: "45-R3".
select q.codigo                                  as quadra,
       upper(btrim(t.identificacao))             as jazigo,
       count(*)                                  as copias,
       array_agg(t.id)                           as ids,
       array_agg(coalesce(c.nome, '(sem família)')) as familias,
       array_agg((select count(*) from servicos s where s.tumulo_id = t.id)) as servicos_de_cada,
       array_agg((select count(*) from planos  p where p.tumulo_id = t.id)) as planos_de_cada,
       array_agg(t.rua)                          as ruas
  from tumulos t
  join quadras q on q.id = t.quadra_id
  left join clientes c on c.id = t.cliente_id
 group by q.codigo, upper(btrim(t.identificacao))
having count(*) > 1
 order by copias desc, quadra;

-- 1.2 — Os que estão no balde "S/Q" e têm gêmeo numa quadra de verdade.
--       Estes são os que o código passou a evitar (o cadastro pela ficha sem
--       quadra agora procura no cemitério inteiro), mas os que já existem
--       continuam lá. Cada linha é quase certamente o MESMO túmulo em dois
--       registros: um com a foto do campo, outro com a família.
select sq.id            as id_no_sq,
       sq.identificacao,
       sq.cliente_id    as familia_no_sq,
       real.id          as id_na_quadra,
       qreal.codigo     as quadra_real,
       real.cliente_id  as familia_na_quadra,
       (real.foto_referencia_url is not null) as o_da_quadra_tem_foto,
       (real.lat is not null)                 as o_da_quadra_tem_gps
  from tumulos sq
  join quadras qsq on qsq.id = sq.quadra_id and btrim(qsq.codigo) = 'S/Q'
  join tumulos real on upper(btrim(real.identificacao)) = upper(btrim(sq.identificacao))
                   and real.id <> sq.id
  join quadras qreal on qreal.id = real.quadra_id
                    and qreal.cemiterio_id = qsq.cemiterio_id
                    and btrim(qreal.codigo) <> 'S/Q'
 order by sq.identificacao;

-- ============================================================================
-- PARTE 2 — O ÍNDICE
--
-- Rode só depois de 1.1 voltar VAZIA.
-- Se der erro "could not create unique index", ainda há duplicata: volte à 1.1.
-- ============================================================================

-- Índice FUNCIONAL, não de coluna crua: normaliza espaços e maiúsculas, então
-- "L-128", "l-128 " e "L-128" passam a ser o mesmo jazigo para o banco — que é
-- como são no mundo real. Um índice comum sobre a coluna deixaria essas três
-- variações conviverem, e a duplicata voltaria pela porta da digitação.
create unique index if not exists uq_tumulo_quadra_identificacao
  on tumulos (quadra_id, upper(btrim(identificacao)));

comment on index uq_tumulo_quadra_identificacao is
  'Dois jazigos não podem ter a mesma identificação na mesma quadra. Comparação sem espaços nas pontas e sem diferenciar maiúsculas.';

-- ============================================================================
-- PARTE 3 — CONFIRA DEPOIS
-- ============================================================================

-- 3.1 — O índice existe?  (tem que voltar UMA linha)
select indexname, indexdef
  from pg_indexes
 where tablename = 'tumulos' and indexname = 'uq_tumulo_quadra_identificacao';

-- 3.2 — Teste honesto: tente criar uma cópia de propósito e veja o banco
--       recusar. Troque os dois valores pelos de um jazigo que exista.
--       Está dentro de um rollback: NADA é gravado, mesmo se passar.
--
-- begin;
--   insert into tumulos (org_id, quadra_id, identificacao)
--   select org_id, quadra_id, lower(identificacao) || ' '
--     from tumulos limit 1;
--   -- esperado: ERRO de chave duplicada
-- rollback;

-- 3.3 — Quantos ainda estão sem quadra. Não é erro, é trabalho de campo a
--       fazer: cada um destes é um jazigo que a rota do dia não sabe ordenar.
select count(*) as jazigos_sem_quadra
  from tumulos t join quadras q on q.id = t.quadra_id
 where btrim(q.codigo) = 'S/Q';
