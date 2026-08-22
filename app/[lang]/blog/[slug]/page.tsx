/* Um post.
 *
 * O `hreflang` sai dos idiomas que o post REALMENTE tem, e não da lista de
 * idiomas do site. Anunciar uma versão alemã que não existe manda o buscador
 * para um 404 do próprio site — e este projeto já perdeu o alemão e o francês
 * exatamente por uma lista escrita à mão ao lado de uma lista de verdade.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { IDIOMAS, type Lang, endereco, marca } from '@/lib/site';
import { post, paraHtml, minutos, ligarTermos, type Post } from '@/lib/blog';
import { BLOG_TXT, enderecoBlog, dataDe, enderecoTag, enderecoAutor } from '../txt';
import { ldJson, organizacao, trilha } from '@/lib/seo';
import Partilhar from '../Partilhar';

/* ---- O CACHE MUDOU DE LUGAR: da PÁGINA para a LEITURA ----

   O item era "trocar `force-dynamic` por `revalidate`", e a primeira versão fez
   exatamente isso — e trouxe um defeito próprio: com `revalidate`, o Next monta
   a página no BUILD e serve esse retrato até a primeira revalidação. Num build
   sem banco (uma prévia, um deploy com o Supabase fora do ar) o blog nasce
   VAZIO e fica assim por cinco minutos, respondendo 200 com uma lista que não
   existe. Um índice vazio servido a um rastreador é pior do que um índice
   lento: ele ensina que não há nada aqui.

   O que custava não era montar a página — era a CONSULTA. `force-dynamic`
   arrasta consigo `fetchCache: 'force-no-store'`, e era daí que vinha uma ida
   ao Supabase por visita de robô. Declarando `default-cache`, a leitura passa a
   valer cinco minutos (ver `CACHE_BLOG` em `lib/blog.ts`) e a página continua
   sendo montada a cada pedido, sempre com o que existe agora.

   Medido em `testes/seo.mjs`: três visitas seguidas à mesma página → ZERO
   consultas ao banco. Era esse o número do item. */
export const dynamic = 'force-dynamic';
export const fetchCache = 'default-cache';

const ehPost = (p: unknown): p is Post =>
  Boolean(p && typeof p === 'object' && (p as Post).titulo);

async function ler(lang: string, slug: string) {
  if (!IDIOMAS.includes(lang as Lang)) return null;
  try {
    const p = await post(lang as Lang, decodeURIComponent(slug));
    return ehPost(p) ? p : null;
  } catch { return null; }
}

