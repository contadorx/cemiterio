-- =====================================================================
-- 0084 · A PRINCIPAL EM TODAS AS QUADRAS, E AS RUAS PARTIDAS COSTURADAS
-- =====================================================================
--
-- O QUE SE MEDIU ANTES DE MEXER
-- Levantamento das 41 ruas cadastradas:
--
--   · "Principal" existia SÓ na Quadra 1. As Quadras 2, 3 e 4 não tinham.
--     Mas a Principal é a avenida do meio: ela margeia as quatro quadras.
--     Quem cadastra um jazigo na Principal do lado da Quadra 3 não achava
--     a rua na lista, e acabava pendurando o jazigo em outra.
--
--   · DOZE ruas atravessam duas quadras cada e estavam SEM `chave_fisica`:
--         Rua 1 a Rua 6   -> Quadra 1 + Quadra 2
--         Rua 8 a Rua 13  -> Quadra 3 + Quadra 4
--     São a mesma rua no chão, cortada ao meio pela Principal. Sem chave,
--     `ordenarPorEndereco` (src/lib/agenda.ts) trata cada metade como uma
--     parada diferente: a Nina desce a Rua 3 do lado da Quadra 1, vai
--     embora, e volta na Rua 3 do lado da Quadra 2 mais tarde. Vaivém na
--     mesma rua, e são 78 dos 127 túmulos cadastrados.
--
--     A Rua 7 e as seis Transversais já tinham chave desde a 0051. Estas
--     doze ficaram de fora porque na época ainda não estavam cadastradas.
--
-- A GEOMETRIA (o que a 0051 já documentava, escrita por extenso)
--
--          Ruas 1..6          |          Ruas 1..6
--             Quadra 1        |        Quadra 2
--        ================ Rua 7 ================
--             Quadra 3        |        Quadra 4
--          Ruas 8..13         |         Ruas 8..13
--                        ^ Principal
--
--   A Rua 7 é a divisa horizontal: um lado é da Quadra 1, o outro da 3
--   (chave `rua7-direita`); do outro lado da Principal, Quadra 2 e 4
--   (`rua7-esquerda`). As Transversais correm na vertical, da Rua 1 até a
--   Rua 13, cruzando a Rua 7 — por isso cada uma vale por duas quadras.
--   E as Ruas 1..6 / 8..13 correm na horizontal, cortadas pela Principal.
--
-- O QUE ESTA MIGRATION FAZ
--   1. cria "Principal" nas quadras que não têm, com a mesma cara da que
--      já existe na Quadra 1 (tipo `principal`, ordem 0);
--   2. dá `chave_fisica = 'principal'` às quatro — é uma avenida só;
--   3. dá `chave_fisica = 'rua-N'` às doze ruas partidas.
--
-- O QUE ELA NÃO FAZ
--   Não mexe na Rua 7 nem nas Transversais: as chaves delas foram uma
--   decisão da 0051 e continuam valendo.
--   Não renumera `ordem_na_rua`. Ver a NOTA no fim do arquivo.
--
-- EFEITO NO ROTEIRO DE HOJE: NENHUM.
--   Quadra 2 e Quadra 4 estão com zero túmulos (todo o cadastro está na 1
--   e na 3). Os grupos novos têm uma metade só. A costura passa a valer
--   sozinha conforme os jazigos do outro lado forem entrando.
--
-- Banco limpo não é erro: sem quadras cadastradas o bloco não faz nada.
-- =====================================================================

do $$
declare
  r_q record;
  n int;
