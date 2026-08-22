/* O QUE O BUSCADOR LÊ — num lugar só.
 *
 * Sitemap, RSS e dados estruturados são três formatos diferentes dizendo as
 * mesmas coisas: que endereços existem, quando mudaram e o que há dentro deles.
 * Escritos em três arquivos, eles divergem — e a divergência é invisível, porque
 * nenhuma delas aparece na tela. O sintoma chega meses depois, como "o post não
 * indexou", e não há como saber qual das três cópias estava errada.
 *
 * ---- por que XML montado à mão, e não a API de sitemap do Next ----
 *
 * `app/sitemap.ts` sabe fazer `<loc>` e `<lastmod>`, e sabe declarar idiomas
 * alternativos — mas não escreve `x-default`, que é justamente o que diz ao
 * buscador para onde mandar quem não casa com nenhum dos cinco. O mapa das
 * páginas fixas, escrito pelo `build.py`, já declarava `x-default` desde
 * sempre; um mapa novo que o perdesse seria um passo atrás disfarçado de
 * modernização.
 */
import { marca } from '@/lib/marca';

export const esc = (s: unknown) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** `2026-08-20`, que é a forma que o sitemap aceita e a que não depende de fuso
 *  para ser comparada. Uma data inválida vira vazio, e não `Invalid Date` — um
 *  `<lastmod>` quebrado invalida a entrada inteira para alguns rastreadores. */
export function dataISO(v: unknown): string {
  const d = new Date(String(v || ''));
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** A data completa, para o RSS — que pede RFC 822, e não ISO. */
export function dataRfc(v: unknown): string {
  const d = new Date(String(v || ''));
  return isNaN(d.getTime()) ? '' : d.toUTCString();
}

export const SITE = marca.site;

/** Os cabeçalhos de um XML servido de rota.
 *
 *  `s-maxage` com `stale-while-revalidate` porque um sitemap não precisa estar
 *  fresco ao segundo: ele precisa EXISTIR quando o rastreador vier, e um pedido
 *  ao banco por rastreio é um custo que não compra nada. */
export const XML = (corpo: string, minutos = 30) =>
  new Response(corpo, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `public, max-age=0, s-maxage=${minutos * 60}, stale-while-revalidate=86400`,
    },
  });

/* ------------------------------------------------------- dados estruturados */

/** O bloco `<script type="application/ld+json">`, já escapado.
 *
 *  `</script>` dentro de uma string JSON fecharia a etiqueta e o resto do JSON
 *  viraria HTML na página — é a mesma família do defeito que o `paraHtml` do
 *  blog evita, e a defesa é a mesma: escapar antes, não depois. */
export const ldJson = (dado: unknown) =>
  JSON.stringify(dado).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

/** Quem publica. Sai do `marca.json`, que é o dono do nome e do domínio — o
 *  mesmo lugar de onde o rodapé e o PDF tiram a razão social e o CNPJ. */
export function organizacao() {
  return {
    '@type': 'Organization',
    name: marca.marca,
    url: SITE,
    logo: { '@type': 'ImageObject', url: `${SITE}/logo.svg` },
    legalName: marca.empresa,
    email: marca.contato,
  };
}

/** A trilha. Ela não muda onde a página aparece; muda COMO ela aparece — o
 *  resultado passa a mostrar o caminho em vez do endereço cru. */
export function trilha(itens: Array<{ nome: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: itens.map((i, n) => ({
      '@type': 'ListItem', position: n + 1, name: i.nome, item: i.url,
    })),
  };
}
