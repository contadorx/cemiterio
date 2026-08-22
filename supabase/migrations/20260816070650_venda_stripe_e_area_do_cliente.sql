-- A venda: uma assinatura da Stripe vira um plano, e o pagador vira o
-- administrador dele. E a leitura que a área do cliente precisa, num lugar só.

alter table walkstamp.cliente add column if not exists stripe_assinatura text;
create index if not exists cliente_stripe_assinatura on walkstamp.cliente (stripe_assinatura);

create or replace function walkstamp.assinatura_da_stripe(
  p_email text, p_stripe_cliente text, p_stripe_assinatura text,
  p_plano text, p_status text, p_assentos integer, p_dias integer)
returns jsonb language plpgsql security definer
set search_path to 'walkstamp','public' as $$
declare
  e    text := lower(btrim(coalesce(p_email,'')));
  cid  bigint;
  /* O que conta como plano vivo. `trialing` entra: durante a degustação a
     pessoa tem tudo, e é isso que foi prometido. `past_due` NÃO entra — quem
     não pagou cai para o Free, que continua funcionando inteiro. */
  vivo boolean := p_status in ('active','trialing');
begin
  -- 1) pelo customer da Stripe, que é o vínculo forte
  select id into cid from walkstamp.cliente
   where stripe_id = p_stripe_cliente and coalesce(p_stripe_cliente,'') <> '';
  -- 2) pelo e-mail do pagador, se ele já for usuário de alguma conta
  if cid is null and e <> '' then
    select u.cliente_id into cid from walkstamp.usuario u where u.email = e;
  end if;

  if cid is null then
    insert into walkstamp.cliente (nome, plano, assentos, dias, ativo, stripe_id, stripe_assinatura)
    values (coalesce(nullif(e,''), 'assinante'), p_plano,
            greatest(coalesce(p_assentos,1),1), greatest(coalesce(p_dias,30),1),
            vivo, nullif(p_stripe_cliente,''), nullif(p_stripe_assinatura,''))
    returning id into cid;
  else
    update walkstamp.cliente
       set plano     = p_plano,
           assentos  = greatest(coalesce(p_assentos, assentos), 1),
           dias      = greatest(coalesce(p_dias, dias), 1),
           ativo     = vivo,
           stripe_id = coalesce(nullif(p_stripe_cliente,''), stripe_id),
           stripe_assinatura = coalesce(nullif(p_stripe_assinatura,''), stripe_assinatura)
     where id = cid;
  end if;

  /* O pagador entra como administrador da conta que ele pagou. Se já existia,
     o papel dele não é rebaixado — quem já era admin continua sendo. */
  if e <> '' then
    insert into walkstamp.usuario (cliente_id, email, papel, ativo)
    values (cid, e, 'admin', true)
    on conflict (email) do update
      set cliente_id = cid,
          papel = case when walkstamp.usuario.papel = 'admin' then 'admin' else 'admin' end,
          ativo = true;
  end if;

  return jsonb_build_object('ok', true, 'cliente_id', cid, 'ativo', vivo, 'plano', p_plano);
end $$;

create or replace function walkstamp.minhas_faturas(p_email text)
returns jsonb language plpgsql security definer
set search_path to 'walkstamp','public' as $$
declare e text := lower(btrim(coalesce(p_email,''))); cid bigint;
begin
  select u.cliente_id into cid from walkstamp.usuario u where u.email = e;
  if cid is null then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'numero', f.numero, 'valor', f.valor_centavos, 'moeda', f.moeda,
            'status', f.status, 'vence_em', f.vence_em, 'pago_em', f.pago_em,
            'nf_url', f.nf_url, 'nf_numero', f.nf_numero, 'criado_em', f.criado_em)
            order by f.criado_em desc), '[]'::jsonb)
          from (select * from walkstamp.fatura where cliente_id = cid
                 order by criado_em desc limit 24) f);
end $$;

/* Tudo o que a área do cliente mostra, numa chamada só. São cinco perguntas
   diferentes ao mesmo banco; ir cinco vezes até o outro lado do continente
   (sa-east-1) para montar uma tela é o tipo de coisa que faz a tela parecer
   lenta sem nada estar errado. */
create or replace function walkstamp.conta_do_usuario(p_email text)
returns jsonb language plpgsql security definer
set search_path to 'walkstamp','public' as $$
declare
  e  text := lower(btrim(coalesce(p_email,'')));
  pl record;
  u  walkstamp.usuario%rowtype;
  c  walkstamp.cliente%rowtype;
begin
  if e = '' then return jsonb_build_object('erro','sem_email'); end if;
  select * into pl from walkstamp.plano_de(e);
  select * into u  from walkstamp.usuario where email = e;
  if u.cliente_id is not null then
    select * into c from walkstamp.cliente where id = u.cliente_id;
  end if;
  return jsonb_build_object(
    'email',    e,
    'plano',    pl.plano, 'assentos', pl.assentos, 'dias', pl.dias,
    'cliente',  pl.cliente, 'motivo', pl.motivo,
    'papel',    coalesce(u.papel, 'membro'),
    'vence_em', u.vence_em,
    'emissoes', coalesce(u.emissoes, 0),
    'assinante', c.stripe_id is not null,
    'perfil',   walkstamp.perfil_do_usuario(e),
    'faturas',  walkstamp.minhas_faturas(e),
    'chamados', walkstamp.meus_chamados(e),
    /* O painel do time só existe para quem administra. Pedi-lo para um membro
       comum devolveria erro, então nem se pergunta. */
    'time',     case when coalesce(u.papel,'') = 'admin'
                     then walkstamp.time_painel(e) else null end);
end $$;

create or replace function public.walkstamp_assinatura_da_stripe(
  p_email text, p_stripe_cliente text, p_stripe_assinatura text,
  p_plano text, p_status text, p_assentos integer, p_dias integer)
returns jsonb language sql security definer set search_path to 'public','walkstamp' as $$
  select walkstamp.assinatura_da_stripe(p_email, p_stripe_cliente, p_stripe_assinatura,
                                        p_plano, p_status, p_assentos, p_dias);
$$;

create or replace function public.walkstamp_conta_do_usuario(p_email text)
returns jsonb language sql security definer set search_path to 'public','walkstamp' as $$
  select walkstamp.conta_do_usuario(p_email);
$$;

/* Estas duas só o servidor chama, com a chave de serviço. Tirar o acesso do
   anônimo e do logado é o que impede alguém de perguntar pela conta alheia
   pela API pública — a fechadura é essa, não a boa intenção do cliente. */
revoke all on function public.walkstamp_assinatura_da_stripe(text,text,text,text,text,integer,integer) from anon, authenticated;
revoke all on function public.walkstamp_conta_do_usuario(text) from anon, authenticated;
