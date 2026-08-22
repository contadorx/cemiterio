/* Roteiro de casos — a primeira coisa DO CLIENTE que passa a morar no servidor.
 *
 * O que entra aqui: nome do caso, título, cenário, chamado, sistema, quem é o
 * responsável, quando ficou pronto e a impressão digital do documento.
 * O que NUNCA entra: o vídeo, os quadros, a transcrição, o documento gerado.
 * Esses continuam só no navegador de quem gravou. A política de privacidade
 * precisa dizer isso — está na lista.
 *
 * Personal executa (roteiro próprio, link próprio, "feito" próprio).
 * Time coordena (roteiro compartilhado, caso atribuído a alguém, painel).
 */

create table if not exists walkstamp.roteiro (
  id          bigint generated always as identity primary key,
  cliente_id  bigint references walkstamp.cliente(id) on delete cascade,
  dono        text not null,
  nome        text not null,
  escopo      text not null default 'personal' check (escopo in ('personal','time')),
  criado_em   timestamptz not null default now()
);
create index if not exists roteiro_dono_ix    on walkstamp.roteiro (lower(dono));
create index if not exists roteiro_cliente_ix on walkstamp.roteiro (cliente_id);

create table if not exists walkstamp.roteiro_caso (
  id           bigint generated always as identity primary key,
  roteiro_id   bigint not null references walkstamp.roteiro(id) on delete cascade,
  ordem        int  not null default 0,
  caso         text not null,
  titulo       text,
  cenario      text,
  chamado      text,
  sistema      text,
  responsavel  text,
  feito_em     timestamptz,
  feito_por    text,
  arquivo      text,
  impressao    text,
  observacao   text
);
create index if not exists roteiro_caso_ix on walkstamp.roteiro_caso (roteiro_id, ordem);

alter table walkstamp.roteiro      enable row level security;
alter table walkstamp.roteiro_caso enable row level security;

/* ---- quem enxerga o quê ------------------------------------------------ */

create or replace function walkstamp.roteiro_pode(p_email text, p_id bigint)
returns boolean language sql stable security definer
set search_path to 'walkstamp','public' as $$
  select exists (
    select 1 from walkstamp.roteiro r
     where r.id = p_id
       and ( lower(r.dono) = lower(btrim(p_email))
          or ( r.escopo = 'time' and r.cliente_id is not null
               and r.cliente_id = (select u.cliente_id from walkstamp.usuario u
                                    where u.email = lower(btrim(p_email)) and u.ativo) ) ) );
$$;

create or replace function walkstamp.roteiro_ver(p_email text, p_id bigint)
returns jsonb language plpgsql stable security definer
set search_path to 'walkstamp','public' as $$
declare e text := lower(btrim(coalesce(p_email,''))); r walkstamp.roteiro%rowtype;
begin
  if e = '' then return jsonb_build_object('erro','sem_email'); end if;
  if not walkstamp.roteiro_pode(e, p_id) then return jsonb_build_object('erro','sem_acesso'); end if;
  select * into r from walkstamp.roteiro where id = p_id;
  return jsonb_build_object(
    'id', r.id, 'nome', r.nome, 'escopo', r.escopo, 'dono', r.dono,
    'criado_em', r.criado_em,
    'meu', lower(r.dono) = e,
    'casos', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', c.id, 'ordem', c.ordem, 'caso', c.caso, 'titulo', c.titulo,
                'cenario', c.cenario, 'chamado', c.chamado, 'sistema', c.sistema,
                'responsavel', c.responsavel, 'feito_em', c.feito_em,
                'feito_por', c.feito_por, 'arquivo', c.arquivo,
                'impressao', c.impressao, 'observacao', c.observacao)
                order by c.ordem, c.id), '[]'::jsonb)
              from walkstamp.roteiro_caso c where c.roteiro_id = r.id));
end $$;

create or replace function walkstamp.roteiro_meus(p_email text)
returns jsonb language plpgsql stable security definer
set search_path to 'walkstamp','public' as $$
declare e text := lower(btrim(coalesce(p_email,''))); cid bigint;
begin
  if e = '' then return jsonb_build_object('erro','sem_email'); end if;
  select u.cliente_id into cid from walkstamp.usuario u where u.email = e and u.ativo;
  return jsonb_build_object('email', e, 'roteiros', (
    select coalesce(jsonb_agg(x order by (x->>'criado_em') desc), '[]'::jsonb) from (
      select jsonb_build_object(
        'id', r.id, 'nome', r.nome, 'escopo', r.escopo, 'dono', r.dono,
        'criado_em', r.criado_em, 'meu', lower(r.dono) = e,
        'total', (select count(*) from walkstamp.roteiro_caso c where c.roteiro_id = r.id),
        'feitos', (select count(*) from walkstamp.roteiro_caso c
                    where c.roteiro_id = r.id and c.feito_em is not null),
        'meus',   (select count(*) from walkstamp.roteiro_caso c
                    where c.roteiro_id = r.id and lower(coalesce(c.responsavel,'')) = e)) as x
        from walkstamp.roteiro r
       where lower(r.dono) = e
          or (r.escopo = 'time' and cid is not null and r.cliente_id = cid)) s));
