-- Responder um chamado. Ela NAO existia: `chamado_resposta()` calcula o tempo
-- medio de resposta, nao escreve resposta nenhuma. O nome enganou.
create or replace function walkstamp.chamado_responder(p_numero text, p_texto text)
returns jsonb
language plpgsql
as $$
declare r walkstamp.recado%rowtype;
begin
  if coalesce(btrim(p_texto), '') = '' then
    return jsonb_build_object('erro', 'vazio');
  end if;
  update walkstamp.recado
     set resposta = btrim(p_texto),
         respondido_em = now(),
         status = 'respondido'
   where upper(btrim(coalesce(p_numero, ''))) = upper(numero)
  returning * into r;
  if not found then return jsonb_build_object('erro', 'nao_achei'); end if;
  return jsonb_build_object('ok', true, 'numero', r.numero, 'email', r.email,
                            'respondido_em', r.respondido_em);
end $$;

create or replace function public.walkstamp_chamado_responder(p_numero text, p_texto text)
returns jsonb
language sql
security definer
set search_path to 'public', 'walkstamp'
as $$ select walkstamp.chamado_responder(p_numero, p_texto); $$;

-- A trava: quem responde chamado do produto e o dono, pelo servidor do site.
-- Aberta ao navegador, qualquer pessoa escreveria a "nossa" resposta em qualquer
-- chamado de qualquer cliente.
revoke all on function public.walkstamp_chamado_responder(text, text) from public, anon, authenticated;
grant execute on function public.walkstamp_chamado_responder(text, text) to service_role;
