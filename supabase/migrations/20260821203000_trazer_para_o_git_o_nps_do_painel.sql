/* ============================================================================
 * O QUE FOI FEITO À MÃO, ENTRANDO NO GIT.
 *
 * Esta migração não inventa nada: ela descreve três objetos que JÁ EXISTEM em
 * produção e que nenhuma migração do histórico cria. Foram escritos direto no
 * editor de SQL do painel, sem passar por `apply_migration` — e por isso não
 * estavam em lugar nenhum do repositório.
 *
 * Como isso foi descoberto: `supabase/testes/reconstruir.sh` levantou um banco
 * do zero com as 38 migrações e `impressao.sql` comparou o resultado com a
 * produção. Seis categorias bateram exatamente; a categoria `funcao` deu 83
 * contra 85, e a `permissao` 249 contra 255 — dois objetos a mais, três roles
 * cada. A diferença tinha nome.
 *
 * O que estava fora do Git:
 *
 *   walkstamp.negocio_painel_base()   a consulta grande do painel, renomeada
 *   walkstamp.negocio_nps()           o cálculo de NPS a partir das notas
 *   walkstamp.negocio_painel()        virou um invólucro de duas linhas
 *
 * Se a base tivesse sido perdida ontem, o painel voltaria SEM o NPS e com a
 * consulta antiga — e ninguém saberia dizer o que faltou, porque não havia com
 * o que comparar.
 *
 * ESTA MIGRAÇÃO É UM NO-OP EM PRODUÇÃO, de propósito: o rename é guardado por
 * um `if not exists` e as duas funções entram por `create or replace` com o
 * corpo idêntico ao que já está lá. Aplicá-la não muda uma linha do que roda
 * hoje; o que ela muda é o repositório passar a saber disso.
 * ========================================================================= */

/* O corpo de `negocio_painel_base` é BYTE A BYTE o mesmo que a migração
   `20260818030223` escreveu em `negocio_painel` — conferido por md5:
   1d12fca8a3a3898c42bce34673ee5815, 6424 bytes nos dois lados.

   Por isso aqui é um RENAME e não uma cópia. Copiar 6,4 KB de SQL para dizer a
   mesma coisa criaria duas fontes para a mesma consulta, e a segunda começaria
   a divergir da primeira no dia seguinte. */
do $$
begin
  if not exists (select 1 from pg_proc p
                   join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'walkstamp' and p.proname = 'negocio_painel_base') then
    alter function walkstamp.negocio_painel() rename to negocio_painel_base;
  end if;
end $$;

/* O NPS, calculado das notas que chegam pela ficha do produto.

   `nps` é null quando não há nota nenhuma, e não zero: zero é um NPS neutro
   real (tantos promotores quanto detratores) e mostrá-lo sem amostra seria a
   tela afirmando uma medida que ninguém tomou. */
create or replace function walkstamp.negocio_nps()
returns jsonb language sql as $$
  with n as (
    select nota from walkstamp.recado where nota is not null and nota between 0 and 10
  ), c as (
    select count(*)::int total,
           count(*) filter (where nota >= 9)::int promo,
           count(*) filter (where nota <= 6)::int detra,
           count(*) filter (where nota in (7,8))::int passivo,
           round(avg(nota)::numeric, 1) media
      from n
  )
  select jsonb_build_object(
    'total', total, 'promotores', promo, 'passivos', passivo, 'detratores', detra,
    'media', media,
    'nps', case when total = 0 then null
                else round((promo::numeric - detra::numeric) * 100 / total)::int end,
    'faixas', coalesce((select jsonb_agg(jsonb_build_object('chave', nota::text, 'n', q) order by nota)
                        from (select nota, count(*) q from n group by nota) f), '[]'::jsonb)
  ) from c;
$$;

/* E o painel passa a ser a soma dos dois. A fachada `public.walkstamp_negocio_painel()`
   não muda uma vírgula — quem chama continua chamando a mesma coisa. */
create or replace function walkstamp.negocio_painel()
returns jsonb language sql as $$
  select walkstamp.negocio_painel_base() || jsonb_build_object('nps', walkstamp.negocio_nps());
$$;
