-- ---------------------------------------------------------- portas públicas
-- Estas duas o navegador chama diretamente, com a chave anônima. Elas só
-- INSEREM, nunca leem — uma chave anônima que consegue ler a lista de e-mails
-- é uma lista de e-mails pública.
create or replace function public.walkstamp_evento(
  p_nome text, p_formato text default null, p_idioma text default null, p_origem text default null)
returns void language plpgsql security definer set search_path to '' as $$
begin
  insert into walkstamp.evento (nome, formato, idioma, origem)
  values (p_nome, nullif(p_formato,''), nullif(p_idioma,''), nullif(p_origem,''));
exception when check_violation then
  return;   -- evento fora do vocabulário é ignorado, não é erro na tela de ninguém
end $$;

create or replace function public.walkstamp_interesse(p_email text, p_idioma text default null)
returns text language plpgsql security definer set search_path to '' as $$
begin
  insert into walkstamp.interesse (email, idioma)
  values (lower(btrim(p_email)), nullif(p_idioma,''));
  return 'ok';
exception
  when unique_violation then return 'ok';        -- pedir duas vezes não é erro
  when check_violation  then return 'invalido';
end $$;

grant execute on function public.walkstamp_evento(text,text,text,text) to anon, authenticated;
grant execute on function public.walkstamp_interesse(text,text) to anon, authenticated;

-- ------------------------------------------------------- decisão do plano
create or replace function walkstamp.plano_de(p_email text)
returns table (plano text, assentos int, dias int, cliente text, motivo text)
language plpgsql security definer set search_path = walkstamp, public as $$
declare
  e         text := lower(btrim(p_email));
  c         walkstamp.conta%rowtype;
  d         walkstamp.dominio%rowtype;
  tem_conta boolean;
  tem_dom   boolean;
begin
  select * into c from walkstamp.conta where email = e;
  /* FOUND é global no plpgsql e vale para o ÚLTIMO comando. Guardar aqui, e
     não consultar depois, é o que impede a consulta ao domínio de apagar o
     resultado desta — bug que dava plano pago de graça a quem pedisse duas
     vezes. */
  tem_conta := found;

  if tem_conta and not c.ativo then
    return query select null::text, 0, 0, null::text, 'suspensa'; return;
  end if;

  -- Conta explícita ganha do domínio: é a exceção escrita à mão.
  if tem_conta and c.plano = 'time' then
    return query select 'time'::text, c.assentos, c.dias, c.cliente, 'conta'; return;
  end if;

  select * into d from walkstamp.dominio where dominio = split_part(e, '@', 2) and ativo;
  tem_dom := found;
  if tem_dom then
    return query select 'time'::text, d.assentos, d.dias, d.cliente, 'dominio'; return;
  end if;

  -- Teste: uma vez por e-mail. Um teste que se renova sozinho é o plano pago
  -- de graça, e aí não há o que vender.
  if tem_conta and c.emissoes > 0 then
    return query select null::text, 0, 0, null::text, 'teste_usado'; return;
  end if;

  return query select 'time'::text, 1, 14, null::text, 'teste';
end $$;

-- Registrar uma emissão NÃO promove ninguém: quem decide o direito é a linha
-- escrita à mão. A versão anterior gravava plano='time' sempre, e o primeiro
-- teste criava uma conta paga.
create or replace function walkstamp.registrar_emissao(
  p_email text, p_plano text, p_assentos int, p_dias int, p_cliente text, p_vence date)
returns void language plpgsql security definer set search_path = walkstamp, public as $$
declare e text := lower(btrim(p_email));
begin
  insert into walkstamp.conta (email, plano, assentos, dias, cliente, emissoes, ultima_em, vence_em)
  values (e, coalesce(p_plano,'teste'), greatest(coalesce(p_assentos,1),1),
          greatest(coalesce(p_dias,14),1), p_cliente, 1, now(), p_vence)
  on conflict (email) do update
    set emissoes  = walkstamp.conta.emissoes + 1,
        ultima_em = now(),
        vence_em  = excluded.vence_em;
end $$;

-- As duas portas que a Edge Function usa. O PostgREST só enxerga `public`, e
-- só o service_role tem permissão de execução.
create or replace function public.walkstamp_plano_de(p_email text)
returns table (plano text, assentos int, dias int, cliente text, motivo text)
language sql security definer set search_path = public, walkstamp as $$
  select * from walkstamp.plano_de(p_email);
$$;

create or replace function public.walkstamp_registrar_emissao(
  p_email text, p_plano text, p_assentos int, p_dias int, p_cliente text, p_vence date)
returns void language sql security definer set search_path = public, walkstamp as $$
  select walkstamp.registrar_emissao(p_email, p_plano, p_assentos, p_dias, p_cliente, p_vence);
$$;

revoke all on function walkstamp.plano_de(text) from public, anon, authenticated;
revoke all on function walkstamp.registrar_emissao(text,text,int,int,text,date) from public, anon, authenticated;
revoke all on function public.walkstamp_plano_de(text) from public, anon, authenticated;
revoke all on function public.walkstamp_registrar_emissao(text,text,int,int,text,date) from public, anon, authenticated;
grant execute on function public.walkstamp_plano_de(text) to service_role;
grant execute on function public.walkstamp_registrar_emissao(text,text,int,int,text,date) to service_role;
