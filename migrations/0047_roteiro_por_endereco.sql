-- =====================================================================
-- 0047 · ROTEIRO POR ENDEREÇO — ruas com ordem de caminhada
-- =====================================================================
--
-- POR QUÊ
-- A ordem do dia era calculada por vizinho-mais-próximo usando lat/lng
-- (src/lib/agenda.ts, ordenarPorProximidade). Dois problemas:
--
--   1. Túmulo sem coordenada ia para o FIM da fila, fora de qualquer rua.
--   2. O GPS não conhece muro. Ele via um túmulo do outro lado da divisa
--      como "próximo em linha reta" e mandava a Nina bater na parede.
--
-- A partir daqui a ordem sai do ENDEREÇO: quadra → rua → posição na rua.
-- O GPS continua sendo capturado no cadastro, mas serve para UMA coisa só:
-- descobrir a POSIÇÃO do túmulo dentro da rua (ver 0048). Nunca para navegar.
--
-- O CEMITÉRIO DA SAUDADE (confirmado com a Sureya)
--   · Rua Principal atravessa da entrada ao fundo.
--   · Quadras 1 e 3 à DIREITA de quem entra; 2 e 4 à ESQUERDA.
--   · Ruas 1 a 13 cruzam a Principal. A Rua 7 é a divisa:
--       ruas 1–6  -> quadras 1 (dir.) e 2 (esq.)
--       ruas 8–13 -> quadras 3 (dir.) e 4 (esq.)
--   · Transversais 1,2,3 do lado direito; 4,5,6 do lado esquerdo.
--   · Transversais 3 e 6 são de borda: só abrem nas ruas 1, 7 e 13.
--     DENTRO de uma quadra isso NÃO é beco — os acessos coincidem com as
--     ruas que delimitam a quadra (1↔7 embaixo, 7↔13 em cima). Então elas
--     são corredores com saída nas duas pontas, e entram na sequência como
--     rua normal. Nenhuma regra especial de ramal é necessária.
--
-- SEGURANÇA
-- Só cria e adiciona. Não apaga coluna, não apaga linha, não mexe em lat/lng.
-- Rodar duas vezes é inofensivo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tipo da rua — muda como ela se comporta no roteiro
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'sureya_tipo_rua') then
    create type sureya_tipo_rua as enum ('principal', 'rua', 'transversal');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Tabela de ruas
-- ---------------------------------------------------------------------
-- A rua pertence a UMA quadra. A "Rua 5" existe na quadra 1 e na quadra 2
-- como dois registros distintos, porque são dois trechos físicos separados
-- pela Principal — e a Nina percorre um de cada vez.
--
-- `ordem` é o campo que manda: é a SEQUÊNCIA EM QUE SE CAMINHA, não o nome.
-- A Rua 7 pode ser a terceira a ser percorrida. A Sureya arruma arrastando
-- na tela, uma vez, e nunca mais mexe.
create table if not exists ruas (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  cemiterio_id  uuid not null references cemiterios(id) on delete cascade,
  quadra_id     uuid not null references quadras(id) on delete cascade,
  nome          text not null,                       -- "Rua 5", "Transversal 3", "Principal"
  tipo          sureya_tipo_rua not null default 'rua',
  ordem         int  not null default 0,             -- sequência da caminhada
  sentido_ida   boolean not null default true,       -- serpentina: ver observação abaixo
  observacao    text,                                -- "acesso só pelas ruas 1, 7 e 13"
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (quadra_id, nome)
);

-- `sentido_ida` guarda o sentido em que a rua é percorrida. A serpentina
-- alterna sozinha no código (rua de ordem par vai ao contrário), mas quando
-- o terreno obriga um sentido fixo, este campo vence.

create index if not exists idx_ruas_rota
  on ruas (org_id, cemiterio_id, quadra_id, ordem);

alter table ruas enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'ruas' and policyname = 'ruas_por_org'
  ) then
    create policy ruas_por_org on ruas
      using (org_id in (select org_id from membros where user_id = auth.uid()));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Ligação do túmulo com a rua
-- ---------------------------------------------------------------------
-- A coluna `tumulos.rua` (texto livre, criada na 0017) continua existindo e
-- NÃO é apagada — ela vira o histórico do que foi digitado à mão. A partir
-- daqui vale `rua_id`.
alter table tumulos add column if not exists rua_id uuid references ruas(id) on delete set null;

-- ---------------------------------------------------------------------
-- POSIÇÃO x IDENTIDADE — duas coisas diferentes, duas colunas diferentes
-- ---------------------------------------------------------------------
-- Este é o ponto mais delicado do modelo, e o motivo de existirem DUAS
-- colunas onde parecia caber uma.
--
-- O cadastro nunca estará completo: um túmulo novo pode aparecer ENTRE dois
-- já cadastrados. Se a posição e o código fossem a mesma coisa, cadastrar
-- esse túmulo do meio renumeraria todos os vizinhos — e o código impresso na
-- ficha, no histórico e nas fotos apontaria para outro túmulo. Silencioso e
-- destrutivo.
--
--   ordem_na_rua  MUDA.  É onde o túmulo está na fila da rua.
--   codigo        NUNCA MUDA. É quem o túmulo é, para sempre.

-- POSIÇÃO — numérica com casas decimais, de propósito.
-- Os túmulos nascem espaçados de 100 em 100 (100, 200, 300...). Um túmulo
-- novo entre o 100 e o 200 recebe 150. Entre o 100 e o 150, recebe 125.
-- Sempre cabe mais um no meio, e NENHUM vizinho é renumerado.
alter table tumulos add column if not exists ordem_na_rua numeric(14,4);

-- IDENTIDADE — "Q1-R5-007". O número é a ORDEM DE CADASTRO naquela rua,
-- não a posição física. É atribuído uma vez e congela ali.
-- Buracos na numeração são normais e esperados: se o 007 for removido, o
-- número 007 morre com ele. Isso é o certo — é um RG, não uma fila.
-- A Nina nunca digita nem procura por isso; ela reconhece pela foto.
alter table tumulos add column if not exists codigo text;

-- Contador de cadastro por rua: guarda quantos túmulos já foram criados ali,
-- incluindo os apagados. Nunca decrementa — é o que garante que um código
-- não seja reaproveitado.
alter table ruas add column if not exists seq_cadastro int not null default 0;

create index if not exists idx_tumulos_sequencia
  on tumulos (org_id, rua_id, ordem_na_rua);

-- Único de verdade: dois túmulos jamais compartilham código.
create unique index if not exists idx_tumulos_codigo_unico
  on tumulos (org_id, codigo) where codigo is not null;

-- ---------------------------------------------------------------------
-- 4. Periodicidade semanal e quinzenal
-- ---------------------------------------------------------------------
-- ESTÁ NO ARQUIVO 0047b, SEPARADO, DE PROPÓSITO.
-- `alter type ... add value` não pode rodar dentro de bloco de transação em
-- boa parte dos ambientes (o editor SQL do Supabase envolve tudo em uma).
-- Misturado aqui, derrubaria a migration inteira. Rode o 0047b sozinho.

-- =====================================================================
-- CONFERÊNCIA — rode depois de aplicar
-- =====================================================================
-- select nome, tipo, ordem, seq_cadastro from ruas order by quadra_id, ordem;
-- select count(*) filter (where rua_id is null) as sem_rua_ainda from tumulos;
--
-- Conferir que ninguém repetiu código:
-- select codigo, count(*) from tumulos where codigo is not null
--  group by codigo having count(*) > 1;
