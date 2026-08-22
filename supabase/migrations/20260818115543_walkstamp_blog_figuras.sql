-- As figuras do blog.
--
-- Elas moram num balde PUBLICO, e essa e a diferenca para o balde do roteiro.
-- La o arquivo e do cliente e o endereco e assinado e vence em minutos; aqui a
-- imagem faz parte de um texto que existe para ser lido por qualquer pessoa --
-- um endereco que vence seria uma figura quebrada no dia seguinte.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog', 'blog', true, 8388608,
        array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml'])
on conflict (id) do update
  set public = true, file_size_limit = 8388608, allowed_mime_types = excluded.allowed_mime_types;

-- A CAPA do post. Ela nao e "mais uma figura": e a que vai na lista e na previa
-- de quem compartilha no LinkedIn. Um link sem imagem numa linha do tempo e um
-- link que ninguem clica -- ja esta escrito assim no codigo das imagens de og.
alter table walkstamp.post add column if not exists capa text;

create table if not exists walkstamp.post_figura (
  id        bigserial primary key,
  post_id   bigint not null references walkstamp.post(id) on delete cascade,
  caminho   text   not null,          -- dentro do balde, para poder apagar de verdade
  url       text   not null,
  alt       text   not null default '',
  criado_em timestamptz not null default now(),
  unique (post_id, caminho)
);
alter table walkstamp.post_figura enable row level security;

create or replace function walkstamp.blog_figura_add(
  p_chave text, p_caminho text, p_url text, p_alt text)
returns jsonb language plpgsql as $$
declare v_id bigint;
begin
  select id into v_id from walkstamp.post where chave = btrim(p_chave);
  if v_id is null then return jsonb_build_object('erro','nao_achei'); end if;
  insert into walkstamp.post_figura (post_id, caminho, url, alt)
       values (v_id, p_caminho, p_url, coalesce(p_alt,''))
  on conflict (post_id, caminho) do update set url = excluded.url, alt = excluded.alt;
  -- A primeira figura vira capa sozinha. Escolher capa e uma decisao que quase
  -- ninguem toma, e um post sem capa e o caso ruim; a troca continua a um clique.
  update walkstamp.post set capa = coalesce(capa, p_url), atualizado_em = now() where id = v_id;
  return jsonb_build_object('ok', true, 'url', p_url);
end $$;

create or replace function walkstamp.blog_figura_del(p_chave text, p_caminho text)
returns jsonb language plpgsql as $$
declare v_id bigint; v_url text;
begin
  select id into v_id from walkstamp.post where chave = btrim(p_chave);
  if v_id is null then return jsonb_build_object('erro','nao_achei'); end if;
  delete from walkstamp.post_figura where post_id = v_id and caminho = p_caminho
    returning url into v_url;
  -- Se a capa era esta, a proxima figura assume. Deixar a capa apontando para um
  -- arquivo apagado e a previa do LinkedIn virando um quadrado cinza.
  update walkstamp.post
     set capa = (select f.url from walkstamp.post_figura f
                  where f.post_id = v_id order by f.criado_em limit 1),
         atualizado_em = now()
   where id = v_id and capa is not distinct from v_url;
  return jsonb_build_object('ok', true, 'caminho', p_caminho);
end $$;

create or replace function walkstamp.blog_capa(p_chave text, p_url text)
returns jsonb language sql as $$
  update walkstamp.post set capa = nullif(p_url,''), atualizado_em = now()
   where chave = btrim(p_chave)
  returning jsonb_build_object('ok', true);
$$;

-- As tres leituras passam a levar a capa e as figuras junto.
create or replace function walkstamp.blog_lista(p_lang text)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x order by x->>'publicado_em' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'chave', p.chave, 'slug', i.slug, 'titulo', i.titulo, 'resumo', i.resumo,
      'autor', p.autor, 'tags', to_jsonb(p.tags), 'capa', p.capa,
      'publicado_em', p.publicado_em
    ) x
    from walkstamp.post p join walkstamp.post_idioma i on i.post_id = p.id
    where p.publicado_em is not null and p.publicado_em <= now()
      and i.lang = p_lang and btrim(i.titulo) <> ''
  ) t;
$$;

create or replace function walkstamp.blog_post(p_lang text, p_slug text)
returns jsonb language sql stable as $$
  select coalesce((
    select jsonb_build_object(
      'chave', p.chave, 'slug', i.slug, 'titulo', i.titulo, 'resumo', i.resumo,
      'corpo', i.corpo, 'autor', p.autor, 'tags', to_jsonb(p.tags), 'capa', p.capa,
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

create or replace function walkstamp.blog_todos()
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x order by x->>'atualizado_em' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'chave', p.chave, 'autor', p.autor, 'tags', to_jsonb(p.tags), 'capa', p.capa,
      'publicado_em', p.publicado_em, 'criado_em', p.criado_em,
      'atualizado_em', p.atualizado_em,
      'versoes', coalesce((select jsonb_object_agg(j.lang, jsonb_build_object(
                             'slug', j.slug, 'titulo', j.titulo,
                             'resumo', j.resumo, 'corpo', j.corpo))
                          from walkstamp.post_idioma j where j.post_id = p.id), '{}'::jsonb),
      'figuras', coalesce((select jsonb_agg(jsonb_build_object(
                             'caminho', f.caminho, 'url', f.url, 'alt', f.alt)
                             order by f.criado_em)
                          from walkstamp.post_figura f where f.post_id = p.id), '[]'::jsonb)
    ) x from walkstamp.post p
  ) t;
$$;

create or replace function public.walkstamp_blog_figura_add(p_chave text, p_caminho text, p_url text, p_alt text)
returns jsonb language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.blog_figura_add(p_chave, p_caminho, p_url, p_alt); $$;

create or replace function public.walkstamp_blog_figura_del(p_chave text, p_caminho text)
returns jsonb language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.blog_figura_del(p_chave, p_caminho); $$;

create or replace function public.walkstamp_blog_capa(p_chave text, p_url text)
returns jsonb language sql security definer set search_path to 'public','walkstamp'
as $$ select walkstamp.blog_capa(p_chave, p_url); $$;

revoke all on function public.walkstamp_blog_figura_add(text,text,text,text) from public, anon, authenticated;
revoke all on function public.walkstamp_blog_figura_del(text,text) from public, anon, authenticated;
revoke all on function public.walkstamp_blog_capa(text,text) from public, anon, authenticated;
grant execute on function public.walkstamp_blog_figura_add(text,text,text,text) to service_role;
grant execute on function public.walkstamp_blog_figura_del(text,text) to service_role;
grant execute on function public.walkstamp_blog_capa(text,text) to service_role;
