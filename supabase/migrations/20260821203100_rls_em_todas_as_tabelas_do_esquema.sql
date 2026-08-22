/* ============================================================================
 * A RLS QUE O DESENHO PROMETEU, NAS SETE TABELAS QUE FICARAM DE FORA.
 *
 * A primeira migração do projeto escreveu a regra com todas as letras:
 *
 *     -- RLS ligada e NENHUMA policy, de propósito: só o service_role enxerga
 *     -- estas tabelas. Todo o resto passa pelas funções abaixo.
 *
 * Ela valeu para as quatro tabelas daquele dia. Das catorze que vieram depois,
 * sete ficaram sem — não por decisão, mas porque `alter table ... enable row
 * level security` é uma linha fácil de esquecer e nada reclama quando falta.
 *
 *   sem RLS hoje:  cliente, config, emissao, fatura, modelo_doc, recado, usuario
 *
 * O QUE ISTO NÃO É: um buraco aberto. Medido na produção, `anon` e
 * `authenticated` não têm USAGE no esquema `walkstamp` e não têm SELECT em
 * nenhuma das dezoito tabelas — a parede que segura é essa, e ela está de pé.
 * O PostgREST também só expõe `public`.
 *
 * O QUE ISTO É: a segunda tranca. A parede é uma linha de `grant` que um dia
 * alguém concede sem pensar, e no dia em que isso acontecer a diferença entre
 * as onze tabelas e as sete é a diferença entre nada vazar e vazar fatura,
 * usuário e chamado. Ligar RLS onde não há política é gratuito — quem lê hoje
 * (o `service_role`, que tem BYPASSRLS, e as funções `security definer`, que
 * rodam como dona das tabelas) continua lendo igual.
 *
 * Provado em `supabase/testes/prova.sh`: as dezoito ficam ligadas e as funções
 * continuam devolvendo o que devolviam.
 * ========================================================================= */

alter table walkstamp.cliente    enable row level security;
alter table walkstamp.config     enable row level security;
alter table walkstamp.emissao    enable row level security;
alter table walkstamp.fatura     enable row level security;
alter table walkstamp.modelo_doc enable row level security;
alter table walkstamp.recado     enable row level security;
alter table walkstamp.usuario    enable row level security;

/* A trava, no mesmo espírito das outras três do histórico: uma migração que
   "liga RLS" e deixa uma tabela de fora é um comentário tranquilizador em cima
   de um buraco. Esta conta e derruba. */
do $$
declare faltando text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into faltando
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'walkstamp' and c.relkind = 'r' and not c.relrowsecurity;
  if faltando is not null then
    raise exception 'estas tabelas do esquema walkstamp continuam sem RLS: %', faltando;
  end if;
end $$;
