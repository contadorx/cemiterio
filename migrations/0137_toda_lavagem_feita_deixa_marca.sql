-- ============================================================================
-- 0137 — TODA LAVAGEM FEITA DEIXA MARCA
-- ============================================================================
--
-- O QUE SE MEDIU, ANTES DE ESCREVER QUALQUER COISA
--
-- Cinco lavagens executadas em producao. Delas:
--
--   2 de 5   sem `valor`          — a lavagem foi feita e nao tem preco nenhum
--   2 de 5   sem `custo_estimado` — o material nao saiu do estoque
--   5 de 5   sem `valor_executora`— ninguem sabe quanto a Nina ganhou
--   1 de 5   com foto e sem linha na fila_liberacao
--
-- E A CAUSA NAO E UMA SO. Sao duas, e elas se parecem o suficiente para
-- terem passado juntas:
--
-- (a) A PORTA DE TRAS. `POST /api/servico` aceita `dataExecutada` e, com ela,
--     cria o servico JA `executado` — sem passar por `sureya_concluir_lavagem`.
--     E a quarta implementacao do mesmo ato. As outras tres (concluir,
--     concluir-admin, registrar-feito) chamam a transacao; esta escreve a mao.
--     Resultado: nasce sem cascata de valor, sem remuneracao, sem baixa de
--     material e sem fila. E o formato exato das duas linhas quebradas.
--
-- (b) A REGRA QUE NAO EXISTE. `remuneracao_regras` esta VAZIA — zero linhas.
--     A transacao faz `if found` e segue calada. Ela esta certa: nao da para
--     inventar quanto alguem ganha. O defeito e o silencio — o trabalho fica
--     feito, o pagamento fica em aberto, e nenhuma tela diz isso.
--
-- O QUE ESTA MIGRATION FAZ
--
-- So enxergar. Ela nao conserta nada e nao escreve em lugar nenhum: devolve a
-- lista do que ficou pela metade, com o motivo em portugues. O conserto e um
-- toque na tela, e ele chama a propria `sureya_concluir_lavagem` — que desde a
-- 0066 sabe se reparar quando ve um servico ja executado.
--
-- O QUE ELA DE PROPOSITO NAO CHAMA DE DEFEITO
--
--   Lavagem sem foto        registrar a mao uma limpeza antiga e legitimo, e
--                           nao ha foto para mandar. So e defeito quando a
--                           foto EXISTE e a familia nunca a recebeu.
--   Lavagem sem lancamento  desde a 0104 quem gera a divida e a competencia,
--                           nao a lavagem. Cobrar nas duas pontas cobraria a
--                           familia duas vezes. Isto e projeto, nao falha.
--
-- Essa segunda linha desmente o nome que o backlog deu ao item ("lavagem
-- executada que nao virou dinheiro"). O nome estava errado: o dinheiro da
-- familia vem certo pela competencia. O que nao vem e o pagamento da Nina, o
-- preco congelado da lavagem e a baixa do material.
--
-- p_org EXPLICITO: `current_org_id()` e nulo fora de uma sessao de usuario
-- (licao da 0103). Esta funcao precisa servir tambem uma rotina sem sessao.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A LISTA DO QUE FICOU PELA METADE
-- ----------------------------------------------------------------------------
create or replace function sureya_lavagens_incompletas(p_org uuid)
returns table (
  servico_id     uuid,
  data_executada timestamptz,
  tumulo_codigo  text,
  familia_nome   text,
  valor          numeric,
  faltando       text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with regra as (
    -- HA ALGUMA REGRA DE PAGAMENTO NESTA CASA? Se nao ha nenhuma, o
    -- `valor_executora` vazio nao e um defeito de cada lavagem — e uma
    -- configuracao que falta, e apontar 200 lavagens por causa dela seria
    -- transformar um recado em duzentos alarmes.
    select exists (select 1 from remuneracao_regras r where r.org_id = p_org) as tem
  )
  select
    s.id,
    s.data_executada,
    t.codigo,
    f.nome,
    s.valor,
    array_remove(array[
      case when coalesce(s.valor, 0) = 0
           then 'sem preco: a lavagem foi feita e nao tem valor nenhum' end,
      case when s.custo_estimado is null
           then 'material nao baixado do estoque' end,
      case when s.valor_executora is null and (select tem from regra)
           then 'pagamento da equipe nao calculado' end,
      -- So e falta quando a foto EXISTE. Sem foto nao ha o que mandar.
      case when coalesce(s.foto_depois_url, '') <> ''
            and not exists (select 1 from fila_liberacao fl where fl.servico_id = s.id)
           then 'a foto nunca entrou na fila da familia' end
    ], null)
  from servicos s
  left join tumulos  t on t.id = s.tumulo_id
  left join familias f on f.id = t.familia_id
  where s.org_id = p_org
    and s.status::text = 'executado'
    and s.estornado_em is null
    and (
         coalesce(s.valor, 0) = 0
      or s.custo_estimado is null
      or (s.valor_executora is null and exists (select 1 from remuneracao_regras r where r.org_id = p_org))
      or (coalesce(s.foto_depois_url, '') <> ''
          and not exists (select 1 from fila_liberacao fl where fl.servico_id = s.id))
    )
  order by s.data_executada desc;
$$;

comment on function sureya_lavagens_incompletas(uuid) is
  'Lavagens executadas que nao deixaram todas as marcas (0137). So le.';

-- ----------------------------------------------------------------------------
-- O RESUMO, PARA A TELA INICIAL
--
-- Uma segunda contagem sobre os mesmos fatos e o defeito que este projeto mais
-- repete (0092, 0105, 0106, 0115). Por isso o resumo NAO reconta: ele conta as
-- linhas que a funcao acima devolve.
-- ----------------------------------------------------------------------------
create or replace function sureya_lavagens_incompletas_resumo(p_org uuid)
returns table (
  quantas          integer,
  sem_preco        integer,
  sem_regra_equipe boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from sureya_lavagens_incompletas(p_org))::int,
    (select count(*) from sureya_lavagens_incompletas(p_org) l
      where 'sem preco: a lavagem foi feita e nao tem valor nenhum' = any(l.faltando))::int,
    -- A CASA NAO TEM REGRA DE PAGAMENTO NENHUMA.
    --
    -- Recado de configuracao, e nao alarme por lavagem: enquanto ele estiver
    -- ligado, nenhuma lavagem e acusada de "pagamento nao calculado", porque
    -- nao ha com o que calcular. Um so aparece quando o outro se cala.
    not exists (
      select 1 from remuneracao_regras r where r.org_id = p_org
    ) and exists (
      select 1 from servicos s
       where s.org_id = p_org and s.status::text = 'executado' and s.estornado_em is null
    );
$$;

comment on function sureya_lavagens_incompletas_resumo(uuid) is
  'Contagem do 0137 para a tela inicial. Conta as linhas da lista, nao reconta.';

-- ----------------------------------------------------------------------------
-- QUEM PODE CHAMAR
--
-- Funcao SECURITY DEFINER IGNORA RLS: quem executa le a organizacao inteira.
-- O Supabase concede EXECUTE a `anon` por padrao em `public` — migration que
-- nao revoga, PUBLICA (licao da 0129). Estas duas devolvem o nome da familia e
-- o codigo do jazigo; sem o revoke abaixo, qualquer visitante do site leria a
-- lista de clientes pelo endereco publico da API.
-- ----------------------------------------------------------------------------
revoke execute on function sureya_lavagens_incompletas(uuid)        from public, anon;
revoke execute on function sureya_lavagens_incompletas_resumo(uuid) from public, anon;
grant  execute on function sureya_lavagens_incompletas(uuid)        to authenticated, service_role;
grant  execute on function sureya_lavagens_incompletas_resumo(uuid) to authenticated, service_role;
