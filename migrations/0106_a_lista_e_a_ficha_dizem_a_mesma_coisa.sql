-- 0106 — A LISTA E A FICHA DIZEM A MESMA COISA
--
-- O DEFEITO, como o usuário viu
--   Abriu a família BRUNIERA. A FICHA diz:
--       "Conferência do cadastro · conferida em 23/08/2026 · Nada obrigatório
--        faltando" · regime Contrato · R$ 30/mês · toda semana ·
--        cobrar a partir de 09/2026 · próxima cobrança 09/2026 ·
--        início dos agendamentos 31/08/2026 · Situação: Em dia
--   A LISTA, da mesma família, no mesmo minuto:
--       "iniciar controle" · "sem plano" ·
--        "Sem data de lavagem · Sem data de cobrança" · Falta contrato (1)
--
--   Nada está quebrado nos dados. As duas telas fazem contas DIFERENTES sobre
--   os MESMOS fatos — que é o defeito mais caro que este sistema já teve, e o
--   terceiro em quatro semanas com esta exata forma:
--     0092  o contador e o movedor da agenda discordavam, e o aviso nunca zerava
--     0105  o painel do mês, cujos cartões podiam discordar entre si
--     aqui  a lista e a ficha
--
-- A CAUSA
--   A lista deriva a etapa assim (src/app/api/clientes/route.ts):
--
--     contratoOk = fam.contratado && fam.valor_mensal > 0
--                  && fam.freq_pagamento && fam.inicio_cobranca
--                  && algum tumulo.contratado com periodicidade
--
--   Ela pergunta à FAMÍLIA o valor, a frequência e o início. Só que a D-24
--   moveu o contrato para o TÚMULO ("tem famílias com N túmulos, então todo o
--   saldo de lavagens e dinheiros é do túmulo"), e a 0100/0104 completaram a
--   mudança. Medido na BRUNIERA:
--
--     familias.valor_mensal     null      tumulos.valor_mensal      30,00
--     familias.freq_pagamento   null      tumulos.periodicidade     semanal
--     familias.inicio_cobranca  null      tumulos.proxima_cobranca  2026-09-01
--
--   Três das quatro condições olham para campos que a decisão esvaziou. Por
--   isso "falta contrato" numa família cujo contrato está completo.
--
--   E "sem plano · Sem data de lavagem · Sem data de cobrança" vem de outra
--   herança: a lista lê a tabela `planos`, que tem ZERO linhas para esta
--   família. O ritmo e as datas moram no túmulo desde a 0100.
--
-- A CORREÇÃO
--   Uma definição, no banco, que a lista e qualquer outra tela consultam. Não
--   é gosto por SQL: enquanto a regra viver dentro de uma tela, a próxima tela
--   escreve a sua — e volta o mesmo defeito com outra roupa.
--
--   Ela também respeita o REGIME (0097/0101), coisa que a conta da lista nunca
--   fez: sob `avulso` não se exige contrato nenhum, e exigir era transformar
--   uma escolha legítima em pendência permanente.

begin;

create or replace function public.sureya_etapas_das_familias(p_org uuid default null)
returns table(
  familia_id uuid,
  etapa text,
  contrato_ok boolean,
  falta text,
  jazigos integer,
  mensal numeric,
  cadencias text[],
  proxima_lavagem date,
  proxima_cobranca date,
  servicos integer,
  conferida_em timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with org as (select coalesce(p_org, current_org_id()) as id),
  base as (
    select f.id, f.regime::text as regime, f.conferida_em,
           (select count(*) from tumulos t where t.familia_id = f.id) as jazigos,
           -- CONTRATO COMPLETO É DO TÚMULO: valor combinado, ritmo e a data da
           -- próxima cobrança. Os três no mesmo jazigo — ter valor num e ritmo
           -- noutro não é um contrato, são dois pela metade.
           (select count(*) from tumulos t
             where t.familia_id = f.id and t.contratado
               and coalesce(t.valor_mensal,0) > 0
               and t.periodicidade is not null
               and t.proxima_cobranca is not null) as contratados_completos,
           (select count(*) from tumulos t
             where t.familia_id = f.id and coalesce(t.valor_lavagem,0) > 0) as com_preco_avulso,
           (select coalesce(sum(t.valor_mensal), 0) from tumulos t
             where t.familia_id = f.id and t.contratado) as mensal,
           (select array_agg(distinct t.periodicidade::text)
              filter (where t.periodicidade is not null)
              from tumulos t where t.familia_id = f.id) as cadencias,
           -- A PRÓXIMA LIMPEZA é a agendada de verdade. Só quando não há
           -- nenhuma é que vale a data em que a rota começa: uma promete, a
           -- outra é o combinado.
           (select min(s.data_prevista) from servicos s
              join tumulos t on t.id = s.tumulo_id
             where t.familia_id = f.id and s.status in ('pendente','agendado')
               and s.data_prevista >= current_date) as proximo_servico,
           (select min(t.inicio_agendamento) from tumulos t
             where t.familia_id = f.id and t.inicio_agendamento >= current_date) as inicio_rota,
           (select min(t.proxima_cobranca) from tumulos t
             where t.familia_id = f.id and t.contratado
               and t.proxima_cobranca is not null) as proxima_cobranca,
           (select count(*) from servicos s
              join tumulos t on t.id = s.tumulo_id
             where t.familia_id = f.id and s.status = 'executado'
               and s.estornado_em is null) as executados
      from familias f, org
     where f.org_id = org.id
  ),
  julgado as (
    select b.*,
           -- O REGIME MANDA. Avulso não tem mensalidade para faltar: o que
           -- ele precisa é do preço de uma ida. Cobrar contrato de quem
           -- escolheu avulso fazia a família nascer com uma pendência que
           -- nunca se resolveria.
           case b.regime
             when 'contrato' then b.contratados_completos > 0
             when 'avulso'   then b.com_preco_avulso > 0
             else false
           end as ok
      from base b
  )
  select
    j.id,
    case
      when j.jazigos = 0 then 'sem_tumulo'
      when not j.ok     then 'sem_contrato'
      when j.executados > 0 then 'operacional'
      else 'pronta'
    end as etapa,
    j.ok,
    -- QUAL É O PRÓXIMO PASSO, em português. "Falta contrato" não diz o que
    -- fazer; "falta o valor combinado" diz. É a diferença entre um rótulo de
    -- estado e uma tarefa.
    case
      when j.jazigos = 0 then 'ligar um jazigo a esta família'
      when j.regime = 'nao_definido' then 'dizer se é contrato ou avulso'
      when j.regime = 'avulso' and j.com_preco_avulso = 0 then 'informar o valor de uma limpeza avulsa'
      when j.regime = 'contrato' and j.contratados_completos = 0 then 'completar valor, ritmo e próxima cobrança no jazigo'
      else null
    end as falta,
    j.jazigos::int,
    j.mensal,
    coalesce(j.cadencias, '{}'::text[]),
    coalesce(j.proximo_servico, j.inicio_rota),
    j.proxima_cobranca,
    j.executados::int,
    j.conferida_em
  from julgado j;
$$;

revoke all on function public.sureya_etapas_das_familias(uuid) from public, anon;
grant execute on function public.sureya_etapas_das_familias(uuid) to authenticated, service_role;

commit;
