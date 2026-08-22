-- ============================================================================
-- SUREYA — Migration 0013 · Localização que melhora com o uso
--
-- Problema: GPS de celular erra de 3 a 10 metros; túmulos ficam a 1-2 metros.
-- Uma leitura só nunca é confiável. Solução: cada visita registra uma LEITURA,
-- e a posição do túmulo passa a ser a MÉDIA PONDERADA pela precisão de cada uma
-- (leitura boa pesa mais que leitura ruim). Quanto mais a Nina passa, melhor fica.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Leituras individuais (histórico auditável)
-- ----------------------------------------------------------------------------
create table if not exists gps_leituras (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  tumulo_id     uuid not null references tumulos(id) on delete cascade,
  lat           double precision not null,
  lng           double precision not null,
  precisao      double precision,           -- em metros, vindo do aparelho
  origem        text not null default 'confirmacao',  -- 'confirmacao' | 'conclusao'
  registrada_por uuid,
  created_at    timestamptz not null default now()
);
create index if not exists idx_gps_leituras_tumulo on gps_leituras(tumulo_id, created_at desc);
alter table gps_leituras enable row level security;
create policy gps_leituras_org on gps_leituras
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ----------------------------------------------------------------------------
-- Qualidade da posição consolidada no túmulo
-- ----------------------------------------------------------------------------
alter table tumulos add column if not exists gps_precisao       double precision; -- precisão estimada da média (m)
alter table tumulos add column if not exists gps_amostras       int not null default 0;
alter table tumulos add column if not exists gps_atualizado_em  timestamptz;
alter table tumulos add column if not exists foto_enquadramento_url text;         -- foto de longe (localiza)
-- foto_referencia_url continua sendo o close da lápide (confirma)

-- ----------------------------------------------------------------------------
-- Registra uma leitura e recalcula a posição do túmulo.
--
-- Média ponderada por 1/precisão²: é o peso estatisticamente correto — uma
-- leitura de 4m vale ~6x mais que uma de 10m. Leituras muito ruins (>30m) são
-- descartadas na entrada. A precisão resultante melhora com a raiz do número
-- de amostras, então 4 leituras boas valem o dobro de 1.
-- ----------------------------------------------------------------------------
create or replace function sureya_registrar_gps(
  p_tumulo   uuid,
  p_lat      double precision,
  p_lng      double precision,
  p_precisao double precision,
  p_origem   text default 'confirmacao'
)
returns table (lat double precision, lng double precision, precisao double precision, amostras int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_lat double precision;
  v_lng double precision;
  v_prec double precision;
  v_n   int;
  v_soma_peso double precision;
begin
  v_org := current_org_id();
  if v_org is null then raise exception 'sem_org'; end if;

  if not exists (select 1 from tumulos where id = p_tumulo and org_id = v_org) then
    raise exception 'tumulo_nao_encontrado';
  end if;

  -- descarta leitura sem precisão informada ou pior que 30 metros
  if p_precisao is null or p_precisao <= 0 or p_precisao > 30 then
    raise exception 'precisao_insuficiente';
  end if;

  insert into gps_leituras (org_id, tumulo_id, lat, lng, precisao, origem, registrada_por)
  values (v_org, p_tumulo, p_lat, p_lng, p_precisao, coalesce(p_origem, 'confirmacao'), auth.uid());

  -- média ponderada por 1/precisão², usando as 20 melhores leituras
  with melhores as (
    select l.lat, l.lng, l.precisao,
           1.0 / (l.precisao * l.precisao) as peso
    from gps_leituras l
    where l.tumulo_id = p_tumulo and l.org_id = v_org
    order by l.precisao asc
    limit 20
  )
  select sum(m.lat * m.peso) / nullif(sum(m.peso), 0),
         sum(m.lng * m.peso) / nullif(sum(m.peso), 0),
         sum(m.peso),
         count(*)
    into v_lat, v_lng, v_soma_peso, v_n
  from melhores m;

  -- precisão da média: 1/raiz(soma dos pesos)
  v_prec := case when v_soma_peso > 0 then 1.0 / sqrt(v_soma_peso) else p_precisao end;

  update tumulos set
    lat = v_lat,
    lng = v_lng,
    gps_precisao = round(v_prec::numeric, 2),
    gps_amostras = v_n,
    gps_atualizado_em = now()
  where id = p_tumulo;

  return query select v_lat, v_lng, round(v_prec::numeric, 2)::double precision, v_n;
end;
$$;
revoke all on function sureya_registrar_gps(uuid, double precision, double precision, double precision, text) from public;
grant execute on function sureya_registrar_gps(uuid, double precision, double precision, double precision, text) to authenticated;

-- ============================================================================
-- FIM 0013.
-- ============================================================================
