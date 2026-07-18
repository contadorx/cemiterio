-- ============================================================================
-- SUREYA — Migration 0002
-- (a) Planos flexíveis: cadência separada de quantidade; avulso; preço no serviço
-- (b) RPC de score: humana age no rascunho -> entendimento sobe (grada p/ auto)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (a) PLANOS FLEXÍVEIS
-- "n_limpezas_ciclo" era ambíguo. Separar os dois eixos:
--   cadencia          = de quanto em quanto tempo passa lá
--   qtd_por_passagem  = quantas limpezas naquela ida (1, 2, 4, ...)
-- Avulso: cadencia='avulso' -> sem proximo_servico, fora do cálculo de carga.
-- valor_vigente do plano vira SUGESTÃO; servicos.valor é a fonte da verdade.
-- ----------------------------------------------------------------------------
alter table planos rename column n_limpezas_ciclo to qtd_por_passagem;
alter table planos alter column qtd_por_passagem set default 1;

comment on column planos.cadencia         is 'de quanto em quanto tempo passa (avulso = sem recorrência)';
comment on column planos.qtd_por_passagem is 'quantas limpezas por ida (1,2,4,...)';
comment on column planos.valor_vigente    is 'preço SUGERIDO por limpeza p/ o próximo recorrente; o cobrado real vive em servicos.valor';
comment on column servicos.valor          is 'fonte da verdade do que foi cobrado (congela o preço do dia; avulso não depende de plano)';

-- planos avulsos não têm próxima data
update planos set proximo_servico = null where cadencia = 'avulso';

-- ----------------------------------------------------------------------------
-- (b) SCORE — média móvel exponencial por cliente.
-- A humana, no painel, resolve cada rascunho da IA (aprovou/editou/descartou).
-- Cada ação move o entendimento daquele contato. 'enviou_direto' = auto (mantém).
-- Só assuntos rotineiros graduam pro automático; luto/reclamação nunca (regra na app).
-- ----------------------------------------------------------------------------
create or replace function sureya_registrar_acao_ia(
  p_interacao   uuid,
  p_acao        sureya_acao_humana,
  p_texto_final text default null
) returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_cliente uuid;
  v_score   numeric;
  v_outcome numeric;
  v_alpha   numeric := 0.25;   -- peso da observação nova
begin
  update interacoes_ia
     set acao_humana = p_acao,
         texto_final = coalesce(p_texto_final, texto_final)
   where id = p_interacao
     and org_id = current_org_id()
  returning cliente_id into v_cliente;

  if v_cliente is null then
    raise exception 'interacao_ia % nao encontrada nesta org', p_interacao;
  end if;

  v_outcome := case p_acao
                 when 'aprovou'      then 100
                 when 'enviou_direto' then 100
                 when 'editou'       then 50
                 when 'descartou'    then 0
               end;

  select score into v_score from clientes where id = v_cliente;
  v_score := round(coalesce(v_score,0) * (1 - v_alpha) + v_outcome * v_alpha, 2);

  update clientes set score = v_score where id = v_cliente;
  return v_score;
end $$;

-- ============================================================================
-- FIM 0002.
-- ============================================================================