begin
  -- ------------------------------------------------------------------
  -- 1 e 2 · A PRINCIPAL EM TODAS AS QUADRAS
  -- ------------------------------------------------------------------
  for r_q in
    select q.id, q.codigo, q.org_id, q.cemiterio_id
      from quadras q
     where not exists (
             select 1 from ruas r
              where r.quadra_id = q.id and r.nome = 'Principal')
     order by q.cemiterio_id, q.ordem
  loop
    -- Ordem 0 é o lugar da Principal: é por ela que se entra. Nas Quadras
    -- 3 e 4 a Rua 7 ocupa o 0 (decisão da 0051 — subindo o cemitério ela é
    -- a primeira que se encontra). Empurra todo mundo um passo para abrir
    -- a vaga, PRESERVANDO a ordem relativa: o roteiro não muda.
    if exists (select 1 from ruas r where r.quadra_id = r_q.id and r.ordem <= 0) then
      update ruas set ordem = ordem + 1 where quadra_id = r_q.id;
    end if;

    insert into ruas (org_id, cemiterio_id, quadra_id, nome, tipo, ordem, observacao)
    values (r_q.org_id, r_q.cemiterio_id, r_q.id, 'Principal', 'principal', 0,
            'Avenida do meio. Mesma via física nas quatro quadras: percorrida uma vez só.')
    on conflict (quadra_id, nome) do nothing;
  end loop;

  -- A Principal é UMA avenida, não quatro. Vale também para a da Quadra 1,
  -- que existia desde o cadastro à mão e nunca teve chave.
  update ruas set chave_fisica = 'principal'
   where nome = 'Principal' and chave_fisica is distinct from 'principal';

  -- ------------------------------------------------------------------
  -- 3 · AS DOZE RUAS PARTIDAS PELA PRINCIPAL
  -- ------------------------------------------------------------------
  -- A Rua 7 fica de fora: as duas metades dela já têm chave própria, e são
  -- LADOS da divisa, não continuação uma da outra.
  for n in 1..13 loop
    if n <> 7 then
      update ruas set chave_fisica = 'rua-' || n
       where nome = 'Rua ' || n
         and chave_fisica is distinct from 'rua-' || n;
    end if;
  end loop;
end $$;

-- =====================================================================
-- CONFERÊNCIA — cada chave com as quadras que ela costura
-- =====================================================================
-- select r.chave_fisica,
--        string_agg(q.codigo, ' + ' order by q.ordem) as metades,
--        count(*) as pedacos
--   from ruas r join quadras q on q.id = r.quadra_id
--  where r.chave_fisica is not null
--  group by r.chave_fisica
--  order by r.chave_fisica;
--
-- Esperado: `principal` com as 4 quadras; `rua-1`..`rua-6` com Quadra 1+2;
-- `rua-8`..`rua-13` com Quadra 3+4; `rua7-direita` 1+3; `rua7-esquerda` 2+4;
-- `transversal-1..3` 1+3; `transversal-4..6` 2+4.
--
-- =====================================================================
-- NOTA — `ordem_na_rua` ainda é contada por metade, não pela rua inteira
-- =====================================================================
-- `ordem_na_rua` é atribuída por `rua_id` (src/app/api/tumulos/route.ts),
-- ou seja, por METADE. Quando a Quadra 2 e a Quadra 4 forem cadastradas,
-- as duas metades de uma rua costurada vão numerar cada uma do começo e
-- `ordenarPorEndereco` vai intercalá-las ao ordenar a parada.
--
-- Isso NÃO é novo desta migration: já acontece hoje na `transversal-3`,
-- cujas metades ocupam 400..700 (Quadra 1) e 50..700 (Quadra 3).
--
-- Não corrigi aqui porque a correção depende de um fato do cemitério que o
-- banco não sabe: numa rua cortada pela Principal as metades vêm uma DEPOIS
-- da outra (ordenar por quadra e depois por posição), enquanto na Rua 7 e
-- nas Transversais as metades são os dois LADOS da mesma via, percorridos
-- juntos (ordenar só por posição, intercalando de propósito). Está anotado
-- em PENDENCIAS.md.
--
-- Segunda anotação: as chaves são texto solto e o índice é por org
-- (`idx_ruas_chave_fisica`), não por cemitério. Com dois cemitérios na mesma
-- org, uma "Rua 3" em cada um cairia na mesma chave e o roteiro costuraria
-- as duas. Vale para as chaves da 0051 também. Enquanto houver um cemitério
-- só, não morde — está em PENDENCIAS.md.
