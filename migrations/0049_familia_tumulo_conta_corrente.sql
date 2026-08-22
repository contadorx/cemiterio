-- =====================================================================
-- 0049 · FAMÍLIA, TÚMULO E CONTA CORRENTE
-- =====================================================================
--
-- Três correções de modelagem que vêm juntas porque dependem uma da outra.
--
-- 1. A FAMÍLIA TEM MAIS DE UMA PESSOA
--    Hoje `clientes` é uma pessoa só, com um telefone. Na vida real quem
--    paga é o filho, mas quem acompanha é a neta. A cobrança precisa ir
--    para um; o carinho pode ir para vários.
--
-- 2. OS TRÊS ATRIBUTOS DO TÚMULO SÃO INDEPENDENTES
--    valor por lavagem · periodicidade da limpeza · frequência de pagamento
--    Um túmulo pode ser limpo toda semana e pago por mês. Outro, limpo por
--    mês e pago uma vez por ano. Tratar isso como uma coisa só é o que faz
--    serviço ser executado sem cobrança correspondente.
--
-- 3. A COBRANÇA É POR COMPETÊNCIA, NÃO POR EXECUÇÃO
--    A lavagem pode falhar: a foto não sobe, o celular fica sem sinal, a
--    Nina esquece de tocar no botão. Se o débito dependesse do registro do
--    serviço, uma falha no campo viraria dinheiro perdido em silêncio.
--    Por isso o débito é lançado pela COMPETÊNCIA (o período devido), e não
--    pelo serviço executado. O financeiro nunca fica refém do operacional.
--
-- SEGURANÇA: só cria e adiciona. Rodar duas vezes é inofensivo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Famílias e suas pessoas
-- ---------------------------------------------------------------------
create table if not exists familias (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  nome        text not null,                    -- "Família Silva"
  observacoes text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_familias_org on familias (org_id, nome);

alter table familias enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='familias' and policyname='familias_por_org') then
    create policy familias_por_org on familias
      using (org_id in (select org_id from membros where user_id = auth.uid()));
  end if;
end $$;

-- A pessoa continua sendo `clientes` — não criamos tabela nova para não
-- migrar o que já funciona. Ela só ganha o vínculo com a família e a marca
-- de quem paga.
alter table clientes add column if not exists familia_id uuid references familias(id) on delete set null;
alter table clientes add column if not exists responsavel_financeiro boolean not null default false;
alter table clientes add column if not exists parentesco text;              -- "filho", "neta"
alter table clientes add column if not exists recebe_fotos boolean not null default true;

create index if not exists idx_clientes_familia on clientes (org_id, familia_id);

-- Só UM responsável financeiro por família. O índice garante no banco o que
-- a tela promete — sem isso, dois responsáveis geram cobrança duplicada.
create unique index if not exists idx_familia_um_responsavel
  on clientes (familia_id) where responsavel_financeiro = true;

-- O túmulo passa a pertencer à FAMÍLIA. A coluna `cliente_id` antiga fica
-- para trás como histórico e NÃO é apagada.
alter table tumulos add column if not exists familia_id uuid references familias(id) on delete set null;
create index if not exists idx_tumulos_familia on tumulos (org_id, familia_id);

-- ---------------------------------------------------------------------
-- 2. Os três atributos, no túmulo
-- ---------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname='sureya_freq_pagamento') then
    create type sureya_freq_pagamento as enum ('mensal','trimestral','semestral','anual');
  end if;
end $$;

alter table tumulos add column if not exists valor_lavagem numeric(10,2);
alter table tumulos add column if not exists periodicidade sureya_cadencia;          -- semanal, quinzenal, mensal...
alter table tumulos add column if not exists freq_pagamento sureya_freq_pagamento;
alter table tumulos add column if not exists contratado boolean not null default false;

-- AVULSO: túmulo cadastrado, ligado à família, SEM plano.
-- `contratado = false` e periodicidade nula. Ele nunca gera competência;
-- a lavagem dele entra na conta corrente como débito único.
comment on column tumulos.contratado is
  'false = avulso: sem periodicidade, sem competência automática. A lavagem vira débito único na conta corrente.';

-- ---------------------------------------------------------------------
-- 3. Conta corrente da família
-- ---------------------------------------------------------------------
-- Lavagem lança débito. Pagamento lança crédito. O saldo diz se está em dia.
do $$ begin
  if not exists (select 1 from pg_type where typname='sureya_tipo_lancamento') then
    create type sureya_tipo_lancamento as enum ('debito','credito');
  end if;
  if not exists (select 1 from pg_type where typname='sureya_origem_lancamento') then
    create type sureya_origem_lancamento as enum ('competencia','avulso','pagamento','ajuste');
  end if;
end $$;

create table if not exists conta_corrente (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id) on delete cascade,
  familia_id   uuid not null references familias(id) on delete cascade,
  tumulo_id    uuid references tumulos(id) on delete set null,   -- null = ajuste da família
  tipo         sureya_tipo_lancamento not null,
  origem       sureya_origem_lancamento not null,

  -- A COMPETÊNCIA. Primeiro dia do período devido: '2026-03-01' para março.
  -- É ela que impede a cobrança em duplicidade — ver o índice único abaixo.
  -- Nula em pagamento, avulso e ajuste, que não pertencem a um período.
  competencia  date,

  valor        numeric(10,2) not null,
  descricao    text,
  comprovante_id uuid references comprovantes(id) on delete set null,
  data         date not null default current_date,
  created_at   timestamptz not null default now()
);

create index if not exists idx_cc_familia on conta_corrente (org_id, familia_id, data);
create index if not exists idx_cc_tumulo  on conta_corrente (org_id, tumulo_id, competencia);

-- A TRAVA CONTRA COBRAR DUAS VEZES.
-- Um túmulo só pode ter UM débito de competência por período. Se o gerador
-- rodar duas vezes no mesmo mês — por engano, por cron repetido, por clique
-- duplo — o segundo insert é recusado pelo banco, não pela tela.
create unique index if not exists idx_cc_competencia_unica
  on conta_corrente (tumulo_id, competencia)
  where origem = 'competencia';

alter table conta_corrente enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='conta_corrente' and policyname='cc_por_org') then
    create policy cc_por_org on conta_corrente
      using (org_id in (select org_id from membros where user_id = auth.uid()));
  end if;
end $$;

-- Saldo da família: positivo = deve. Negativo = crédito a favor dela.
create or replace view saldo_familia as
select
  familia_id,
  org_id,
  sum(case when tipo = 'debito' then valor else -valor end) as saldo,
  max(data) filter (where tipo = 'credito')                 as ultimo_pagamento
from conta_corrente
group by familia_id, org_id;

-- =====================================================================
-- CONFERÊNCIA
-- =====================================================================
-- select f.nome, s.saldo from saldo_familia s join familias f on f.id = s.familia_id
--  where s.saldo > 0 order by s.saldo desc;
