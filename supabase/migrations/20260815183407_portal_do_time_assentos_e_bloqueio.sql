-- Portal do cliente: quem entra, quem sai, quantos são.
--
-- O limite arquitetural continua o mesmo e está escrito na tela: a licença é
-- verificada OFFLINE, então bloquear alguém não apaga a chave que já está no
-- navegador dela. O que o portal faz é impedir a PRÓXIMA emissão. Por isso o
-- prazo virou um botão: quem quer cortar rápido põe 7 dias e paga com um
-- e-mail por semana; quem quer sossego põe 90 e aceita esperar.

alter table walkstamp.dominio add column if not exists admin_email text;
create index if not exists dominio_admin_idx on walkstamp.dominio (lower(admin_email));

-- O painel de um administrador. Devolve null para quem não administra nada,
-- e nunca aceita um domínio por parâmetro: ele sai do e-mail autenticado.
create or replace function walkstamp.time_painel(p_admin text)
returns jsonb
language plpgsql security definer set search_path to 'walkstamp','public'
as $$
declare
  a text := lower(btrim(p_admin));
  d walkstamp.dominio%rowtype;
  pessoas jsonb;
begin
  select * into d from walkstamp.dominio where lower(admin_email) = a;
  if not found then return null; end if;

  select coalesce(jsonb_agg(x order by x->>'email'), '[]'::jsonb) into pessoas
  from (
    select jsonb_build_object(
             'email', c.email, 'emissoes', c.emissoes, 'ultima_em', c.ultima_em,
             'vence_em', c.vence_em, 'ativo', c.ativo,
             'admin', lower(c.email) = a) as x
    from walkstamp.conta c
    where split_part(lower(c.email), '@', 2) = lower(d.dominio)
  ) t;

  return jsonb_build_object(
    'dominio', d.dominio, 'cliente', d.cliente, 'assentos', d.assentos,
    'dias', d.dias, 'ativo', d.ativo, 'admin', d.admin_email,
    'usados', (select count(*) from walkstamp.conta c
               where split_part(lower(c.email),'@',2) = lower(d.dominio) and c.ativo),
    'pessoas', pessoas);
end $$;

-- Bloquear e desbloquear. O administrador não pode bloquear a si mesmo: seria
-- trancar a chave dentro de casa, e a saída viraria um chamado para nós.
create or replace function walkstamp.time_bloquear(p_admin text, p_email text, p_bloquear boolean)
returns jsonb
language plpgsql security definer set search_path to 'walkstamp','public'
as $$
declare
  a text := lower(btrim(p_admin));
  e text := lower(btrim(p_email));
  d walkstamp.dominio%rowtype;
begin
  select * into d from walkstamp.dominio where lower(admin_email) = a;
  if not found then return jsonb_build_object('erro','nao_admin'); end if;
  if split_part(e,'@',2) <> lower(d.dominio) then
    return jsonb_build_object('erro','fora_do_dominio');
  end if;
  if e = a and p_bloquear then return jsonb_build_object('erro','nao_a_si'); end if;

  insert into walkstamp.conta (email, plano, assentos, dias, cliente, ativo)
  values (e, 'time', d.assentos, d.dias, d.cliente, not p_bloquear)
  on conflict (email) do update set ativo = not p_bloquear;

  return walkstamp.time_painel(a);
end $$;

-- O prazo e o número de assentos. O prazo é o único controle real de revogação
-- que existe sem servidor no caminho do uso, então ele fica curto por permissão
-- e não por padrão: 1 a 90 dias.
create or replace function walkstamp.time_ajustar(p_admin text, p_dias integer, p_assentos integer)
returns jsonb
language plpgsql security definer set search_path to 'walkstamp','public'
as $$
declare
  a text := lower(btrim(p_admin));
  d walkstamp.dominio%rowtype;
  nd integer := greatest(1, least(90, coalesce(p_dias, 90)));
  na integer := greatest(1, least(500, coalesce(p_assentos, 25)));
begin
  select * into d from walkstamp.dominio where lower(admin_email) = a;
  if not found then return jsonb_build_object('erro','nao_admin'); end if;

  update walkstamp.dominio set dias = nd, assentos = na where dominio = d.dominio;
  /* E nas contas do domínio. Sem esta linha, mudar o prazo no painel não
     mudaria nada para quem já pediu uma vez — que é todo mundo que importa. */
  update walkstamp.conta set dias = nd, assentos = na
   where split_part(lower(email), '@', 2) = lower(d.dominio);

  return walkstamp.time_painel(a);
end $$;

-- Só a Edge Function (service_role) chama. O anônimo não enxerga nada disto.
create or replace function public.walkstamp_time_painel(p_admin text)
returns jsonb language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.time_painel(p_admin); $$;

create or replace function public.walkstamp_time_bloquear(p_admin text, p_email text, p_bloquear boolean)
returns jsonb language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.time_bloquear(p_admin, p_email, p_bloquear); $$;

create or replace function public.walkstamp_time_ajustar(p_admin text, p_dias integer, p_assentos integer)
returns jsonb language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.time_ajustar(p_admin, p_dias, p_assentos); $$;

revoke all on function public.walkstamp_time_painel(text) from public, anon, authenticated;
revoke all on function public.walkstamp_time_bloquear(text, text, boolean) from public, anon, authenticated;
revoke all on function public.walkstamp_time_ajustar(text, integer, integer) from public, anon, authenticated;
grant execute on function public.walkstamp_time_painel(text) to service_role;
grant execute on function public.walkstamp_time_bloquear(text, text, boolean) to service_role;
grant execute on function public.walkstamp_time_ajustar(text, integer, integer) to service_role;
