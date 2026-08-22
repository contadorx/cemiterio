-- ============================================================================
-- SUREYA — 0075 · O FUNIL DO DINHEIRO, E UM FECHAMENTO QUE PODE DIZER NÃO
--
-- O QUE O ROADMAP PEDE
-- ---------------------------------------------------------------------------
--   5. Implementar funil: a identificar → a conciliar → em aberto →
--      pronto para fechar → fechado.
--   6. Criar relatório de divergência e impedir fechamento enquanto houver
--      diferença.
--
-- O BURACO QUE APARECEU AO IR FAZER
-- ---------------------------------------------------------------------------
-- A tela de fechamento existe e gera a cobrança do mês. Mas **não existe
-- registro de que um mês foi fechado.** Nenhuma tabela, nenhuma coluna.
--
-- Sem isso, "fechado" não é um estado — é uma lembrança de quem apertou o
-- botão. Rodar o fechamento duas vezes não tem como ser barrado, reabrir um mês
-- não tem como ser auditado, e a última etapa do funil não tem o que mostrar.
--
-- POR QUE O FECHAMENTO PRECISA PODER RECUSAR
-- ---------------------------------------------------------------------------
-- Fechar mês é dizer "esta é a conta". Fechar com uma limpeza executada e não
-- cobrada, ou com dinheiro parado sem dono, é assinar embaixo de um número que
-- ainda vai mudar — e é assim que a operação perde a confiança no sistema: não
-- porque o número estava errado, mas porque ele mudou depois de fechado.
--
-- As quatro divergências abaixo são todas ACIONÁVEIS: cada uma tem uma tela
-- onde se resolve. Nenhuma delas é "erro do sistema" — são trabalho pendente.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) O mês fechado vira um fato
-- ----------------------------------------------------------------------------
create table if not exists competencias (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  -- Sempre o dia 1º. A restrição existe para não haver duas competências
  -- "agosto" com dias diferentes, que é o tipo de duplicata que só aparece
  -- quando os números já não batem.
  competencia   date not null,
  fechada_em    timestamptz not null default now(),
  fechada_por   uuid,
  -- O retrato do momento do fechamento. Guardado, não recalculado: o valor de
  -- um fechamento é justamente não mudar depois.
  familias      int,
  total_cobrado numeric(12,2),
  total_aberto  numeric(12,2),
  observacao    text,
  reaberta_em   timestamptz,
  reaberta_por  uuid,
  motivo_reabertura text,
  constraint competencias_dia_primeiro check (extract(day from competencia) = 1),
  constraint competencias_unica unique (org_id, competencia)
);

comment on table competencias is
  'Um mes fechado e um FATO, com data, autor e o retrato dos numeros daquele '
  'momento. Antes da 0075 fechar era so apertar um botao: nao dava para saber '
  'se ja tinha sido feito, nem auditar reabertura.';

alter table competencias enable row level security;
drop policy if exists competencias_org on competencias;
create policy competencias_org on competencias
  for all using (org_id = current_org_id()) with check (org_id = current_org_id());
drop policy if exists competencias_so_admin_escreve on competencias;
create policy competencias_so_admin_escreve on competencias
  as restrictive for all
  using (current_member_role() is not distinct from 'admin'::sureya_papel_membro
         or auth.uid() is null)
  with check (current_member_role() is not distinct from 'admin'::sureya_papel_membro
              or auth.uid() is null);


