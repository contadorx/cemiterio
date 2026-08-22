/* O índice do blog.
 *
 * Ele lista o que existe NAQUELE idioma, e não tudo traduzido pela metade: um
 * índice em alemão com títulos em português é pior do que um índice curto — diz
 * à pessoa que ela está no lugar errado.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { IDIOMAS, type Lang, marca, tokens } from '@/lib/site';
import { lista, type Resumo } from '@/lib/blog';
import { BLOG_TXT, enderecoBlog, dataDe } from './txt';

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
export const dynamicParams = false;

export function generateStaticParams() {
  return IDIOMAS.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: PageProps<'/[lang]/blog'>): Promise<Metadata> {
  const { lang } = await params;
  const b = BLOG_TXT[lang as Lang] || BLOG_TXT.pt;
  return {
    title: `${b.titulo} — ${marca.marca}`,
    description: b.lead,
    alternates: {
      canonical: marca.site + enderecoBlog(lang as Lang),
      languages: {
        ...Object.fromEntries(IDIOMAS.map((L) => [L, marca.site + enderecoBlog(L)])),
        'x-default': marca.site + enderecoBlog('en'),
      },
      /* O feed anunciado no `<head>`: é assim que um leitor de RSS descobre que
         ele existe sem alguém colar o endereço. Um feed que ninguém encontra é
         um feed que não existe. */
      types: { 'application/rss+xml': `${marca.site}${enderecoBlog(lang as Lang)}/rss.xml` },
    },
  };
}

export default async function Indice({ params }: PageProps<'/[lang]/blog'>) {
  const { lang } = await params;
  if (!IDIOMAS.includes(lang as Lang)) notFound();
  const L = lang as Lang;
  const b = BLOG_TXT[L] || BLOG_TXT.pt;

  let posts: Resumo[] = [];
  let erro = '';
  try {
    const r = await lista(L);
    posts = Array.isArray(r) ? r : [];
    if (!Array.isArray(r)) erro = 'resposta fora de formato';
  } catch (e) { erro = String(e).slice(0, 160); }

  return (
    <section style={{ paddingTop: 40 }}>
      {/* Sem largura própria: a `.wrap` do site já tem uma, e uma segunda
          aqui desalinhava o título do índice em relação ao logotipo do
          cabeçalho — 28 px de desencontro que se veem de longe. */}
      <div className="wrap">
        <h1>{b.titulo}</h1>
        <p className="lead">{b.lead}</p>
        {/* O feed dito na tela, e não só no `<head>`: quem usa leitor de RSS
            procura o link, e a maioria dos navegadores parou de mostrar o do
            cabeçalho há anos. */}
        <p className="small"><a href={`${enderecoBlog(L)}/rss.xml`}>{b.assinar}</a></p>

        {erro && <p className="aviso err">{b.erro}</p>}
        {!erro && posts.length === 0 && <p className="small muted">{b.vazio}</p>}

        <ul className="postList">
          {posts.map((p) => (
            <li key={p.chave}>
              <a href={`${enderecoBlog(L)}/${p.slug}`} className={p.capa ? 'comCapa' : undefined}>
                {/* A capa entra como IMAGEM e não como fundo de CSS: fundo não
                    tem `alt`, não é lido por leitor de tela e não aparece quando
                    a imagem demora. */}
                {p.capa && <img src={p.capa} alt="" loading="lazy" />}
                <div>
                  <h2>{p.titulo}</h2>
                  <p>{p.resumo}</p>
                </div>
              </a>
              <p className="small muted">
                <time dateTime={p.publicado_em}>{dataDe(L, p.publicado_em)}</time>
                {p.autor ? ` · ${p.autor}` : ''}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
