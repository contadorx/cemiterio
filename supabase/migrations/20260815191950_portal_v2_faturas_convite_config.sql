-- O portal do cliente, versão 2: assentos, convite, faturas, histórico,
-- configuração de equipe e modelos de documento.
--
-- Continua valendo a regra que sustenta tudo: o navegador NUNCA fala com estas
-- tabelas. Ele fala com uma Edge Function que confere o token do link mágico e
-- usa service_role. Por isso não há RLS aqui — não há caminho anônimo para cá.

create or replace function walkstamp.time_painel(p_admin text)
returns jsonb
language plpgsql security definer set search_path to 'walkstamp','public'
as $$
declare
  a text := lower(btrim(p_admin));
  u walkstamp.usuario%rowtype;
  c walkstamp.cliente%rowtype;
begin
  select * into u from walkstamp.usuario where email = a and papel = 'admin';
  if not found or u.cliente_id is null then return null; end if;
  select * into c from walkstamp.cliente where id = u.cliente_id;
  if not found then return null; end if;

  return jsonb_build_object(
    'cliente_id', c.id, 'cliente', c.nome, 'documento', c.documento,
    'plano', c.plano, 'assentos', c.assentos, 'dias', c.dias, 'ativo', c.ativo,
    'admin', a,
    'dominios', (select coalesce(jsonb_agg(d.dominio order by d.dominio), '[]'::jsonb)
                   from walkstamp.dominio d where d.cliente_id = c.id and d.ativo),
    'usados', (select count(*) from walkstamp.usuario x where x.cliente_id = c.id and x.ativo),
    'pessoas', (select coalesce(jsonb_agg(jsonb_build_object(
                  'email', x.email, 'papel', x.papel, 'emissoes', x.emissoes,
                  'ultima_em', x.ultima_em, 'vence_em', x.vence_em, 'ativo', x.ativo,
                  'convidado_por', x.convidado_por,
                  'admin', x.email = a) order by x.email), '[]'::jsonb)
                  from walkstamp.usuario x where x.cliente_id = c.id),
    'faturas', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', f.id, 'numero', f.numero, 'competencia', f.competencia,
                  'valor_centavos', f.valor_centavos, 'moeda', f.moeda,
                  'status', f.status, 'vence_em', f.vence_em, 'pago_em', f.pago_em,
                  'nf_url', f.nf_url, 'nf_numero', f.nf_numero)
                  order by f.competencia desc nulls last, f.id desc), '[]'::jsonb)
                  from walkstamp.fatura f where f.cliente_id = c.id),
    'emissoes', (select coalesce(jsonb_agg(jsonb_build_object(
                  'email', em.email, 'vence_em', em.vence_em, 'dias', em.dias,
                  'criado_em', em.criado_em) order by em.criado_em desc), '[]'::jsonb)
                  from (select * from walkstamp.emissao
                         where cliente_id = c.id order by criado_em desc limit 50) em),
    'config', (select coalesce(to_jsonb(cf) - 'cliente_id', '{}'::jsonb)
                 from walkstamp.config cf where cf.cliente_id = c.id),
    'modelos', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', m.id, 'nome', m.nome, 'escopo', m.escopo, 'dados', m.dados)
                  order by m.nome), '[]'::jsonb)
                  from walkstamp.modelo_doc m where m.cliente_id = c.id));
end $$;

-- Só quem é admin DE UM CLIENTE mexe, e só em quem é daquele cliente.
create or replace function walkstamp.time_bloquear(p_admin text, p_email text, p_bloquear boolean)
returns jsonb language plpgsql security definer set search_path to 'walkstamp','public'
as $$
declare a text := lower(btrim(p_admin)); e text := lower(btrim(p_email)); cid bigint;
begin
  select u.cliente_id into cid from walkstamp.usuario u
   where u.email = a and u.papel = 'admin' and u.cliente_id is not null;
  if cid is null then return jsonb_build_object('erro','nao_admin'); end if;
  if e = a and p_bloquear then return jsonb_build_object('erro','nao_a_si'); end if;
  if not exists (select 1 from walkstamp.usuario where email = e and cliente_id = cid) then
    return jsonb_build_object('erro','fora_do_cliente');
  end if;
  update walkstamp.usuario set ativo = not p_bloquear where email = e;
  return walkstamp.time_painel(a);
end $$;

create or replace function walkstamp.time_ajustar(p_admin text, p_dias integer, p_assentos integer)
returns jsonb language plpgsql security definer set search_path to 'walkstamp','public'
as $$
declare
  a text := lower(btrim(p_admin)); cid bigint;
  nd integer := greatest(1, least(90, coalesce(p_dias, 90)));
  na integer := greatest(1, least(500, coalesce(p_assentos, 25)));
begin
  select u.cliente_id into cid from walkstamp.usuario u
   where u.email = a and u.papel = 'admin' and u.cliente_id is not null;
  if cid is null then return jsonb_build_object('erro','nao_admin'); end if;
  /* O prazo mora no CLIENTE agora, e não em cada conta. Era o defeito do
     desenho anterior: mudar o prazo não alcançava quem já tinha pedido. */
  update walkstamp.cliente set dias = nd, assentos = na where id = cid;
  return walkstamp.time_painel(a);
