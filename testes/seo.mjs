/* O QUE O BUSCADOR LÊ — sitemap, dados estruturados, feed e links internos.
 *
 * Nenhuma destas coisas aparece na tela, e é exatamente por isso que elas
 * precisam de teste: quando quebram, ninguém vê. O sintoma chega meses depois
 * como "o post não indexou", sem nada na página que indique o quê.
 *
 * As nove afirmações, na ordem em que valem:
 *
 *   1. o post está no sitemap. Nada mais importa antes disso;
 *   2. com `lastmod`, que é o que dirige o rastreio ao que mudou;
 *   3. `Article`, `Organization`, `BreadcrumbList` no post; `FAQPage` na base;
 *      `SoftwareApplication` na home — o único investimento que muda COMO o
 *      resultado aparece, e não só onde;
 *   4. as páginas do blog são CACHEADAS, e não `force-dynamic`: todo rastreio
 *      batia no banco;
 *   5. o corpo do artigo linka a página de caso — é o que transfere autoridade
 *      do artigo para a página que vende;
 *   6. o RSS existe e é anunciado no `<head>`;
 *   7. `modifiedTime`, `author` e `x-default` no post;
 *   8. a etiqueta virou página;
 *   9. o autor virou página.
 *
 *   node testes/seo.mjs
 */
import { chromium } from 'playwright';
import { spawn, execSync } from 'child_process';
import http from 'http';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const P = 8841, B = 8842;
const BASE = `http://localhost:${P}`;
const RAIZ = process.env.RAIZ || `${RAIZ_WS}`;
const CHROME = process.env.CHROME || CHROME_WS;
const SITE = 'https://walkstamp.com';

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

/* Um post com o termo "Evidência de teste" DENTRO do corpo, escrito como
   alguém escreveria — em minúscula e no meio da frase. É esse o caso que o
   link contextual precisa pegar; um termo que só aparece no título não prova
   nada sobre o corpo. */
const CORPO_PT = [
  'Toda equipe que homologa acaba montando uma evidência de teste à mão.',
  '',
  'E quando a reunião acaba, alguém escreve a ata de reunião de memória.',
  '',
  'Repetir evidência de teste aqui NÃO deve virar um segundo link.',
  '',
  '`ata de reunião` dentro de código também não.',
].join('\n');

const POST = {
  chave: 'k1', autor: 'Leandro Oliveira', tags: ['Evidência', 'QA'],
  capa: null, publicado_em: '2026-08-10T12:00:00Z', atualizado_em: '2026-08-18T09:30:00Z',
  versoes: {
    pt: { slug: 'evidencia-que-se-monta-sozinha', titulo: 'A evidência que se monta sozinha',
          resumo: 'O que muda quando o documento sai da própria gravação.', corpo: CORPO_PT },
    en: { slug: 'evidence-that-writes-itself', titulo: 'The evidence that writes itself',
          resumo: 'What changes when the document comes out of the recording.',
          corpo: 'Every team ends up writing test evidence by hand.' },
  },
};
let pedidosAoBanco = 0;
const versoesCom = (p) => Object.entries(p.versoes).filter(([, v]) => (v.titulo || '').trim());