end $$;

/* Salvar é substituir: a planilha (ou a tela) manda a lista inteira de casos.
   Um caso que já foi feito guarda o que foi feito — casar pelo nome do caso,
   porque é o que a pessoa reconhece e o que o link carrega. */
create or replace function walkstamp.roteiro_salvar(
  p_email text, p_nome text, p_escopo text, p_casos jsonb, p_id bigint)
returns jsonb language plpgsql security definer
set search_path to 'walkstamp','public' as $$
declare
  e text := lower(btrim(coalesce(p_email,'')));
  esc text := case when coalesce(p_escopo,'') = 'time' then 'time' else 'personal' end;
  cid bigint; rid bigint; i int := 0; item jsonb;
begin
  if e = '' then return jsonb_build_object('erro','sem_email'); end if;
  if btrim(coalesce(p_nome,'')) = '' then return jsonb_build_object('erro','sem_nome'); end if;
  if jsonb_typeof(coalesce(p_casos,'null'::jsonb)) <> 'array' or jsonb_array_length(p_casos) = 0 then
    return jsonb_build_object('erro','sem_casos');
  end if;

  select u.cliente_id into cid from walkstamp.usuario u where u.email = e and u.ativo;
  /* Roteiro de time sem conta de time não existe: vira pessoal, em vez de
     desaparecer e a pessoa não entender para onde foi. */
  if esc = 'time' and cid is null then esc := 'personal'; end if;

  if p_id is not null then
    if not walkstamp.roteiro_pode(e, p_id) then return jsonb_build_object('erro','sem_acesso'); end if;
    rid := p_id;
    update walkstamp.roteiro set nome = p_nome, escopo = esc,
           cliente_id = case when esc = 'time' then cid else cliente_id end
     where id = rid;
  else
    insert into walkstamp.roteiro (cliente_id, dono, nome, escopo)
    values (case when esc = 'time' then cid else null end, e, p_nome, esc)
    returning id into rid;
  end if;

  create temp table _antes on commit drop as
    select caso, responsavel, feito_em, feito_por, arquivo, impressao, observacao
      from walkstamp.roteiro_caso where roteiro_id = rid;
  delete from walkstamp.roteiro_caso where roteiro_id = rid;

  for item in select * from jsonb_array_elements(p_casos) loop
    i := i + 1;
    insert into walkstamp.roteiro_caso
      (roteiro_id, ordem, caso, titulo, cenario, chamado, sistema,
       responsavel, feito_em, feito_por, arquivo, impressao, observacao)
    select rid, i,
      coalesce(nullif(btrim(item->>'caso'),''), 'caso ' || i),
      nullif(btrim(coalesce(item->>'titulo','')),''),
      nullif(btrim(coalesce(item->>'cenario','')),''),
      nullif(btrim(coalesce(item->>'chamado','')),''),
      nullif(btrim(coalesce(item->>'sistema','')),''),
      coalesce(nullif(btrim(coalesce(item->>'responsavel','')),''), a.responsavel),
      a.feito_em, a.feito_por, a.arquivo, a.impressao, a.observacao
    from (select 1) z
    left join _antes a
      on lower(a.caso) = lower(coalesce(nullif(btrim(item->>'caso'),''), 'caso ' || i));
  end loop;
  drop table _antes;

  return walkstamp.roteiro_ver(e, rid);
end $$;

create or replace function walkstamp.roteiro_feito(
  p_email text, p_caso_id bigint, p_arquivo text, p_impressao text,
  p_observacao text, p_desfazer boolean)
returns jsonb language plpgsql security definer
set search_path to 'walkstamp','public' as $$
declare e text := lower(btrim(coalesce(p_email,''))); rid bigint;
begin
  if e = '' then return jsonb_build_object('erro','sem_email'); end if;
  select roteiro_id into rid from walkstamp.roteiro_caso where id = p_caso_id;
  if rid is null then return jsonb_build_object('erro','sem_caso'); end if;
  if not walkstamp.roteiro_pode(e, rid) then return jsonb_build_object('erro','sem_acesso'); end if;

  if coalesce(p_desfazer,false) then
    update walkstamp.roteiro_caso
       set feito_em = null, feito_por = null, arquivo = null,
           impressao = null, observacao = null
     where id = p_caso_id;
  else
    update walkstamp.roteiro_caso
       set feito_em = now(), feito_por = e,
           arquivo   = nullif(btrim(coalesce(p_arquivo,'')),''),
           impressao = nullif(btrim(coalesce(p_impressao,'')),''),
           observacao= nullif(btrim(coalesce(p_observacao,'')),'')
     where id = p_caso_id;
  end if;
  return walkstamp.roteiro_ver(e, rid);
end $$;

/* Atribuir é coisa de time: só quem administra reparte o trabalho. */
create or replace function walkstamp.roteiro_atribuir(
  p_admin text, p_caso_id bigint, p_para text)