-- ----------------------------------------------------------------------------
-- 2) O que impede um mês de fechar
--
-- Quatro perguntas, cada uma com uma tela onde se resolve. Devolve UMA LINHA
-- por tipo de pendência, com a contagem e o valor — porque "3 limpezas sem
-- cobrança, R$ 165,00" é acionável e "há divergências" não é.
-- ----------------------------------------------------------------------------
create or replace function public.sureya_pendencias_da_competencia(p_competencia date)
returns table(tipo text, descricao text, quantidade bigint, valor numeric, onde_resolver text)
language sql
security definer
set search_path to 'public'
as $function$
  with lim as (
    select date_trunc('month', p_competencia)::date                       as ini,
           (date_trunc('month', p_competencia) + interval '1 month' - interval '1 day')::date                                    as fim
  )
  -- (a) Limpeza feita e nao cobrada. Em `competencia` a lavagem lanca zero de
  --     proposito (0073), entao so vale para quem e cobrado por consumo.
  select 'lavagem_sem_cobranca'::text,
         'Limpezas executadas que nao viraram cobranca'::text,
         count(*)::bigint,
         coalesce(sum(coalesce(s.valor, t.valor_lavagem, 0)), 0)::numeric,
         '/painel/agenda'::text
    from servicos s
    join lim on true
    left join tumulos  t on t.id = s.tumulo_id
    left join familias f on f.id = t.familia_id
   where s.org_id = current_org_id()
     and s.status::text = 'executado'
     and s.data_executada::date between lim.ini and lim.fim
     and coalesce(f.modo_cobranca::text, 'consumo') = 'consumo'
     and not exists (select 1 from conta_corrente l
                      where l.servico_id = s.id and l.tipo = 'debito')
  having count(*) > 0

  union all
  -- (b) Comprovante informado e nao conferido: dinheiro em suspenso. Fechar com
  --     isso pendente e fechar um numero que ainda vai mudar.
  select 'a_conciliar',
         'Comprovantes informados e ainda nao conferidos',
         count(*)::bigint,
         coalesce(sum(l.valor), 0)::numeric,
         '/painel/financeiro'
    from conta_corrente l, lim
   where l.org_id = current_org_id()
     and l.status_conc = 'a_conferir'
     and l.data between lim.ini and lim.fim
  having count(*) > 0

  union all
  -- (c) Dinheiro no banco sem dono.
  select 'a_identificar',
         'Entradas no banco sem familia identificada',
         count(*)::bigint,
         coalesce(sum(e.valor), 0)::numeric,
         '/painel/financeiro'
    from entradas_banco e, lim
   where e.org_id = current_org_id()
     and e.identificada_em is null
     and e.data between lim.ini and lim.fim
  having count(*) > 0

  union all
  -- (d) Cobranca lancada para servico que nao foi executado. O contrario de
  --     (a), e mais grave: e cobrar por trabalho que nao houve.
  select 'cobranca_sem_lavagem',
         'Cobrancas de limpeza sem o servico executado',
         count(*)::bigint,
         coalesce(sum(l.valor), 0)::numeric,
         '/painel/financeiro'
    from conta_corrente l
    join lim on true
    left join servicos s on s.id = l.servico_id
   where l.org_id = current_org_id()
     and l.origem = 'lavagem'
     and l.valor > 0
     and l.data between lim.ini and lim.fim
     and (s.id is null or s.status::text <> 'executado')
  having count(*) > 0;
$function$;

comment on function public.sureya_pendencias_da_competencia is
  'O que impede a competencia de fechar, com contagem, valor e a tela onde se '
  'resolve. Vazia = pronto para fechar.';


-- ----------------------------------------------------------------------------
-- 3) O funil, em cinco etapas
--
-- As tres primeiras são do dinheiro andando; as duas últimas, do mês. Numa
-- consulta só, porque a pergunta que a responsável faz é uma só: "o que falta
-- para eu fechar o mês?".
-- ----------------------------------------------------------------------------
create or replace function public.sureya_funil(p_competencia date)
returns table(etapa text, ordem int, quantidade bigint, valor numeric, onde text)
language sql
security definer
set search_path to 'public'
as $function$
  with lim as (
    select date_trunc('month', p_competencia)::date as ini,
           (date_trunc('month', p_competencia) + interval '1 month' - interval '1 day')::date              as fim
  ),
  saldos as (
    select l.familia_id,
           sum(case when l.tipo::text = 'credito' then l.valor else -l.valor end) as saldo
      from conta_corrente l, lim
     where l.org_id = current_org_id()
       and l.status_conc = 'confirmado'
       and l.data <= lim.fim            -- a foto no fim da competencia (CA-02)
     group by l.familia_id
  )
  select 'a identificar'::text, 1,
         count(*)::bigint, coalesce(sum(e.valor),0)::numeric, '/painel/financeiro'::text
    from entradas_banco e, lim
   where e.org_id = current_org_id() and e.identificada_em is null
     and e.data between lim.ini and lim.fim

  union all
  select 'a conciliar', 2,
         count(*)::bigint, coalesce(sum(l.valor),0)::numeric, '/painel/financeiro'
    from conta_corrente l, lim
   where l.org_id = current_org_id() and l.status_conc = 'a_conferir'
     and l.data between lim.ini and lim.fim

  union all
  select 'em aberto', 3,
         count(*)::bigint, coalesce(sum(-s.saldo),0)::numeric, '/painel/clientes?situacao=atrasados'
    from saldos s where s.saldo < -0.005

  union all
  -- "Pronto para fechar" nao e uma contagem de coisas: e um sim ou nao. 1 = o
  -- mes acabou e nao ha pendencia; 0 = ainda nao da.
  select 'pronto para fechar', 4,
         case when (select count(*) from sureya_pendencias_da_competencia(p_competencia)) = 0
               and (select fim from lim) < current_date
               and not exists (select 1 from competencias c
                                where c.org_id = current_org_id()
                                  and c.competencia = date_trunc('month', p_competencia)::date
                                  and c.reaberta_em is null)
              then 1 else 0 end::bigint,
         (select coalesce(sum(valor),0) from sureya_pendencias_da_competencia(p_competencia)),
         '/painel/fechamento'

  union all
  select 'fechado', 5,
         count(*)::bigint, coalesce(max(c.total_cobrado),0)::numeric, '/painel/fechamento'
    from competencias c
   where c.org_id = current_org_id()
     and c.competencia = date_trunc('month', p_competencia)::date
     and c.reaberta_em is null

  order by 2;
