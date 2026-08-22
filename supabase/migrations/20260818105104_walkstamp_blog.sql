-- O BLOG.
--
-- Duas tabelas, e a divisao entre elas e a regra do produto: um POST e uma
-- coisa so, com uma data de publicacao so; o que muda por idioma e o TEXTO e o
-- endereco. Guardar "o post em portugues" e "o post em ingles" como dois posts
-- independentes e como o alemao deste site ficou sem hreflang: duas linhas para
-- a mesma coisa, uma atualizada e a outra nao.

create table if not exists walkstamp.post (
  id            bigserial primary key,
  -- a identidade do post, a mesma em todos os idiomas. O endereco publico NAO e
  -- esta chave: ele e o slug traduzido, que muda por idioma.
  chave         text        not null unique,
  publicado_em  timestamptz,          -- null = rascunho
  autor         text,
  tags          text[]      not null default '{}',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists walkstamp.post_idioma (
  post_id  bigint not null references walkstamp.post(id) on delete cascade,
  lang     text   not null check (lang in ('pt','en','es','de','fr')),
  slug     text   not null,
  titulo   text   not null,
  resumo   text   not null default '',
  corpo    text   not null default '',
  primary key (post_id, lang),
  -- dois posts nao podem disputar o mesmo endereco no mesmo idioma
  unique (lang, slug)
);

create index if not exists post_publicado_idx on walkstamp.post (publicado_em desc);

alter table walkstamp.post enable row level security;
alter table walkstamp.post_idioma enable row level security;

-- ------------------------------------------------------------------ leitura

-- A lista de um idioma. So o que esta publicado, e so o que existe NAQUELE
-- idioma: um indice que lista um titulo em portugues numa pagina alema e pior
-- do que um indice curto.
create or replace function walkstamp.blog_lista(p_lang text)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x order by x->>'publicado_em' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'chave', p.chave, 'slug', i.slug, 'titulo', i.titulo, 'resumo', i.resumo,
      'autor', p.autor, 'tags', to_jsonb(p.tags),
      'publicado_em', p.publicado_em
    ) x
    from walkstamp.post p join walkstamp.post_idioma i on i.post_id = p.id
    where p.publicado_em is not null and p.publicado_em <= now()
      and i.lang = p_lang and btrim(i.titulo) <> ''
  ) t;
$$;

-- Um post. `idiomas` vem junto porque e dele que sai o `hreflang`: anunciar uma
-- versao alema que nao existe manda o buscador para um 404 do proprio site.
create or replace function walkstamp.blog_post(p_lang text, p_slug text)
returns jsonb language sql stable as $$
  select coalesce((
    select jsonb_build_object(
      'chave', p.chave, 'slug', i.slug, 'titulo', i.titulo, 'resumo', i.resumo,
      'corpo', i.corpo, 'autor', p.autor, 'tags', to_jsonb(p.tags),
      'publicado_em', p.publicado_em, 'atualizado_em', p.atualizado_em,
      'idiomas', (select jsonb_object_agg(j.lang, j.slug)
                    from walkstamp.post_idioma j
                   where j.post_id = p.id and btrim(j.titulo) <> '')
    )
    from walkstamp.post p join walkstamp.post_idioma i on i.post_id = p.id
    where p.publicado_em is not null and p.publicado_em <= now()
      and i.lang = p_lang and i.slug = p_slug
  ), '{}'::jsonb);
$$;

-- ------------------------------------------------------------------- gestao

create or replace function walkstamp.blog_todos()
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x order by x->>'atualizado_em' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'chave', p.chave, 'autor', p.autor, 'tags', to_jsonb(p.tags),
      'publicado_em', p.publicado_em, 'criado_em', p.criado_em,
      'atualizado_em', p.atualizado_em,
      'versoes', coalesce((select jsonb_object_agg(j.lang, jsonb_build_object(
                             'slug', j.slug, 'titulo', j.titulo,
                             'resumo', j.resumo, 'corpo', j.corpo))
                          from walkstamp.post_idioma j where j.post_id = p.id), '{}'::jsonb)
    ) x from walkstamp.post p
  ) t;
$$;

create or replace function walkstamp.blog_salvar(
  p_chave text, p_autor text, p_tags text[], p_versoes jsonb)
returns jsonb language plpgsql as $$
declare
  v_id bigint;
  k text;
  v jsonb;
