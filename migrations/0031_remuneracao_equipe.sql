-- 0031 — Remuneracao da equipe: por mes, por jazigo, ou os dois
-- ---------------------------------------------------------------------------
-- O PROBLEMA (do Leandro, 01/08):
--   "estou entre pagar pelo mes como agora e dar um valor adicional para os
--    novos... valor por lavagem e tipo de pagamento no mes ou por jazigo nele,
--    com um relatorio mensal, inclusive permitindo comparar o que seria a
--    remuneracao mensal ou por jazigo e ainda acrescentar os adicionais ao
--    mensal."
--
-- A DECISAO DE DESENHO:
--   Nada de escolher UM modelo agora. O sistema guarda a REGRA de cada pessoa e
--   CONGELA no servico quanto ela ganhou por aquele jazigo — do mesmo jeito que
--   servicos.valor ja congela o que a familia paga. Assim voce muda a regra de
--   novembro sem reescrever o que foi pago em agosto.
--
--   Como a tarifa justa ainda nao apareceu ("as cobrancas ainda nao convergiram
--   para um valor justo"), o valor por jazigo pode ser R$ FIXO ou PERCENTUAL da
--   receita daquele servico. Trocar de um para o outro e um clique + recalcular.
--
--   membro_id NULO = a REGRA GERAL DA CASA. Vale para quem nao tem regra
--   propria. E o "permita uma regra geral tambem" do pedido.
--
-- ESTE ARQUIVO NAO MEXE EM NADA QUE JA EXISTE. So cria tabela e colunas novas.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- PARTE A — a regra de cada pessoa (e a da casa)
-- ===========================================================================
create table if not exists remuneracao_regras (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,

  -- NULO = regra geral da casa (vale para quem nao tem a propria)
  membro_id uuid references auth.users(id) on delete cascade,

  -- 'mensal'            = so o fixo do mes (o de hoje)
  -- 'por_jazigo'        = so por lavagem feita
  -- 'mensal_mais_jazigo'= o fixo do mes MAIS o valor por lavagem
  modo text not null default 'mensal'
    check (modo in ('mensal', 'por_jazigo', 'mensal_mais_jazigo')),

  valor_mensal numeric(10,2) not null default 0,

  -- como se calcula o valor da lavagem
  -- 'fixo'       = valor_por_jazigo em reais
  -- 'percentual' = percentual_receita % do que a familia paga naquele servico
  base_jazigo text not null default 'fixo'
    check (base_jazigo in ('fixo', 'percentual')),
  valor_por_jazigo   numeric(10,2) not null default 0,
  percentual_receita numeric(5,2)  not null default 0,

  -- true = o valor por jazigo so vale para servico AVULSO (sem plano periodico).
  -- E o "pagar pelo mes como agora e dar um adicional para os novos".
  so_avulso boolean not null default false,

  observacao   text,
  atualizado_em timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- uma regra por pessoa, e UMA UNICA regra geral por org
create unique index if not exists uq_remuneracao_membro
  on remuneracao_regras(org_id, membro_id) where membro_id is not null;
create unique index if not exists uq_remuneracao_geral
  on remuneracao_regras(org_id) where membro_id is null;

alter table remuneracao_regras enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies
                  where tablename = 'remuneracao_regras' and policyname = 'remuneracao_regras_org') then
    create policy remuneracao_regras_org on remuneracao_regras
      using (org_id = current_org_id()) with check (org_id = current_org_id());
  end if;
end $$;

comment on table remuneracao_regras is
  'Quanto cada pessoa da equipe ganha. membro_id nulo = regra geral da casa.';


-- ===========================================================================
-- PARTE B — o quanto ela ganhou NAQUELE jazigo, congelado
-- ===========================================================================
-- Congelar e o ponto todo: a regra muda, o historico nao. Mesmo principio de
-- servicos.valor (o que a familia paga fica gravado no servico).
alter table servicos add column if not exists valor_executora    numeric(10,2);
alter table servicos add column if not exists pago_executora_em  timestamptz;
alter table servicos add column if not exists pago_executora_lote uuid;

comment on column servicos.valor_executora is
  'Quanto a executora ganha por ESTE servico, congelado na conclusao pela regra vigente. Nulo = regra so mensal, ou servico anterior a 0031.';
comment on column servicos.pago_executora_em is
  'Quando este servico entrou num acerto pago. Nulo = ainda a pagar.';

create index if not exists idx_servicos_pago_executora
  on servicos(org_id, executora_id, pago_executora_em);


-- ===========================================================================
-- PARTE C — categoria de saida do acerto (se ainda nao existir)
-- ===========================================================================
-- O acerto lanca uma SAIDA no caixa. Se voce ja tem uma categoria com nome
-- parecido, o codigo acha a sua e usa; este insert e so a rede de seguranca.
insert into categorias_financeiras (org_id, nome, tipo, grupo, ativa)
select o.id, 'Pagamento da equipe', 'saida', 'pessoal', true
  from orgs o
 where not exists (
   select 1 from categorias_financeiras c
    where c.org_id = o.id and lower(c.nome) like '%equipe%' and c.tipo = 'saida'
 );


-- ---------------------------------------------------------------------------
-- CONFERENCIA (opcional, so leitura)
-- ---------------------------------------------------------------------------
-- select * from remuneracao_regras;
-- select id, data_prevista, status, valor, valor_executora, pago_executora_em
--   from servicos where status = 'executado' order by data_executada desc limit 20;
