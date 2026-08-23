-- ============================================================================
-- SUREYA — 0083 · IDADE DE LAVAGEM E URGÊNCIA
--
-- Itens 1 e 2 de `GESTAO_ROTEIRO.md`. A avaliação inteira está lá; aqui fica só
-- o que o código precisa saber.
--
-- POR QUE URGÊNCIA E NÃO IDADE
-- ---------------------------------------------------------------------------
-- Idade sozinha engana. Um túmulo mensal com 40 dias está atrasado; um anual
-- com 300 está em dia. Ordenar a carteira por idade põe o anual na frente.
--
--     urgencia = idade_em_dias / intervalo_contratado_em_dias
--
-- É um número só, comparável entre contratos diferentes. `1,0` é o dia do
-- vencimento; `2,0` é o dobro do combinado — o ponto em que vira reclamação.
--
-- DE QUANDO CONTA A IDADE DE QUEM NUNCA FOI LAVADO
-- ---------------------------------------------------------------------------
-- São **123 de 124** túmulos. A decisão (GESTAO_ROTEIRO §4) é: **do início do
-- contrato**, porque é o que define a obrigação e a família paga desde ali. E
-- quando a família disser uma data melhor — "a última limpeza foi em março" —
-- essa data manda.
--
-- Daí a coluna nova: `ultima_lavagem_informada`. Ela não é palpite do sistema, é
-- o que alguém ouviu da família, e por isso ganha campo próprio em vez de ser
-- enfiada como um serviço executado que nunca houve.
--
-- A CASCATA, EM ORDEM DE CONFIANÇA
-- ---------------------------------------------------------------------------
--   1. a última lavagem REGISTRADA no sistema        (fato)
--   2. a data que a família informou                 (relato)
--   3. o início do contrato da família               (obrigação)
--   4. o cadastro do túmulo                          (último recurso)
--
-- Cada linha diz de onde veio o número, para ninguém confundir fato com
-- estimativa olhando a tela.
-- ============================================================================

begin;

alter table tumulos
  add column if not exists ultima_lavagem_informada date;

comment on column tumulos.ultima_lavagem_informada is
  'A data que a FAMILIA informou como ultima limpeza, antes de o sistema '
  'existir. Nao e palpite do sistema — e relato, e por isso tem campo proprio '
  'em vez de virar um servico executado que nunca houve.';


-- ----------------------------------------------------------------------------
-- A idade e a urgência de cada jazigo
--
-- Uma linha por túmulo, com de ONDE veio a idade. Sem isso, o dia em que o
-- número estiver estranho ninguém sabe se é fato ou estimativa.
-- ----------------------------------------------------------------------------
create or replace view sureya_urgencia_jazigos as
with base as (
  select t.id,
         t.org_id,
         t.identificacao,
         t.familia_id,
         t.contratado,
         t.periodicidade::text                              as periodicidade,
         q.codigo                                           as quadra,
         t.rua,
         t.ordem_na_rua,
         t.valor_lavagem,
         t.ultima_lavagem_informada,
         t.created_at::date                                 as cadastrado_em,
         f.inicio_cobranca,
         (select max(s.data_executada::date) from servicos s
           where s.tumulo_id = t.id and s.data_executada is not null) as ultima_lavagem_real
    from tumulos t
    left join quadras  q on q.id = t.quadra_id
    left join familias f on f.id = t.familia_id
   where t.org_id = current_org_id()
),
datada as (
  select b.*,
         -- A CASCATA. `coalesce` na ordem de confiança.
         coalesce(b.ultima_lavagem_real,
                  b.ultima_lavagem_informada,
                  b.inicio_cobranca,
                  b.cadastrado_em)                          as desde,
         case
           when b.ultima_lavagem_real     is not null then 'lavagem registrada'
           when b.ultima_lavagem_informada is not null then 'informado pela familia'
           when b.inicio_cobranca         is not null then 'inicio do contrato'
           else 'cadastro do jazigo'
         end                                                as origem_da_idade,
         -- Sem periodicidade não há intervalo, e sem intervalo não há urgência:
         -- devolve nulo em vez de inventar um mensal que ninguém contratou.
         case when b.periodicidade is null then null
              else sureya_intervalo_dias(b.periodicidade, 1) end as intervalo_dias
    from base b
)
select d.id                                                 as tumulo_id,
       d.identificacao,
       d.quadra,
       d.rua,
       d.ordem_na_rua,
       d.familia_id,
       d.contratado,
       d.periodicidade,
       d.valor_lavagem,
       d.desde                                              as ultima_lavagem,
       d.origem_da_idade,
       (current_date - d.desde)                             as idade_dias,
       d.intervalo_dias,
       case when d.intervalo_dias is null or d.intervalo_dias = 0 then null
            else round((current_date - d.desde)::numeric / d.intervalo_dias, 2)
       end                                                  as urgencia,
       case when d.intervalo_dias is null then null
            else d.desde + d.intervalo_dias
       end                                                  as vence_em,
       case
         when not d.contratado                              then 'sem contrato'
         when d.intervalo_dias is null                      then 'sem periodicidade'
         when (current_date - d.desde) >= d.intervalo_dias * 2 then 'MUITO ATRASADO'
         when (current_date - d.desde) >= d.intervalo_dias     then 'atrasado'
         when (current_date - d.desde) >= d.intervalo_dias * 0.8 then 'chegando a hora'
         else 'em dia'
       end                                                  as situacao
  from datada d;

comment on view sureya_urgencia_jazigos is
  'Idade e urgencia de cada jazigo. urgencia = idade / intervalo contratado — um '
  'numero so, comparavel entre contratos diferentes: 1,0 e o vencimento, 2,0 e o '
  'dobro do combinado. `origem_da_idade` diz se o numero e fato ou estimativa.';

commit;


-- ============================================================================
-- COMO OLHAR
--
--   -- o que fazer primeiro
--   select identificacao, quadra, rua, idade_dias, urgencia, situacao
--     from sureya_urgencia_jazigos
--    where contratado and urgencia is not null
--    order by urgencia desc nulls last;
--
--   -- quantos estao em cada situacao
--   select situacao, count(*) from sureya_urgencia_jazigos group by 1 order by 2 desc;
--
--   -- de onde vem a idade (hoje quase tudo e estimativa, nao fato)
--   select origem_da_idade, count(*) from sureya_urgencia_jazigos group by 1;
-- ============================================================================
