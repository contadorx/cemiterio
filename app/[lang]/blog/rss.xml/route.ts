/* O RSS do blog, um por idioma.
 *
 * É o único jeito de um agregador, um leitor ou uma newsletter descobrirem um
 * post novo sem alguém avisar. O sitemap serve ao buscador; o RSS serve a
 * gente — e são públicos diferentes com formatos diferentes, não duas cópias da
 * mesma coisa.
 *
 * Um feed POR IDIOMA, e não um feed com tudo dentro: quem assina o alemão não
 * quer receber português, e um feed misturado é um feed que se cancela.
 *
 * O corpo NÃO vai inteiro. Vai o resumo, que é o que o autor escreveu para
 * resumir — mandar o artigo completo faz o leitor de feed virar o destino final
 * e o site deixar de ser visitado, que é o oposto do que este trabalho quer.
 */
import { notFound } from 'next/navigation';
import { SITE, XML, dataRfc, esc } from '@/lib/seo';
import { lista, type Resumo } from '@/lib/blog';
import { IDIOMAS, type Lang, marca } from '@/lib/site';
import { BLOG_TXT, enderecoBlog } from '../txt';

/* `force-dynamic` COM CABEÇALHO DE CACHE PRÓPRIO, e as duas coisas juntas são
   a decisão.

   Sem ele, o Next monta este XML no BUILD. Um sitemap gerado no build é
   exatamente o que esta rodada veio desfazer: ele congela a lista de posts do
   dia do deploy, e o post publicado depois fica de fora até a próxima
   revalidação — que é o defeito, só que com meia hora em vez de semanas. Pior:
   se o banco estiver fora do ar no minuto do build, o mapa nasce VAZIO e fica
   assim.

   O cache não se perde: o `Cache-Control` que esta rota emite (`s-maxage` com
   `stale-while-revalidate`) é o que a CDN lê, e é ele que faz cem rastreios
   custarem uma leitura. A diferença é onde o cache mora — na borda, com data de
   validade, e não dentro do pacote do build. */
export const dynamic = 'force-dynamic';

/* SEM `generateStaticParams`, e isto é uma decisão.
 *
 * Com ele, o feed é montado no BUILD — e no build não há banco: o segredo de
 * serviço não existe no ambiente de compilação. O resultado é um feed vazio
 * congelado, servido a quem assinar até a primeira revalidação. Um feed vazio é
 * pior que um feed lento: o agregador registra "nada aqui" e volta mais tarde.
 *
 * Sem ele, o primeiro pedido monta e o `revalidate` guarda pelos trinta minutos
 * seguintes. O custo é uma leitura a cada meia hora; o ganho é o feed nunca
 * mentir sobre estar vazio. */

export async function GET(_req: Request, ctx: { params: Promise<{ lang: string }> }) {
  const { lang } = await ctx.params;
  if (!IDIOMAS.includes(lang as Lang)) notFound();
  const L = lang as Lang;
  const b = BLOG_TXT[L] || BLOG_TXT.pt;
  const base = `${SITE}${enderecoBlog(L)}`;

  let posts: Resumo[] = [];
  try {
    const r = await lista(L);
    posts = Array.isArray(r) ? r : [];
  } catch { /* banco mudo: um feed vazio é melhor que um erro — o assinante
                continua assinado e recebe quando voltar */ }

  const itens = posts.map((p) => {
    const url = `${base}/${esc(p.slug)}`;
    return '    <item>\n' +
      `      <title>${esc(p.titulo)}</title>\n` +
      `      <link>${url}</link>\n` +
      /* `isPermaLink="false"` porque o guid é o endereço, mas o que o
         identifica é a chave: um post que muda de slug não pode virar um item
         novo na caixa de quem já leu. */
      `      <guid isPermaLink="false">${esc(p.chave || p.slug)}</guid>\n` +
      `      <description>${esc(p.resumo)}</description>\n` +
      (p.autor ? `      <dc:creator>${esc(p.autor)}</dc:creator>\n` : '') +
      (p.tags || []).map((t) => `      <category>${esc(t)}</category>\n`).join('') +
      `      <pubDate>${dataRfc(p.publicado_em)}</pubDate>\n` +
      '    </item>';
  }).join('\n');

  return XML(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/">\n  <channel>\n' +
    `    <title>${esc(b.titulo)} — ${esc(marca.marca)}</title>\n` +
    `    <link>${base}</link>\n` +
    `    <description>${esc(b.lead)}</description>\n` +
    `    <language>${L === 'pt' ? 'pt-BR' : L}</language>\n` +
    /* O feed diz onde ele mesmo mora. Sem isso, um agregador que recebeu o
       endereço de terceiro não sabe para onde voltar quando o link muda. */
    `    <atom:link href="${base}/rss.xml" rel="self" type="application/rss+xml"/>\n` +
    (posts[0] ? `    <lastBuildDate>${dataRfc(posts[0].publicado_em)}</lastBuildDate>\n` : '') +
    itens + (itens ? '\n' : '') +
    '  </channel>\n</rss>\n');
}
