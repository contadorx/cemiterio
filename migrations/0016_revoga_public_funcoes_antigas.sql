-- ============================================================================
-- 0016 · As funções das migrations 0001–0006 nasceram sem "revoke from public",
-- então PUBLIC mantinha EXECUTE e o anon herdava. Revogar de anon não bastava.
-- (já aplicado em produção)
-- ============================================================================
revoke execute on function current_org_id()                                        from public, anon;
revoke execute on function sureya_registrar_acao_ia(uuid, sureya_acao_humana, text) from public, anon;
revoke execute on function sureya_conciliar_comprovante(uuid, boolean)             from public, anon;
revoke execute on function sureya_registrar_pagamento_manual(uuid, numeric, date, text) from public, anon;
revoke execute on function sureya_aplicar_reajuste(uuid, numeric, text)            from public, anon;

grant execute on function current_org_id()                                         to authenticated;
grant execute on function sureya_registrar_acao_ia(uuid, sureya_acao_humana, text)  to authenticated;
grant execute on function sureya_conciliar_comprovante(uuid, boolean)              to authenticated;
grant execute on function sureya_registrar_pagamento_manual(uuid, numeric, date, text) to authenticated;
grant execute on function sureya_aplicar_reajuste(uuid, numeric, text)             to authenticated;
grant execute on function current_org_id() to service_role;
