-- A fatura que chega da Stripe. Idempotente pelo id dela: a Stripe reenvia o
-- mesmo evento quando não recebe 2xx, e uma cobrança duplicada na tela do
-- cliente é a pior maneira de descobrir isso.
create or replace function walkstamp.fatura_da_stripe(
  p_stripe_id text, p_stripe_cliente text, p_email text, p_numero text,
  p_valor integer, p_moeda text, p_status text, p_vence date, p_url text)
returns jsonb
language plpgsql security definer set search_path to 'walkstamp','public'
as $$
declare cid bigint;
begin
  -- 1) pelo customer da Stripe, que é o vínculo forte
  select id into cid from walkstamp.cliente where stripe_id = p_stripe_cliente and p_stripe_cliente <> '';
  -- 2) pelo e-mail do pagador, se ele já for usuário
  if cid is null and coalesce(p_email,'') <> '' then
    select u.cliente_id into cid from walkstamp.usuario u where u.email = lower(p_email);
    -- e amarra o customer para as próximas
    if cid is not null and coalesce(p_stripe_cliente,'') <> '' then
      update walkstamp.cliente set stripe_id = p_stripe_cliente
       where id = cid and (stripe_id is null or stripe_id = '');
    end if;
  end if;
  /* Sem cliente identificado a fatura NÃO é inventada: uma linha órfã na tela
     de alguém é pior que uma fatura faltando, que ao menos é perguntada. */
  if cid is null then return jsonb_build_object('erro','cliente_desconhecido'); end if;

  insert into walkstamp.fatura (cliente_id, numero, competencia, valor_centavos, moeda,
                                status, vence_em, pago_em, stripe_id)
  values (cid, p_numero, current_date, greatest(coalesce(p_valor,0),0),
          coalesce(p_moeda,'BRL'), p_status, p_vence,
          case when p_status = 'paga' then now() else null end, p_stripe_id)
  on conflict (stripe_id) do update
    set status  = excluded.status,
        numero  = coalesce(excluded.numero, walkstamp.fatura.numero),
        valor_centavos = excluded.valor_centavos,
        vence_em = coalesce(excluded.vence_em, walkstamp.fatura.vence_em),
        pago_em = case when excluded.status = 'paga'
                       then coalesce(walkstamp.fatura.pago_em, now())
                       else walkstamp.fatura.pago_em end;
  return jsonb_build_object('ok', true, 'cliente_id', cid);
end $$;

create unique index if not exists fatura_stripe_uk on walkstamp.fatura (stripe_id)
  where stripe_id is not null;

create or replace function public.walkstamp_fatura_da_stripe(
  p_stripe_id text, p_stripe_cliente text, p_email text, p_numero text,
  p_valor integer, p_moeda text, p_status text, p_vence date, p_url text)
returns jsonb language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.fatura_da_stripe(p_stripe_id, p_stripe_cliente, p_email, p_numero,
                                        p_valor, p_moeda, p_status, p_vence, p_url); $$;

revoke all on function public.walkstamp_fatura_da_stripe(text,text,text,text,integer,text,text,date,text)
  from public, anon, authenticated;
grant execute on function public.walkstamp_fatura_da_stripe(text,text,text,text,integer,text,text,date,text)
  to service_role;
