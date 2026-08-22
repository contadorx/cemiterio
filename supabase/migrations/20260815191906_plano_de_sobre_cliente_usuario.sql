-- plano_de e registrar_emissao reescritos sobre cliente/usuário, com a MESMA
-- assinatura: a Edge Function da licença não muda uma linha, e os testes de
-- licença continuam valendo — que é como se troca o alicerce sem derrubar a casa.

create or replace function walkstamp.plano_de(p_email text)
returns table(plano text, assentos integer, dias integer, cliente text, motivo text)
language plpgsql security definer set search_path to 'walkstamp','public'
as $$
declare
  e  text := lower(btrim(p_email));
  u  walkstamp.usuario%rowtype;
  c  walkstamp.cliente%rowtype;
  d  walkstamp.dominio%rowtype;
  tem_u boolean; tem_c boolean; tem_d boolean;
begin
  select * into u from walkstamp.usuario where email = e;
  tem_u := found;

  if tem_u and not u.ativo then
    return query select null::text, 0, 0, null::text, 'suspensa'; return;
  end if;

  -- Assento nominal: o usuário está ligado a um cliente.
  if tem_u and u.cliente_id is not null then
    select * into c from walkstamp.cliente where id = u.cliente_id;
    tem_c := found;
    if tem_c and not c.ativo then
      return query select null::text, 0, 0, null::text, 'suspensa'; return;
    end if;
    if tem_c then
      return query select c.plano, c.assentos, c.dias, c.nome, 'conta'; return;
    end if;
  end if;

  -- Regra de inscrição por domínio: quem tem e-mail da empresa entra sozinho.
  select * into d from walkstamp.dominio
   where lower(dominio) = split_part(e,'@',2) and ativo and cliente_id is not null;
  tem_d := found;
  if tem_d then
    select * into c from walkstamp.cliente where id = d.cliente_id and ativo;
    if found then
      return query select c.plano, c.assentos, c.dias, c.nome, 'dominio'; return;
    end if;
  end if;

  -- Teste: uma vez por e-mail. Um teste que se renova sozinho é o plano pago
  -- de graça, e aí não há o que vender.
  if tem_u and u.emissoes > 0 then
    return query select null::text, 0, 0, null::text, 'teste_usado'; return;
  end if;

  return query select 'time'::text, 1, 14, null::text, 'teste';
end $$;

create or replace function walkstamp.registrar_emissao(
  p_email text, p_plano text, p_assentos integer, p_dias integer,
  p_cliente text, p_vence date)
returns void
language plpgsql security definer set search_path to 'walkstamp','public'
as $$
declare
  e   text := lower(btrim(p_email));
  cid bigint;
begin
  -- O cliente do usuário: o dele, ou o do domínio se ele ainda não tem.
  select u.cliente_id into cid from walkstamp.usuario u where u.email = e;
  if cid is null then
    select d.cliente_id into cid from walkstamp.dominio d
     where lower(d.dominio) = split_part(e,'@',2) and d.ativo;
  end if;

  insert into walkstamp.usuario (cliente_id, email, emissoes, ultima_em, vence_em)
  values (cid, e, 1, now(), p_vence)
  on conflict (email) do update
    set emissoes   = walkstamp.usuario.emissoes + 1,
        ultima_em  = now(),
        vence_em   = excluded.vence_em,
        /* Só PREENCHE, nunca troca: um usuário movido à mão para outro cliente
           não pode voltar sozinho pelo domínio na emissão seguinte. */
        cliente_id = coalesce(walkstamp.usuario.cliente_id, excluded.cliente_id);

  insert into walkstamp.emissao (cliente_id, email, plano, dias, vence_em, motivo)
  values (cid, e, p_plano, p_dias, p_vence, p_cliente);
end $$;
