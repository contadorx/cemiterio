-- Os chamados de quem está com sessão aberta. O e-mail NÃO vem por parâmetro:
-- vem do JWT do link mágico. Aceitar um e-mail aqui deixaria qualquer pessoa
-- ler os chamados de qualquer outra escrevendo o endereço dela.
create or replace function walkstamp.meus_chamados(p_email text)
returns jsonb
language sql security definer set search_path to 'walkstamp','public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'numero', numero, 'tipo', tipo, 'status', status,
           'texto', left(texto, 240), 'resposta', resposta,
           'criado_em', criado_em) order by criado_em desc), '[]'::jsonb)
    from (select * from walkstamp.recado
           where email = lower(btrim(coalesce(p_email,''))) and coalesce(p_email,'') <> ''
           order by criado_em desc limit 20) u;
$$;

create or replace function public.walkstamp_meus_chamados(p_email text)
returns jsonb language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.meus_chamados(p_email); $$;

revoke all on function public.walkstamp_meus_chamados(text) from public, anon;
grant execute on function public.walkstamp_meus_chamados(text) to service_role;
