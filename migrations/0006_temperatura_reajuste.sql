-- ============================================================================
-- SUREYA — Migration 0006 · Temperatura de aumento
-- Campo de IPCA estimado + RPC que aplica o reajuste registrando o histórico.
-- ============================================================================

-- inflação anual estimada usada p/ corrigir preços defasados (ajustável)
alter table orgs add column if not exists ipca_anual_estimado numeric not null default 0.045;
comment on column orgs.ipca_anual_estimado is 'IPCA anual estimado p/ correção de preços (ex.: 0.045 = 4,5% a.a.)';

-- Aplica o novo valor no plano e guarda o histórico. Atômico e com RLS.
create or replace function sureya_aplicar_reajuste(
  p_plano      uuid,
  p_novo_valor numeric,
  p_motivo     text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_org uuid;
  v_ant numeric;
  v_cli uuid;
begin
  select org_id, valor_vigente, cliente_id
    into v_org, v_ant, v_cli
    from planos
   where id = p_plano and org_id = current_org_id();

  if v_org is null then
    raise exception 'plano % nao encontrado nesta org', p_plano;
  end if;

  insert into reajustes (org_id, plano_id, cliente_id, valor_anterior, valor_novo, motivo, aprovado_por)
  values (v_org, p_plano, v_cli, v_ant, p_novo_valor, coalesce(p_motivo, 'Reajuste'), auth.uid());

  update planos
     set valor_vigente = p_novo_valor,
         data_valor_vigente = current_date
   where id = p_plano;
end $$;

-- ============================================================================
-- FIM 0006.
-- ============================================================================