begin
  if coalesce(btrim(p_chave), '') = '' then
    return jsonb_build_object('erro', 'sem_chave');
  end if;

  insert into walkstamp.post (chave, autor, tags)
       values (btrim(p_chave), nullif(btrim(coalesce(p_autor, '')), ''), coalesce(p_tags, '{}'))
  on conflict (chave) do update
     set autor = excluded.autor, tags = excluded.tags, atualizado_em = now()
  returning id into v_id;

  for k, v in select * from jsonb_each(coalesce(p_versoes, '{}'::jsonb)) loop
    if coalesce(btrim(v->>'titulo'), '') = '' then
      -- idioma esvaziado: sai da tabela, e com ele o endereco publico dele
      delete from walkstamp.post_idioma where post_id = v_id and lang = k;
    else
      insert into walkstamp.post_idioma (post_id, lang, slug, titulo, resumo, corpo)
      values (v_id, k,
              coalesce(nullif(btrim(v->>'slug'), ''), btrim(p_chave)),
              btrim(v->>'titulo'), coalesce(v->>'resumo', ''), coalesce(v->>'corpo', ''))
      on conflict (post_id, lang) do update
         set slug = excluded.slug, titulo = excluded.titulo,
             resumo = excluded.resumo, corpo = excluded.corpo;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'chave', btrim(p_chave));
exception when unique_violation then
  return jsonb_build_object('erro', 'endereco_repetido');
end $$;

-- Publicar EXIGE portugues e ingles. E a regra que o pedido trouxe: um post e
-- uma coisa so, nos dois idiomas. Escrita aqui, e nao so na tela, ela vale
-- tambem para quem publicar por outro caminho.
create or replace function walkstamp.blog_publicar(p_chave text, p_publicar boolean)
returns jsonb language plpgsql as $$
declare v_id bigint; v_faltam text[];
begin
  select id into v_id from walkstamp.post where chave = btrim(p_chave);
  if v_id is null then return jsonb_build_object('erro', 'nao_achei'); end if;

  if p_publicar then
    select array_agg(l) into v_faltam from unnest(array['pt','en']) l
     where not exists (select 1 from walkstamp.post_idioma i
                        where i.post_id = v_id and i.lang = l and btrim(i.titulo) <> '');
    if v_faltam is not null then
      return jsonb_build_object('erro', 'falta_idioma', 'idiomas', to_jsonb(v_faltam));
    end if;
    update walkstamp.post set publicado_em = coalesce(publicado_em, now()), atualizado_em = now()
     where id = v_id;
  else
    update walkstamp.post set publicado_em = null, atualizado_em = now() where id = v_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function walkstamp.blog_apagar(p_chave text)
returns jsonb language sql as $$
  with x as (delete from walkstamp.post where chave = btrim(p_chave) returning 1)
  select jsonb_build_object('ok', exists(select 1 from x));
$$;

-- ------------------------------------------------------------------ fachada

create or replace function public.walkstamp_blog_lista(p_lang text)
returns jsonb language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.blog_lista(p_lang); $$;

create or replace function public.walkstamp_blog_post(p_lang text, p_slug text)
returns jsonb language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.blog_post(p_lang, p_slug); $$;

create or replace function public.walkstamp_blog_todos()
returns jsonb language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.blog_todos(); $$;

create or replace function public.walkstamp_blog_salvar(p_chave text, p_autor text, p_tags text[], p_versoes jsonb)
returns jsonb language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.blog_salvar(p_chave, p_autor, p_tags, p_versoes); $$;

create or replace function public.walkstamp_blog_publicar(p_chave text, p_publicar boolean)
returns jsonb language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.blog_publicar(p_chave, p_publicar); $$;

create or replace function public.walkstamp_blog_apagar(p_chave text)
returns jsonb language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.blog_apagar(p_chave); $$;

-- As de LEITURA sao publicas por natureza: o blog e conteudo aberto, e quem le
-- e o servidor do site. As de GESTAO escrevem e apagam post -- e o navegador
-- nunca pode chama-las.
revoke all on function public.walkstamp_blog_lista(text)   from public, anon, authenticated;
revoke all on function public.walkstamp_blog_post(text,text) from public, anon, authenticated;
revoke all on function public.walkstamp_blog_todos()       from public, anon, authenticated;
revoke all on function public.walkstamp_blog_salvar(text,text,text[],jsonb) from public, anon, authenticated;
revoke all on function public.walkstamp_blog_publicar(text,boolean) from public, anon, authenticated;
revoke all on function public.walkstamp_blog_apagar(text)  from public, anon, authenticated;

grant execute on function public.walkstamp_blog_lista(text)   to service_role;
grant execute on function public.walkstamp_blog_post(text,text) to service_role;
grant execute on function public.walkstamp_blog_todos()       to service_role;
grant execute on function public.walkstamp_blog_salvar(text,text,text[],jsonb) to service_role;
grant execute on function public.walkstamp_blog_publicar(text,boolean) to service_role;
grant execute on function public.walkstamp_blog_apagar(text)  to service_role;