export async function generateMetadata({ params }: PageProps<'/[lang]/blog/[slug]'>): Promise<Metadata> {
  const { lang, slug } = await params;
  const p = await ler(lang, slug);
  if (!p) return { title: marca.marca };
  const L = lang as Lang;
  const url = `${marca.site}${enderecoBlog(L)}/${p.slug}`;
  return {
    title: `${p.titulo} — ${marca.marca}`,
    description: p.resumo,
    alternates: {
      canonical: url,
      languages: {
        ...Object.fromEntries(
          Object.entries(p.idiomas || {}).map(([L2, s]) => [L2, `${marca.site}${enderecoBlog(L2 as Lang)}/${s}`])),
        /* `x-default` diz para onde mandar quem não casa com nenhum dos cinco.
           Ele aponta para o inglês QUANDO ELE EXISTE — mandar para um idioma
           que este post não tem repetiria o 404 que o resto do `hreflang`
           evita. */
        'x-default': `${marca.site}${enderecoBlog((p.idiomas || {}).en ? 'en' : L)}/${(p.idiomas || {}).en || p.slug}`,
      },
      types: { 'application/rss+xml': `${marca.site}${enderecoBlog(L)}/rss.xml` },
    },
    openGraph: {
      type: 'article', title: p.titulo, description: p.resumo, url,
      siteName: marca.marca, locale: L, publishedTime: p.publicado_em,
      /* Quando mudou e quem escreveu. O `publishedTime` sozinho conta metade da
         história: um artigo revisado há uma semana e um abandonado há dois anos
         são a mesma coisa para quem só vê a data de publicação. */
      modifiedTime: p.atualizado_em || p.publicado_em,
      authors: p.autor ? [p.autor] : undefined,
      tags: p.tags && p.tags.length ? p.tags : undefined,
      /* A capa do post, quando existe, no lugar da imagem generica do site.
         Compartilhar cinco posts com a mesma figura e quase o mesmo que
         compartilhar sem figura: a linha do tempo deixa de distinguir um do
         outro. */
      images: [p.capa
        ? { url: p.capa }
        : { url: `${marca.site}/og/og.${L}.png`, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title: p.titulo, description: p.resumo,
               images: [p.capa || `${marca.site}/og/og.${L}.png`] },
  };
}

export default async function Publicacao({ params }: PageProps<'/[lang]/blog/[slug]'>) {
  const { lang, slug } = await params;
  const p = await ler(lang, slug);
  if (!p) notFound();
  const L = lang as Lang;
  const b = BLOG_TXT[L] || BLOG_TXT.pt;
  const url = `${marca.site}${enderecoBlog(L)}/${p.slug}`;
  const outros = Object.entries(p.idiomas || {}).filter(([L2]) => L2 !== L);

  /* ---- OS DADOS ESTRUTURADOS ----

     Eles não mudam ONDE a página aparece; mudam COMO ela aparece. Um resultado
     com autor, data e trilha ocupa mais espaço e diz mais antes do clique — e é
     o único investimento desta lista que mexe na aparência do resultado.

     `Article` e não `BlogPosting`: os dois valem, e `Article` é o que o Google
     documenta com mais campos. `dateModified` vai junto pelo mesmo motivo do
     `modifiedTime` no Open Graph. */
  const artigo = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: p.titulo,
    description: p.resumo,
    inLanguage: L,
    datePublished: p.publicado_em,
    dateModified: p.atualizado_em || p.publicado_em,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    ...(p.capa ? { image: [p.capa] } : {}),
    ...(p.autor ? { author: { '@type': 'Person', name: p.autor,
                              url: `${marca.site}${enderecoAutor(L, p.autor)}` } } : {}),
    publisher: organizacao(),
    ...(p.tags && p.tags.length ? { keywords: p.tags.join(', ') } : {}),
  };
  const migalhas = trilha([
    { nome: marca.marca, url: marca.site + endereco('home', L) },
    { nome: b.titulo, url: marca.site + enderecoBlog(L) },
    { nome: p.titulo, url },
  ]);

  return (
    <section style={{ paddingTop: 40 }}>
      <script type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: ldJson(artigo) }} />
      <script type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: ldJson(migalhas) }} />
      <div className="wrap" style={{ maxWidth: 760 }}>
        <p className="small"><a href={enderecoBlog(L)}>← {b.voltar}</a></p>
        <article className="post">
          <h1>{p.titulo}</h1>
          <p className="small muted">
            <time dateTime={p.publicado_em}>{dataDe(L, p.publicado_em)}</time>
            {/* O autor deixou de ser um nome solto: ele leva à página dele, que
                é o que dá a um artigo alguém por trás. */}
            {p.autor ? <> · <a href={enderecoAutor(L, p.autor)}>{p.autor}</a></> : null}
            {' · '}{minutos(p.corpo)} {b.minutos}
          </p>
          {/* As tags eram um campo do banco que não virava nada. Tag que não
              vira página não faz nada — nem para quem lê, nem para o buscador. */}
          {p.tags && p.tags.length > 0 && (
            <p className="small muted postTags">
              {p.tags.map((tg) => (
                <a key={tg} href={enderecoTag(L, tg)} className="tagChip">{tg}</a>
              ))}
            </p>
          )}
          {p.resumo && <p className="lead">{p.resumo}</p>}
          {p.capa && <img className="postCapa" src={p.capa} alt="" />}
          {/* O HTML aqui foi montado pelo `paraHtml`, que escapa TUDO antes de
              aplicar as marcas permitidas. É o único ponto do site que injeta
              HTML vindo do banco, e é por isso que a conversão mora numa função
              só, com a ordem escrita no comentário dela. */}
          {/* `ligarTermos` acrescenta, ao corpo já convertido, UM link por
              página de caso — na primeira vez que o termo aparece e só ali. É o
              que transfere autoridade do artigo para a página que vende, e é o
              que o artigo não fazia: ele linkava o próprio blog e o rodapé. */}
          <div className="postCorpo"
               dangerouslySetInnerHTML={{ __html: ligarTermos(paraHtml(p.corpo), L) }} />
        </article>

        <Partilhar lang={L} url={url} titulo={p.titulo} />

        {outros.length > 0 && (
          <p className="small muted" style={{ marginTop: 20 }}>
            {outros.map(([L2, s]) => (
              <a key={L2} href={`${enderecoBlog(L2 as Lang)}/${s}`} style={{ marginRight: 14 }}>
                {L2.toUpperCase()}
              </a>
            ))}
          </p>
        )}
      </div>
    </section>
  );
}