const banco = http.createServer((q, r) => {
  const buf = [];
  q.on('data', (d) => buf.push(d));
  q.on('end', () => {
    const j = (o) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(o)); };
    if (q.url.startsWith('/auth/v1/user')) { r.writeHead(401); return r.end('{}'); }
    const fn = q.url.replace('/rest/v1/rpc/', '');
    if (fn.startsWith('walkstamp_blog_')) pedidosAoBanco++;
    const a = JSON.parse(Buffer.concat(buf).toString('utf8') || '{}');
    if (fn === 'walkstamp_blog_lista') {
      const v = POST.versoes[a.p_lang];
      return j(v ? [{ chave: POST.chave, ...v, autor: POST.autor, tags: POST.tags,
                      capa: POST.capa, publicado_em: POST.publicado_em }] : []);
    }
    if (fn === 'walkstamp_blog_post') {
      const v = POST.versoes[a.p_lang];
      if (!v || v.slug !== a.p_slug) return j({});
      return j({ chave: POST.chave, ...v, autor: POST.autor, tags: POST.tags, capa: POST.capa,
                 publicado_em: POST.publicado_em, atualizado_em: POST.atualizado_em,
                 idiomas: Object.fromEntries(versoesCom(POST).map(([L, x]) => [L, x.slug])) });
    }
    j({});
  });
});
await new Promise((r) => banco.listen(B, r));
try { execSync(`fuser -k ${P}/tcp 2>/dev/null`); } catch {}
await new Promise((r) => setTimeout(r, 400));
const next = spawn('npx', ['next', 'start', '-p', String(P)], {
  cwd: RAIZ, stdio: 'ignore',
  env: { ...process.env, SUPABASE_URL: `http://localhost:${B}`,
         SUPABASE_SERVICE_ROLE_KEY: 'chave_de_mentira',
         WALKSTAMP_SUPA_TESTE: `http://localhost:${B}` },
});
process.on('exit', () => { try { next.kill('SIGKILL'); } catch {} banco.close();
                           try { execSync(`fuser -k ${P}/tcp 2>/dev/null`); } catch {} });
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(BASE + '/'); if (r.ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

const texto = async (u) => (await fetch(BASE + u)).text();
const URL_POST = `${SITE}/blog/${POST.versoes.pt.slug}`;

// ------------------------------------------------- 1 e 3. o sitemap
console.log('\n[1] o post está no mapa, e o mapa é um índice');
{
  const idx = await texto('/sitemap.xml');
  ok('/sitemap.xml é um índice', /<sitemapindex/.test(idx));
  ok('e aponta para os dois mapas',
     idx.includes('/sitemap-paginas.xml') && idx.includes('/sitemap-blog.xml'));

  const mapa = await texto('/sitemap-blog.xml');
  /* A AFIRMAÇÃO QUE IMPORTA: o post publicado hoje está no mapa hoje, sem
     deploy nenhum. Era o item 1 da lista por um motivo. */
  ok('o post está no sitemap', mapa.includes(URL_POST), mapa.slice(0, 200));
  ok('e a versão em inglês também',
     mapa.includes(`${SITE}/en/blog/${POST.versoes.en.slug}`));
  ok('o índice do blog está lá', mapa.includes(`<loc>${SITE}/blog</loc>`));

  console.log('\n[3] lastmod');
  /* `lastmod` sai do `atualizado_em`, e não do `publicado_em`: a pergunta que
     ele responde é "mudou?", não "nasceu quando?". */
  ok('o post tem lastmod, e é a data de ATUALIZAÇÃO',
     /<lastmod>2026-08-18<\/lastmod>/.test(mapa), (mapa.match(/<lastmod>[^<]*/g) || []).join(' '));
  const paginas = await texto('/sitemap-paginas.xml');
  ok('as páginas fixas também têm lastmod', /<lastmod>\d{4}-\d\d-\d\d<\/lastmod>/.test(paginas));
  ok('e o x-default continua onde estava', paginas.includes('hreflang="x-default"'));
}

// ------------------------------------------------- 2. dados estruturados
console.log('\n[2] dados estruturados');
const blocos = async (u) => {
  const h = await texto(u);
  return [...h.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => { try { return JSON.parse(m[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>')); }
                  catch { return null; } })
    .filter(Boolean);
};
{
  const home = await blocos('/');
  const tipos = home.map((b) => b['@type']);
  console.log('     home ....: ' + tipos.join(', '));
  ok('SoftwareApplication na home', tipos.includes('SoftwareApplication'), tipos.join(','));
  ok('Organization na home', tipos.includes('Organization'), tipos.join(','));

  const ajuda = await blocos('/ajuda');
  const faq = ajuda.find((b) => b['@type'] === 'FAQPage');
  console.log('     ajuda ...: ' + ajuda.map((b) => b['@type']).join(', ') +
              (faq ? `  (${faq.mainEntity.length} perguntas)` : ''));
  ok('FAQPage na base de conhecimento', !!faq);
  ok('e com perguntas de verdade dentro', !!faq && faq.mainEntity.length > 10,
     faq ? String(faq.mainEntity.length) : '0');
  /* A marcação de FAQ TEM que bater com o texto visível — é regra do Google, e
     é justa: marcação que não corresponde ao que se lê é engano. */
  if (faq) {
    const h = await texto('/ajuda');
    const q = faq.mainEntity[0].name;
    ok('e a primeira pergunta está mesmo na página', h.includes(q), q);
  }

  const pst = await blocos(`/blog/${POST.versoes.pt.slug}`);
  const tp = pst.map((b) => b['@type']);
  console.log('     post ....: ' + tp.join(', '));
  ok('Article no post', tp.includes('Article'), tp.join(','));
  ok('BreadcrumbList no post', tp.includes('BreadcrumbList'), tp.join(','));
  const art = pst.find((b) => b['@type'] === 'Article');
  ok('com Organization como publicador', art && art.publisher &&
     art.publisher['@type'] === 'Organization');
  ok('e dateModified separado de datePublished',
     art && art.dateModified !== art.datePublished,
     art ? `${art.datePublished} / ${art.dateModified}` : '');
  ok('e o autor com endereço próprio',
     art && art.author && /\/blog\/autor\//.test(art.author.url || ''),
     art && art.author ? art.author.url : '');
  const bc = pst.find((b) => b['@type'] === 'BreadcrumbList');
  ok('a trilha tem três degraus', bc && bc.itemListElement.length === 3,
     bc ? bc.itemListElement.map((i) => i.name).join(' › ') : '');
}

// ------------------------------------------------- 4. cache
console.log('\n[4] as páginas do blog não batem no banco a cada visita');
{
  /* A PERGUNTA CERTA É DO LADO DO BANCO, e não do cabeçalho da resposta.

     `force-dynamic` fazia cada visita virar uma consulta ao Supabase — é o que
     o item dizia, e é o que dá para medir aqui: quantos pedidos o banco recebe
     em três visitas seguidas à MESMA página.

     Medir o `Cache-Control` do HTML responderia outra coisa: no Next, uma rota
     com segmento dinâmico e sem `generateStaticParams` é montada a cada pedido
     mesmo com `revalidate`, e o cabeçalho diz `no-store` de qualquer forma. O
     que passou a ser guardado é a LEITURA, e é ela que custava. */
  const antes = pedidosAoBanco;
  for (let i = 0; i < 3; i++) await texto(`/blog/${POST.versoes.pt.slug}`);
  const gastos = pedidosAoBanco - antes;
  console.log('     três visitas → ' + gastos + ' pedido(s) ao banco');
  ok('três visitas não viram três consultas', gastos < 3, gastos + ' consultas em 3 visitas');
  const rr = await fetch(BASE + '/sitemap-blog.xml');
  ok('e o sitemap manda a CDN guardar',
     /s-maxage/.test(rr.headers.get('cache-control') || ''),
     rr.headers.get('cache-control'));
}

// ------------------------------------------------- 5. links contextuais
console.log('\n[5] o corpo do artigo linka a página que vende');
{
  const h = await texto(`/blog/${POST.versoes.pt.slug}`);
  const corpo = (h.match(/<div class="postCorpo">([\s\S]*?)<\/div>/) || [])[1] || h;
  const links = [...corpo.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
  console.log('     links no corpo: ' + (links.join(', ') || '(nenhum)'));
  ok('linkou a evidência de teste', links.includes('/evidencia-de-teste'), links.join(','));
  ok('e a ata de reunião', links.includes('/ata-de-reuniao'), links.join(','));
  /* UMA VEZ POR DESTINO. Cinco links para a mesma página num artigo não valem
     mais que um, e valem menos — é padrão de manipulação. */
  ok('uma vez por destino, e não a cada ocorrência',
     links.filter((x) => x === '/evidencia-de-teste').length === 1,
     String(links.filter((x) => x === '/evidencia-de-teste').length));
  /* O termo dentro de `<code>` fica como está: ali ele é código. */
  ok('e não liga dentro de código', !/<code>[^<]*<a /.test(corpo));
  ok('o texto continua o do autor', corpo.includes('evidência de teste'), 'perdeu o acento?');

  const en = await texto(`/en/blog/${POST.versoes.en.slug}`);
  ok('em inglês, o link é o endereço inglês', en.includes('href="/en/test-evidence"'),
     ([...en.matchAll(/href="(\/en\/[a-z-]+)"/g)].map((m) => m[1]).join(',') || '(nenhum)'));
}

// ------------------------------------------------- 6. RSS
console.log('\n[6] o feed');
{
  const r = await fetch(BASE + '/blog/rss.xml');
  const x = await r.text();
  ok('o feed responde XML', /application\/xml/.test(r.headers.get('content-type') || ''),
     r.headers.get('content-type'));
  ok('com o post dentro', x.includes(POST.versoes.pt.titulo), x.slice(0, 160));
  ok('e o endereço dele', x.includes(URL_POST));
  ok('com data em RFC 822', /<pubDate>\w{3}, \d\d \w{3} \d{4}/.test(x),
     (x.match(/<pubDate>[^<]*/) || [])[0]);
  ok('e o autor', x.includes(POST.autor));
  ok('o feed diz onde ele mesmo mora', x.includes('rel="self"'));
  const h = await texto('/blog');
  ok('e o índice o anuncia no <head>', /application\/rss\+xml/.test(h),
     'sem <link rel=alternate type=application/rss+xml>');
}

// ------------------------------------------------- 7. Open Graph e hreflang
console.log('\n[7] Open Graph e hreflang do post');
{
  const h = await texto(`/blog/${POST.versoes.pt.slug}`);
  const meta = (p) => (h.match(new RegExp(`<meta property="${p}" content="([^"]*)"`)) || [])[1];
  ok('article:modified_time', !!meta('article:modified_time'), String(meta('article:modified_time')));
  ok('e é diferente do published',
     meta('article:modified_time') !== meta('article:published_time'),
     `${meta('article:published_time')} / ${meta('article:modified_time')}`);
  ok('article:author', !!meta('article:author'), String(meta('article:author')));
  /* O React escreve o atributo como `hrefLang`; nome de atributo em HTML
     não distingue caixa, e o buscador lê os dois igual. */
  ok('x-default no hreflang', /hreflang="x-default"/i.test(h),
     (h.match(/hreflang="[^"]*"/g) || []).join(' '));
  /* Ele aponta para o INGLÊS, que é a versão que este post tem. */
  ok('e o x-default vai para a versão inglesa',
     new RegExp(`href="[^"]*${POST.versoes.en.slug}"[^>]*hreflang="x-default"|hreflang="x-default"[^>]*href="[^"]*${POST.versoes.en.slug}"`, "i").test(h),
     (h.match(/<link[^>]*x-default[^>]*>/) || [])[0]);
}

// ------------------------------------------------- 8 e 9. etiqueta e autor
console.log('\n[8] a etiqueta virou página');
{
  const r = await fetch(BASE + '/blog/tag/evidencia');
  const h = await r.text();
  ok('a página existe', r.status === 200, String(r.status));
  ok('e lista o post', h.includes(POST.versoes.pt.titulo));
  /* A chave é normalizada: "Evidência" e "evidencia" são a mesma etiqueta, e
     duas páginas para a mesma coisa competiriam entre si. */
  ok('acento não cria uma segunda página',
     (await (await fetch(BASE + '/blog/tag/' + encodeURIComponent('Evidência'))).text())
       .includes(POST.versoes.pt.titulo));
  const vazia = await fetch(BASE + '/blog/tag/nao-existe');
  ok('etiqueta sem posts sai do índice',
     /noindex/.test(await vazia.text()), 'faltou robots noindex');
  ok('e o post aponta para ela', (await texto(`/blog/${POST.versoes.pt.slug}`))
     .includes('/blog/tag/evidencia'));
}

console.log('\n[9] o autor virou página');
{
  const r = await fetch(BASE + '/blog/autor/leandro-oliveira');
  const h = await r.text();
  ok('a página existe', r.status === 200, String(r.status));
  ok('e lista o que a pessoa escreveu', h.includes(POST.versoes.pt.titulo));
  const b = [...h.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => { try { return JSON.parse(m[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>')); } catch { return null; } })
    .filter(Boolean);
  ok('com ProfilePage', b.some((x) => x['@type'] === 'ProfilePage'),
     b.map((x) => x['@type']).join(','));
  ok('e o post aponta para ela',
     (await texto(`/blog/${POST.versoes.pt.slug}`)).includes('/blog/autor/leandro-oliveira'));
}

console.log(falhas ? `\n  ${falhas} falha(s)` : '\n  tudo certo');
process.exit(falhas ? 1 : 0);
