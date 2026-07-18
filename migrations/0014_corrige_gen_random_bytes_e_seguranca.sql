-- ============================================================================
-- 0014 · CORREÇÕES DA AUDITORIA (já aplicadas em produção em 18/07/2026)
--
-- BUG 1 (crítico): sureya_emitir_token_portal, sureya_emitir_avaliacao e
--   sureya_gerar_codigo_indicacao usam gen_random_bytes (pgcrypto), mas fixavam
--   search_path=public. No Supabase o pgcrypto vive no schema "extensions",
--   então as 3 falhavam em produção: "function gen_random_bytes does not exist".
--   Efeito: portal da família, avaliação e indicação NÃO funcionavam.
-- BUG 2 (segurança): anon podia executar todas as funções.
-- BUG 3 (aviso): set_updated_at sem search_path fixo.
-- ============================================================================

create or replace function sureya_emitir_token_portal(p_tumulo uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid; v_token text;
begin
  select t.org_id into v_org from tumulos t
   where t.id = p_tumulo and t.org_id = current_org_id();
  if v_org is null then raise exception 'tumulo_nao_encontrado'; end if;
  v_token := encode(extensions.gen_random_bytes(16), 'hex');
  update tumulos set qr_token = v_token where id = p_tumulo;
  return v_token;
end; $$;

create or replace function sureya_emitir_avaliacao(p_servico uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid; v_cliente uuid; v_token text; v_existente text;
begin
  select org_id, cliente_id into v_org, v_cliente
    from servicos where id = p_servico and org_id = current_org_id();
  if v_org is null then raise exception 'servico_nao_encontrado'; end if;
  select token into v_existente from avaliacoes where servico_id = p_servico limit 1;
  if v_existente is not null then return v_existente; end if;
  v_token := encode(extensions.gen_random_bytes(12), 'hex');
  insert into avaliacoes (org_id, cliente_id, servico_id, token)
  values (v_org, v_cliente, p_servico, v_token);
  return v_token;
end; $$;

create or replace function sureya_gerar_codigo_indicacao(p_cliente uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_cod text; v_org uuid;
begin
  select org_id, codigo_indicacao into v_org, v_cod
    from clientes where id = p_cliente and org_id = current_org_id();
  if v_org is null then raise exception 'cliente_nao_encontrado'; end if;
  if v_cod is not null then return v_cod; end if;
  v_cod := upper(left(encode(extensions.gen_random_bytes(6),'hex'), 8));
  update clientes set codigo_indicacao = v_cod where id = p_cliente;
  return v_cod;
end; $$;

create or replace function set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

revoke execute on function current_org_id()                                   from anon;
revoke execute on function sureya_anonimizar_cliente(uuid)                    from anon;
revoke execute on function sureya_aplicar_reajuste(uuid, numeric, text)       from anon;
revoke execute on function sureya_conciliar_comprovante(uuid, boolean)        from anon;
revoke execute on function sureya_emitir_avaliacao(uuid)                      from anon;
revoke execute on function sureya_emitir_token_portal(uuid)                   from anon;
revoke execute on function sureya_revogar_token_portal(uuid)                  from anon;
revoke execute on function sureya_fechar_dia(uuid, date, text, text)          from anon;
revoke execute on function sureya_gerar_codigo_indicacao(uuid)                from anon;
revoke execute on function sureya_puxar_servicos(uuid, int)                   from anon;
revoke execute on function sureya_registrar_acao_ia(uuid, sureya_acao_humana, text) from anon;
revoke execute on function sureya_registrar_consentimento(uuid, text)         from anon;
revoke execute on function sureya_registrar_gps(uuid, double precision, double precision, double precision, text) from anon;
revoke execute on function sureya_registrar_pagamento_manual(uuid, numeric, date, text) from anon;
revoke execute on function sureya_registrar_uso_ia(uuid)                      from anon;

grant execute on function sureya_emitir_token_portal(uuid)    to authenticated;
grant execute on function sureya_emitir_avaliacao(uuid)       to authenticated;
grant execute on function sureya_gerar_codigo_indicacao(uuid) to authenticated;
