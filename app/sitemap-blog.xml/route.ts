/* O MAPA DO BLOG — lido do banco, e não do último deploy.
 *
 * Cada post entra uma vez POR IDIOMA em que ele existe, com os outros idiomas
 * declarados como alternativos. Anunciar uma versão alemã que não existe manda
 * o buscador para um 404 do próprio site — por isso o `hreflang` sai de
 * `p.idiomas`, que é o que o post REALMENTE tem, e não da lista de idiomas do
 * site. É a mesma regra que a página do post já seguia.
 *
 * O índice do blog entra também: ele é a porta, e uma porta que não está no
 * mapa é uma porta que o rastreador só encontra por acidente.
 */
import { SITE, XML, dataISO, esc } from '@/lib/seo';
import { lista, post, type Resumo } from '@/lib/blog';
import { IDIOMAS, type Lang } from '@/lib/site';
import { enderecoBlog } from '@/app/[lang]/blog/txt';

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

const hreflang = (L: string) => (L === 'pt' ? 'pt-BR' : L);

export async function GET() {
  const urls: string[] = [];

  /* O índice, nos cinco idiomas, com os cinco declarados entre si. Ele existe
     sempre, mesmo com o banco mudo — é página do site, não conteúdo do banco. */
  const altIndice = IDIOMAS.map((L) =>
    `\n    <xhtml:link rel="alternate" hreflang="${hreflang(L)}" href="${SITE}${enderecoBlog(L as Lang)}"/>`).join('');
  for (const L of IDIOMAS) {
    urls.push(`  <url>\n    <loc>${SITE}${enderecoBlog(L as Lang)}</loc>${altIndice}` +
      `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${enderecoBlog('en')}"/>\n  </url>`);
  }

  /* Uma leitura por idioma, e não uma por post: `lista()` já devolve tudo o que
     está publicado naquele idioma. O `atualizado_em` — que é o `lastmod` bom —
     só vem no post inteiro, então ele é buscado à parte, em paralelo. Numa
     dezena de posts isso é barato; se um dia forem centenas, o certo é o banco
     devolver a data na lista, e não este arquivo virar um laço de N pedidos. */
  const porIdioma = await Promise.all(IDIOMAS.map(async (L) => {
    try {
      const r = await lista(L as Lang);
      return { L: L as Lang, posts: (Array.isArray(r) ? r : []) as Resumo[] };
    } catch { return { L: L as Lang, posts: [] as Resumo[] }; }
  }));

  const detalhes = await Promise.all(porIdioma.flatMap(({ L, posts }) =>
    posts.map(async (p) => {
      try {
        const inteiro = await post(L, p.slug);
        return { L, p, cheio: inteiro as { atualizado_em?: string; idiomas?: Record<string, string> } };
      } catch { return { L, p, cheio: null }; }
    })));

  for (const { L, p, cheio } of detalhes) {
    const quando = dataISO(cheio?.atualizado_em || p.publicado_em);
    const idiomas = cheio?.idiomas || { [L]: p.slug };
    const alt = Object.entries(idiomas).map(([L2, s]) =>
      `\n    <xhtml:link rel="alternate" hreflang="${hreflang(L2)}" href="${SITE}${enderecoBlog(L2 as Lang)}/${esc(s)}"/>`).join('');
    /* `x-default` aponta para o inglês quando ele existe, e para o próprio post
       quando não — mandar para um idioma que este post não tem seria repetir o
       404 que o `hreflang` daqui evita. */
    const padrao = idiomas.en ? `${SITE}${enderecoBlog('en')}/${esc(idiomas.en)}`
                              : `${SITE}${enderecoBlog(L)}/${esc(p.slug)}`;
    urls.push(`  <url>\n    <loc>${SITE}${enderecoBlog(L)}/${esc(p.slug)}</loc>` +
      (quando ? `\n    <lastmod>${quando}</lastmod>` : '') + alt +
      `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${padrao}"/>\n  </url>`);
  }

  return XML(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
    'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + urls.join('\n') + '\n</urlset>\n');
}
