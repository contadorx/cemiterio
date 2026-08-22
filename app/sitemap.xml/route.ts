/* O ÍNDICE DOS MAPAS.
 *
 * `/sitemap.xml` era um arquivo estático escrito pelo `build.py`. Isso bastava
 * enquanto o site fosse só páginas fixas — elas mudam quando alguém faz deploy,
 * e o arquivo nasce no mesmo deploy.
 *
 * O blog quebrou essa conta. Um post publicado pelo painel entra no ar na hora
 * e ficava FORA DO MAPA até a próxima subida de código, que pode ser semanas.
 * O buscador acabaria achando pelo link do índice, mas "acabaria achando" é
 * exatamente o que um sitemap existe para não depender.
 *
 * Então aqui é um índice, e ele aponta para dois mapas com cadências
 * diferentes: o das páginas, que nasce no build e é servido do disco, e o do
 * blog, que é lido do banco a cada rastreio. Cada um com o seu `lastmod` —
 * é por ele que o rastreador decide qual dos dois vale reabrir.
 */
import { SITE, XML, dataISO } from '@/lib/seo';
import { lista } from '@/lib/blog';
import { IDIOMAS, type Lang } from '@/lib/site';

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

export async function GET() {
  /* O `lastmod` do mapa do blog é a data do post mais recente em qualquer
     idioma. Sem ele o índice diz "há dois mapas" e não diz qual mudou, que é a
     única informação que um índice acrescenta. */
  let recente = '';
  await Promise.all(IDIOMAS.map(async (L) => {
    try {
      const posts = await lista(L as Lang);
      for (const p of Array.isArray(posts) ? posts : []) {
        const d = dataISO(p.publicado_em);
        if (d > recente) recente = d;
      }
    } catch { /* banco mudo: o índice continua valendo, sem a data */ }
  }));

  const mapa = (loc: string, quando: string) =>
    `  <sitemap>\n    <loc>${loc}</loc>` +
    (quando ? `\n    <lastmod>${quando}</lastmod>` : '') + `\n  </sitemap>`;

  return XML(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    mapa(`${SITE}/sitemap-paginas.xml`, '') + '\n' +
    mapa(`${SITE}/sitemap-blog.xml`, recente) + '\n' +
    '</sitemapindex>\n');
}