$function$;

comment on function public.sureya_funil is
  'As cinco etapas do dinheiro numa competencia. "em aberto" usa a foto do FIM '
  'do mes, nao o saldo de hoje — mesma correcao do CA-02.';


-- ----------------------------------------------------------------------------
-- 4) Fechar — e recusar quando não dá
-- ----------------------------------------------------------------------------
create or replace function public.sureya_fechar_competencia(
  p_competencia date, p_observacao text default null, p_forcar boolean default false
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org   uuid := current_org_id();
  v_comp  date := date_trunc('month', p_competencia)::date;
  v_fim   date := (date_trunc('month', p_competencia) + interval '1 month' - interval '1 day')::date;
  v_pend  int;
  v_lista text;
  v_id    uuid;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;
  if v_org is null then raise exception 'sem_org'; end if;

  -- MES QUE NAO ACABOU NAO FECHA. Nem com `p_forcar`: forcar existe para passar
  -- por cima de pendencia que a responsavel decidiu aceitar, nao para inventar
  -- o resultado de um mes que ainda esta correndo.
  if v_fim >= current_date then
    raise exception 'competencia_em_andamento';
  end if;

  if exists (select 1 from competencias c
              where c.org_id = v_org and c.competencia = v_comp and c.reaberta_em is null) then
    raise exception 'competencia_ja_fechada';
  end if;

  select count(*), string_agg(descricao || ' (' || quantidade || ')', '; ')
    into v_pend, v_lista
    from sureya_pendencias_da_competencia(v_comp);

  if v_pend > 0 and not p_forcar then
    -- A MENSAGEM CARREGA O MOTIVO. "Nao foi possivel fechar" manda a pessoa
    -- procurar; dizer o que falta manda ela resolver.
    raise exception 'ha_pendencias: %', v_lista;
  end if;

  insert into competencias (org_id, competencia, fechada_por, familias,
                            total_cobrado, total_aberto, observacao)
  select v_org, v_comp, auth.uid(),
         (select count(distinct familia_id) from conta_corrente
           where org_id = v_org and data between v_comp and v_fim),
         (select coalesce(sum(valor),0) from conta_corrente
           where org_id = v_org and tipo = 'debito'
             and status_conc = 'confirmado' and data between v_comp and v_fim),
         (select coalesce(sum(-saldo),0) from (
            select familia_id, sum(case when tipo::text='credito' then valor else -valor end) as saldo
              from conta_corrente
             where org_id = v_org and status_conc = 'confirmado' and data <= v_fim
             group by familia_id) x where saldo < -0.005),
         coalesce(p_observacao, case when v_pend > 0 then 'FECHADA COM PENDENCIA: ' || v_lista end)
  returning id into v_id;

  return v_id;
end
$function$;

-- Reabrir e legitimo — errar o mes e humano. O que nao pode e reabrir sem
-- deixar rastro, que era a situacao anterior a esta migration (nao havia nem o
-- que reabrir).
create or replace function public.sureya_reabrir_competencia(
  p_competencia date, p_motivo text
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid := current_org_id();
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'somente_admin' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo),'') = '' then raise exception 'motivo_obrigatorio'; end if;

  update competencias
     set reaberta_em = now(), reaberta_por = auth.uid(), motivo_reabertura = p_motivo
   where org_id = v_org
     and competencia = date_trunc('month', p_competencia)::date
     and reaberta_em is null;
  return found;
end
$function$;

revoke execute on function public.sureya_pendencias_da_competencia(date) from public, anon;
revoke execute on function public.sureya_funil(date) from public, anon;
revoke execute on function public.sureya_fechar_competencia(date, text, boolean) from public, anon;
revoke execute on function public.sureya_reabrir_competencia(date, text) from public, anon;

commit;