returns jsonb language plpgsql security definer
set search_path to 'walkstamp','public' as $$
declare
  a text := lower(btrim(coalesce(p_admin,'')));
  para text := lower(btrim(coalesce(p_para,'')));
  cid bigint; rid bigint; r walkstamp.roteiro%rowtype;
begin
  if a = '' then return jsonb_build_object('erro','sem_email'); end if;
  select u.cliente_id into cid from walkstamp.usuario u
   where u.email = a and u.papel = 'admin' and u.ativo and u.cliente_id is not null;
  if cid is null then return jsonb_build_object('erro','nao_admin'); end if;

  select roteiro_id into rid from walkstamp.roteiro_caso where id = p_caso_id;
  if rid is null then return jsonb_build_object('erro','sem_caso'); end if;
  select * into r from walkstamp.roteiro where id = rid;
  if r.escopo <> 'time' or r.cliente_id is distinct from cid then
    return jsonb_build_object('erro','sem_acesso');
  end if;

  /* Atribuir para fora do time seria mandar trabalho para quem não entra. */
  if para <> '' and not exists (select 1 from walkstamp.usuario u
                                 where u.email = para and u.cliente_id = cid and u.ativo) then
    return jsonb_build_object('erro','fora_do_time');
  end if;

  update walkstamp.roteiro_caso set responsavel = nullif(para,'') where id = p_caso_id;
  return walkstamp.roteiro_ver(a, rid);
end $$;

create or replace function walkstamp.roteiro_apagar(p_email text, p_id bigint)
returns jsonb language plpgsql security definer
set search_path to 'walkstamp','public' as $$
declare e text := lower(btrim(coalesce(p_email,''))); dono text;
begin
  if e = '' then return jsonb_build_object('erro','sem_email'); end if;
  select r.dono into dono from walkstamp.roteiro r where r.id = p_id;
  if dono is null then return jsonb_build_object('erro','sem_roteiro'); end if;
  /* Apagar é do dono. Um colega apagar o roteiro do time no meio da rodada
     é estrago que ninguém desfaz — quem criou desfaz. */
  if lower(dono) <> e then return jsonb_build_object('erro','so_o_dono'); end if;
  delete from walkstamp.roteiro where id = p_id;
  return walkstamp.roteiro_meus(e);
end $$;

/* ---- as portas públicas (só o servidor abre) --------------------------- */

create or replace function public.walkstamp_roteiro_meus(p_email text)
returns jsonb language sql security definer set search_path to 'walkstamp','public'
as $$ select walkstamp.roteiro_meus(p_email) $$;

create or replace function public.walkstamp_roteiro_ver(p_email text, p_id bigint)
returns jsonb language sql security definer set search_path to 'walkstamp','public'
as $$ select walkstamp.roteiro_ver(p_email, p_id) $$;

create or replace function public.walkstamp_roteiro_salvar(
  p_email text, p_nome text, p_escopo text, p_casos jsonb, p_id bigint)
returns jsonb language sql security definer set search_path to 'walkstamp','public'
as $$ select walkstamp.roteiro_salvar(p_email, p_nome, p_escopo, p_casos, p_id) $$;

create or replace function public.walkstamp_roteiro_feito(
  p_email text, p_caso_id bigint, p_arquivo text, p_impressao text,
  p_observacao text, p_desfazer boolean)
returns jsonb language sql security definer set search_path to 'walkstamp','public'
as $$ select walkstamp.roteiro_feito(p_email, p_caso_id, p_arquivo, p_impressao, p_observacao, p_desfazer) $$;

create or replace function public.walkstamp_roteiro_atribuir(
  p_admin text, p_caso_id bigint, p_para text)
returns jsonb language sql security definer set search_path to 'walkstamp','public'
as $$ select walkstamp.roteiro_atribuir(p_admin, p_caso_id, p_para) $$;

create or replace function public.walkstamp_roteiro_apagar(p_email text, p_id bigint)
returns jsonb language sql security definer set search_path to 'walkstamp','public'
as $$ select walkstamp.roteiro_apagar(p_email, p_id) $$;

/* O e-mail chega por parâmetro. Se o navegador puder chamar isto, qualquer um
   digita o e-mail alheio e lê — ou apaga — o roteiro dos outros.
   `revoke from public` sozinho NÃO fecha: o Supabase deixa um
   `alter default privileges ... grant execute ... to anon, authenticated`
   armado, então a função nasce com concessão nominal para os dois papéis.
   Foi exatamente isso que derrubou a primeira tentativa desta migração.
   Por isso o revoke nomeia os três, e o bloco no fim confere de verdade. */
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'walkstamp\_roteiro\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

do $$
declare abertas text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into abertas
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'walkstamp\_roteiro\_%'
     and ( has_function_privilege('anon',          p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute') );
  if abertas is not null then
    raise exception 'estas funções continuam abertas para o navegador: %', abertas;
  end if;
end $$;