end $$;

-- Convidar: cria o assento antes de a pessoa pedir. Quem convida fica
-- registrado, porque "quem colocou o fulano aqui?" é a pergunta seguinte.
create or replace function walkstamp.time_convidar(p_admin text, p_email text)
returns jsonb language plpgsql security definer set search_path to 'walkstamp','public'
as $$
declare
  a text := lower(btrim(p_admin)); e text := lower(btrim(p_email));
  cid bigint; usados integer; limite integer;
begin
  select u.cliente_id into cid from walkstamp.usuario u
   where u.email = a and u.papel = 'admin' and u.cliente_id is not null;
  if cid is null then return jsonb_build_object('erro','nao_admin'); end if;
  if e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('erro','email_invalido');
  end if;
  if exists (select 1 from walkstamp.usuario where email = e and cliente_id is not null
               and cliente_id <> cid) then
    return jsonb_build_object('erro','ja_de_outro');
  end if;
  select assentos into limite from walkstamp.cliente where id = cid;
  select count(*) into usados from walkstamp.usuario where cliente_id = cid and ativo;
  if usados >= limite then return jsonb_build_object('erro','sem_assento'); end if;

  insert into walkstamp.usuario (cliente_id, email, papel, convidado_por)
  values (cid, e, 'membro', a)
  on conflict (email) do update
    set cliente_id = cid, ativo = true, convidado_por = coalesce(walkstamp.usuario.convidado_por, a);
  return walkstamp.time_painel(a);
end $$;

-- A configuração empurrada e os modelos de documento. Nada de conteúdo: nome
-- de empresa, logotipo, rótulo e padrões de campo.
create or replace function walkstamp.time_config(p_admin text, p_config jsonb)
returns jsonb language plpgsql security definer set search_path to 'walkstamp','public'
as $$
declare a text := lower(btrim(p_admin)); cid bigint;
begin
  select u.cliente_id into cid from walkstamp.usuario u
   where u.email = a and u.papel = 'admin' and u.cliente_id is not null;
  if cid is null then return jsonb_build_object('erro','nao_admin'); end if;
  insert into walkstamp.config (cliente_id, empresa, logo_url, cenario, rotulo, ambiente, atualizado_em)
  values (cid, p_config->>'empresa', p_config->>'logo_url', p_config->>'cenario',
          p_config->>'rotulo', p_config->>'ambiente', now())
  on conflict (cliente_id) do update
    set empresa = excluded.empresa, logo_url = excluded.logo_url,
        cenario = excluded.cenario, rotulo = excluded.rotulo,
        ambiente = excluded.ambiente, atualizado_em = now();
  return walkstamp.time_painel(a);
end $$;

create or replace function walkstamp.time_modelo(p_admin text, p_id bigint, p_nome text,
                                                p_escopo text, p_dados jsonb, p_apagar boolean)
returns jsonb language plpgsql security definer set search_path to 'walkstamp','public'
as $$
declare a text := lower(btrim(p_admin)); cid bigint;
begin
  select u.cliente_id into cid from walkstamp.usuario u
   where u.email = a and u.papel = 'admin' and u.cliente_id is not null;
  if cid is null then return jsonb_build_object('erro','nao_admin'); end if;
  if coalesce(p_apagar,false) then
    delete from walkstamp.modelo_doc where id = p_id and cliente_id = cid;
  elsif p_id is not null then
    update walkstamp.modelo_doc set nome = p_nome, escopo = coalesce(p_escopo,'time'),
           dados = coalesce(p_dados,'{}'::jsonb)
     where id = p_id and cliente_id = cid;
  else
    if btrim(coalesce(p_nome,'')) = '' then return jsonb_build_object('erro','sem_nome'); end if;
    insert into walkstamp.modelo_doc (cliente_id, nome, escopo, dados)
    values (cid, p_nome, coalesce(p_escopo,'time'), coalesce(p_dados,'{}'::jsonb));
  end if;
  return walkstamp.time_painel(a);
end $$;

-- ------------------------------------------------------------- invólucros
create or replace function public.walkstamp_time_convidar(p_admin text, p_email text)
returns jsonb language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.time_convidar(p_admin, p_email); $$;

create or replace function public.walkstamp_time_config(p_admin text, p_config jsonb)
returns jsonb language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.time_config(p_admin, p_config); $$;

create or replace function public.walkstamp_time_modelo(p_admin text, p_id bigint, p_nome text,
                                                       p_escopo text, p_dados jsonb, p_apagar boolean)
returns jsonb language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.time_modelo(p_admin, p_id, p_nome, p_escopo, p_dados, p_apagar); $$;

revoke all on function public.walkstamp_time_convidar(text,text) from public, anon, authenticated;
revoke all on function public.walkstamp_time_config(text,jsonb) from public, anon, authenticated;
revoke all on function public.walkstamp_time_modelo(text,bigint,text,text,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.walkstamp_time_convidar(text,text) to service_role;
grant execute on function public.walkstamp_time_config(text,jsonb) to service_role;
grant execute on function public.walkstamp_time_modelo(text,bigint,text,text,jsonb,boolean) to service_role;
