-- ============================================================================
-- SUREYA — Migration 0003 · Conciliação (adaptador de pagamento)
-- O sistema só conhece "pagamento confirmado". Fontes hoje:
--   (a) comprovante lido pela IA  (b) conferência manual do extrato
-- Amanhã: PSP conciliável chama a mesma porta, sem tocar no resto.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Saldo por cliente: confirmado (definitivo) x a conferir (pendente)
-- security_invoker: a view respeita a RLS de quem consulta (painel logado).
-- ----------------------------------------------------------------------------
create or replace view vw_saldo_cliente
with (security_invoker = on) as
select
  c.id     as cliente_id,
  c.org_id as org_id,
  coalesce(sum(
    case
      when m.status_conc = 'confirmado' and m.tipo = 'credito' then  m.valor
      when m.status_conc = 'confirmado' and m.tipo = 'debito'  then -m.valor
      else 0
    end), 0) as saldo,
  coalesce(sum(
    case when m.status_conc = 'a_conferir' and m.tipo = 'credito' then m.valor else 0 end
  ), 0) as creditos_a_conferir
from clientes c
left join movimentos m on m.cliente_id = c.id
group by c.id, c.org_id;

-- ----------------------------------------------------------------------------
-- Confirmar/rejeitar um comprovante: move o comprovante E o movimento junto.
-- Chamado pelo painel (humano logado). 'aprovar=false' => rejeita ambos.
-- ----------------------------------------------------------------------------
create or replace function sureya_conciliar_comprovante(
  p_comprovante uuid,
  p_aprovar     boolean
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_status sureya_status_conc;
  v_org    uuid;
begin
  v_status := case when p_aprovar then 'confirmado' else 'rejeitado' end;

  update comprovantes
     set status = v_status
   where id = p_comprovante
     and org_id = current_org_id()
  returning org_id into v_org;

  if v_org is null then
    raise exception 'comprovante % nao encontrado nesta org', p_comprovante;
  end if;

  update movimentos
     set status_conc = v_status
   where comprovante_id = p_comprovante
     and org_id = current_org_id();
end $$;

-- ----------------------------------------------------------------------------
-- Pagamento manual (conferência do extrato): entra já confirmado.
-- É a segunda fonte do adaptador — mesma porta, origem diferente.
-- ----------------------------------------------------------------------------
create or replace function sureya_registrar_pagamento_manual(
  p_cliente   uuid,
  p_valor     numeric,
  p_data      date,
  p_descricao text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id  uuid;
  v_org uuid := current_org_id();
begin
  if v_org is null then raise exception 'sem org'; end if;
  -- confere que o cliente é da org
  if not exists (select 1 from clientes where id = p_cliente and org_id = v_org) then
    raise exception 'cliente % nao encontrado nesta org', p_cliente;
  end if;

  insert into movimentos (org_id, cliente_id, tipo, valor, origem, status_conc, descricao, data)
  values (v_org, p_cliente, 'credito', p_valor, 'conciliacao_manual', 'confirmado',
          coalesce(p_descricao, 'Pagamento conferido no extrato'), p_data)
  returning id into v_id;

  return v_id;
end $$;

-- ============================================================================
-- FIM 0003.
-- ============================================================================
