-- CORREÇÃO DE SEGURANÇA.
--
-- A migração anterior dizia `revoke ... from anon, authenticated` e eu escrevi
-- um comentário afirmando que a fechadura estava posta. Não estava: no Postgres
-- toda função nasce com EXECUTE concedido a PUBLIC, e revogar de `anon` não
-- tira o que ele herda de PUBLIC. As duas funções continuaram chamáveis com a
-- chave publicável — isto é, por qualquer pessoa que abrisse o HTML do site.
--
-- O que estava aberto, e o que dava para fazer com isso:
--
--   walkstamp_conta_do_usuario(email)   ler faturas, chamados e time de QUALQUER
--                                       e-mail, bastando saber o endereço
--   walkstamp_assinatura_da_stripe(...) dar a si mesmo o plano pago, sem pagar
--   walkstamp_meus_chamados(email)      ler os chamados alheios (exigia login,
--   walkstamp_perfil_do_usuario(email)  e login é de graça)
--
-- O jeito certo é revogar de PUBLIC e conceder só a quem precisa.

revoke execute on function public.walkstamp_conta_do_usuario(text) from public;
revoke execute on function public.walkstamp_assinatura_da_stripe(text,text,text,text,text,integer,integer) from public;
revoke execute on function public.walkstamp_meus_chamados(text) from public, anon, authenticated;
revoke execute on function public.walkstamp_perfil_do_usuario(text) from public, anon, authenticated;

grant execute on function public.walkstamp_conta_do_usuario(text) to service_role;
grant execute on function public.walkstamp_assinatura_da_stripe(text,text,text,text,text,integer,integer) to service_role;
grant execute on function public.walkstamp_meus_chamados(text) to service_role;
grant execute on function public.walkstamp_perfil_do_usuario(text) to service_role;

/* A trava. Uma migração que "revoga" e não revoga é pior que nenhuma: ela
   produz um comentário tranquilizador em cima de um buraco. Esta conta o que
   ficou aberto e derruba a migração se sobrar alguma. */
do $$
declare aberta text;
begin
  select string_agg(p.proname, ', ') into aberta
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('walkstamp_conta_do_usuario','walkstamp_assinatura_da_stripe',
                      'walkstamp_meus_chamados','walkstamp_perfil_do_usuario',
                      'walkstamp_plano_de','walkstamp_registrar_emissao',
                      'walkstamp_fatura_da_stripe','walkstamp_time_painel',
                      'walkstamp_time_convidar','walkstamp_time_bloquear',
                      'walkstamp_time_ajustar','walkstamp_time_config','walkstamp_time_modelo')
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if aberta is not null then
    raise exception 'estas funções continuam abertas para o navegador: %', aberta;
  end if;
end $$;
