-- 0032 — Agenda: acabar com o mesmo jazigo repetido
-- ---------------------------------------------------------------------------
-- O QUE ACONTECEU (Leandro, 01/08): "rodei uma agenda e veio 3 vezes o mesmo
-- jazigo, nao sei se apertei 3 vezes ou erro".
--
-- E erro. Os dois geradores (gerar o mes / gerar N dias) evitavam duplicata
-- perguntando "ja existe servico deste plano na data X?" — usando a coluna
-- data_prevista. So que o ALOCADOR, que roda logo depois, REESCREVE
-- data_prevista com o dia da rota. Na rodada seguinte o gerador procura pela
-- data teorica, nao acha mais nada, e insere de novo. Apertar 3 vezes = 3
-- copias, e o "gerar o mes" nem avanca o proximo_servico do plano, entao ele
-- dependia 100% dessa checagem quebrada.
--
-- A CORRECAO: separar as duas datas.
--   data_plano    = a data TEORICA do plano. Nasce com o servico e ninguem
--                   mais encosta nela. E a chave de unicidade.
--   data_prevista = o dia da rota. Continua sendo do alocador, pode mudar
--                   quantas vezes quiser.
--
-- ORDEM IMPORTA: limpar as duplicatas ANTES de criar o indice unico, senao a
-- criacao do indice falha.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- PARTE 0 — DIAGNOSTICO (so leitura; rode antes se quiser ver o estrago)
-- ===========================================================================
-- Planos com mais de um servico ABERTO no mesmo dia = duplicata certa:
--
--   select plano_id, data_prevista, count(*) as copias,
--          array_agg(id order by created_at) as ids
--     from servicos
--    where plano_id is not null
--      and status in ('pendente','agendado')
--    group by plano_id, data_prevista
--   having count(*) > 1
--    order by copias desc;
--
-- Duplicatas "de perto" (mesmo plano, servicos abertos a menos de 7 dias um do
-- outro) — normalmente tambem sao copias, mas estas NAO sao apagadas aqui:
--
--   select a.plano_id, a.id, a.data_prevista, b.id, b.data_prevista
--     from servicos a join servicos b
--       on a.plano_id = b.plano_id and a.id < b.id
--      and abs(a.data_prevista - b.data_prevista) <= 7
--    where a.status in ('pendente','agendado')
--      and b.status in ('pendente','agendado');


-- ===========================================================================
-- PARTE A — a data teorica do plano, que o alocador nao toca
-- ===========================================================================
alter table servicos add column if not exists data_plano date;

comment on column servicos.data_plano is
  'Data TEORICA do ciclo do plano. Congelada na criacao — o alocador so mexe em data_prevista. E a chave anti-duplicata.';


-- ===========================================================================
-- PARTE B — limpar o que ja duplicou (mantem o mais antigo de cada grupo)
-- ===========================================================================
-- So mexe em servico ABERTO (pendente/agendado) e sem foto/execucao. Nada de
-- historico e apagado.
with dup as (
  select id,
         row_number() over (
           partition by org_id, plano_id, data_prevista
           order by created_at, id
         ) as n
    from servicos
   where plano_id is not null
     and status in ('pendente','agendado')
)
delete from servicos s
 using dup
 where s.id = dup.id
   and dup.n > 1;


-- ===========================================================================
-- PARTE C — preencher a data teorica do que ja existe
-- ===========================================================================
-- Para o historico nao da para recuperar a data teorica original (o alocador ja
-- sobrescreveu). Usamos a data_prevista atual: serve como chave dali para
-- frente, que e o que importa.
update servicos
   set data_plano = data_prevista
 where data_plano is null
   and plano_id is not null
   and data_prevista is not null;


-- ===========================================================================
-- PARTE D — a garantia de verdade, no banco
-- ===========================================================================
-- Codigo com bug pode voltar; indice unico nao deixa passar. So vale para
-- servico ABERTO: depois de executado, o registro sai do indice e o historico
-- fica livre.
create unique index if not exists uq_servico_plano_data_aberto
  on servicos (org_id, plano_id, data_plano)
  where plano_id is not null
    and data_plano is not null
    and status in ('pendente','agendado');

create index if not exists idx_servicos_plano_data_plano
  on servicos (org_id, plano_id, data_plano);


-- ---------------------------------------------------------------------------
-- CONFERENCIA (so leitura)
-- ---------------------------------------------------------------------------
-- Tem que voltar ZERO linhas:
--   select plano_id, data_plano, count(*)
--     from servicos
--    where plano_id is not null and status in ('pendente','agendado')
--    group by plano_id, data_plano having count(*) > 1;
--
-- E a agenda do mes, para olhar:
--   select data_prevista, data_plano, status, tumulo_id
--     from servicos where status in ('pendente','agendado')
--    order by data_prevista, ordem_dia;
