-- O que a FERRAMENTA puxa quando alguém entra: os padrões do cliente e os
-- modelos de documento. Nada de conteúdo — empresa, logotipo, rótulo, ambiente.
--
-- É a metade que faltava de duas features que estavam meio prontas: o portal
-- já cadastrava e a ferramenta ainda não consumia.
create or replace function walkstamp.perfil_do_usuario(p_email text)
returns jsonb
language plpgsql security definer set search_path to 'walkstamp','public'
as $$
declare
  e text := lower(btrim(coalesce(p_email,'')));
  u walkstamp.usuario%rowtype;
  c walkstamp.cliente%rowtype;
begin
  select * into u from walkstamp.usuario where email = e;
  if not found or u.cliente_id is null then
    return jsonb_build_object('cliente', null, 'config', null, 'modelos', '[]'::jsonb);
  end if;
  select * into c from walkstamp.cliente where id = u.cliente_id and ativo;
  if not found then
    return jsonb_build_object('cliente', null, 'config', null, 'modelos', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'cliente', c.nome, 'plano', c.plano, 'papel', u.papel,
    'vence_em', u.vence_em,
    'config', (select coalesce(to_jsonb(cf) - 'cliente_id' - 'atualizado_em', '{}'::jsonb)
                 from walkstamp.config cf where cf.cliente_id = c.id),
    /* Os modelos do time, mais os que a própria pessoa marcou como "só para
       mim". O escopo `personal` de OUTRA pessoa não aparece aqui — ele é dela. */
    'modelos', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', m.id, 'nome', m.nome, 'escopo', m.escopo, 'dados', m.dados)
                  order by m.nome), '[]'::jsonb)
                  from walkstamp.modelo_doc m where m.cliente_id = c.id));
end $$;

create or replace function public.walkstamp_perfil_do_usuario(p_email text)
returns jsonb language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.perfil_do_usuario(p_email); $$;

revoke all on function public.walkstamp_perfil_do_usuario(text) from public, anon;
grant execute on function public.walkstamp_perfil_do_usuario(text) to service_role;
