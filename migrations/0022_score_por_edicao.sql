-- ============================================================================
-- 0022 · O score aprende mais rápido com as correções
--
-- Antes toda ação movia o score com o mesmo peso (alpha 0.25). Mas as ações
-- não valem o mesmo: quando a Sureya ENVIA DIRETO, é o sinal mais forte de que
-- a IA acertou; quando DESCARTA, é o sinal mais forte de que errou.
-- Editar é meio-termo — e o quanto ela mexeu no texto importa.
-- ============================================================================
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
  v_alpha   numeric;
  v_rascunho text;
  v_semelhanca numeric;
begin
  update interacoes_ia
     set acao_humana = p_acao,
         texto_final = coalesce(p_texto_final, texto_final)
   where id = p_interacao
     and org_id = current_org_id()
  returning cliente_id, rascunho into v_cliente, v_rascunho;

  if v_cliente is null then
    raise exception 'interacao_ia % nao encontrada nesta org', p_interacao;
  end if;

  -- quanto do texto original sobreviveu à edição? (0 = reescreveu tudo)
  v_semelhanca := case
    when p_acao <> 'editou' or p_texto_final is null or v_rascunho is null then null
    when length(v_rascunho) = 0 then 0
    else greatest(0, least(1,
      1 - (levenshtein(left(v_rascunho, 255), left(p_texto_final, 255))::numeric
           / greatest(length(left(v_rascunho, 255)), 1))))
  end;

  v_outcome := case p_acao
                 when 'enviou_direto' then 100     -- acertou em cheio
                 when 'aprovou'       then 95
                 when 'editou'        then round(30 + coalesce(v_semelhanca, 0.5) * 55)
                 when 'descartou'     then 0
               end;

  -- peso da observação: sinais fortes movem mais
  v_alpha := case p_acao
               when 'enviou_direto' then 0.30
               when 'aprovou'       then 0.25
               when 'editou'        then 0.20
               when 'descartou'     then 0.40      -- errar pesa mais que acertar
             end;

  select score into v_score from clientes where id = v_cliente;
  v_score := round(coalesce(v_score,0) * (1 - v_alpha) + v_outcome * v_alpha, 2);

  update clientes set
    score = v_score,
    perfil_ia_msgs = perfil_ia_msgs + 1     -- marca que há material novo para destilar
  where id = v_cliente;

  return v_score;
end $$;
