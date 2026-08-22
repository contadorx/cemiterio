/* ============================================================================
 * `search_path` FIXO NAS TREZE QUE FICARAM DE FORA.
 *
 * O resto do esquema faz isto religiosamente — toda função nasce com
 * `set search_path to 'walkstamp','public'`. Treze não nasceram: as nove do
 * blog, as três de negócio e `chamado_responder`. O linter do Supabase as
 * marca com `function_search_path_mutable`, e ele está certo.
 *
 * O RISCO REAL AQUI É BAIXO, e vale dizer por quê em vez de fingir urgência:
 * nenhuma das treze é `security definer`, todas moram no esquema `walkstamp`
 * (que `anon` não alcança), e todas são chamadas por invólucros em `public` que
 * JÁ fixam o caminho — o `set` do invólucro vale para a chamada aninhada.
 *
 * O motivo de consertar mesmo assim é outro: uniformidade. Um esquema em que
 * 72 funções fixam o caminho e 13 não obriga quem for ler a decidir, caso a
 * caso, se aquela é uma exceção pensada ou um esquecimento. Nenhuma das duas
 * respostas estava escrita em lugar nenhum.
 *
 * Sem mudança de comportamento: os corpos das treze já qualificam tudo com
 * `walkstamp.`, então o caminho de busca nunca decidiu nada para elas.
 * ========================================================================= */

alter function walkstamp.blog_lista(text)                    set search_path to 'walkstamp','public';
alter function walkstamp.blog_post(text,text)                set search_path to 'walkstamp','public';
alter function walkstamp.blog_todos()                        set search_path to 'walkstamp','public';
alter function walkstamp.blog_salvar(text,text,text[],jsonb) set search_path to 'walkstamp','public';
alter function walkstamp.blog_publicar(text,boolean)         set search_path to 'walkstamp','public';
alter function walkstamp.blog_apagar(text)                   set search_path to 'walkstamp','public';
alter function walkstamp.blog_figura_add(text,text,text,text) set search_path to 'walkstamp','public';
alter function walkstamp.blog_figura_del(text,text)          set search_path to 'walkstamp','public';
alter function walkstamp.blog_capa(text,text)                set search_path to 'walkstamp','public';
alter function walkstamp.negocio_painel()                    set search_path to 'walkstamp','public';
alter function walkstamp.negocio_painel_base()               set search_path to 'walkstamp','public';
alter function walkstamp.negocio_nps()                       set search_path to 'walkstamp','public';
alter function walkstamp.chamado_responder(text,text)        set search_path to 'walkstamp','public';

/* A trava, como nas outras. Uma migração que "fixa o caminho" e deixa uma
   função de fora é a mesma coisa que o `revoke` que não revogava. */
do $$
declare soltas text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into soltas
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'walkstamp' and p.prokind = 'f'
     and (p.proconfig is null
          or not exists (select 1 from unnest(p.proconfig) c where c like 'search\_path=%'));
  if soltas is not null then
    raise exception 'estas funções continuam sem search_path fixo: %', soltas;
  end if;
end $$;
