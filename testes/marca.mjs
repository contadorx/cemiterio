/* A marca, e as quatro cópias dela.
 *
 * O símbolo existe em quatro lugares que não conversam: `public/logo.svg` (o
 * site), o SVG escrito à mão no cabeçalho da ferramenta, o `marcaSvg()` que vai
 * dentro do HTML gerado, e o `marca()` que desenha no PDF com jsPDF. Não dá
 * para ter um só: o PDF não sabe ler SVG, e a ferramenta abre de `file://` no
 * pacote offline, onde um arquivo externo não existiria.
 *
 * O que dá para ter é uma regra: as quatro contam a MESMA história. Uma delas
 * ficou para trás quando o selo do relógio entrou — a home tinha um símbolo e a
 * ferramenta tinha outro, e ninguém percebeu por semanas.
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT = `${RAIZ_WS}/public`;
const app = fs.readFileSync(ROOT + '/app.html', 'utf8');
const logo = fs.readFileSync(ROOT + '/logo.svg', 'utf8');
let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

/** As formas de um SVG, sem espaço em branco nem ordem de atributo atrapalhando. */
const formas = (svg) => (svg.match(/<(rect|circle|path)[^>]*>/g) || [])
  .map((t) => (t.match(/(x|y|cx|cy|r|width|height|d)="[^"]*"/g) || []).sort().join(' '))
  .filter((x) => x).sort();

console.log('[1] o símbolo é o mesmo no site, na ferramenta e no documento');
{
  const doLogo = formas(logo);
  const noApp = formas((app.match(/<svg viewBox="0 0 64 64" role="img"[\s\S]*?<\/svg>/) || [''])[0]);
  const noDoc = formas((app.match(/const marcaSvg = px => `[\s\S]*?<\/svg>`/) || [''])[0]);
  ok('o logo do site tem formas', doLogo.length >= 6, String(doLogo.length));
  ok('o cabeçalho da ferramenta desenha o mesmo símbolo',
     noApp.join('|') === doLogo.join('|'),
     `site ${doLogo.length} formas · app ${noApp.length}`);
  ok('e o documento gerado também',
     noDoc.join('|') === doLogo.join('|'),
     `site ${doLogo.length} formas · doc ${noDoc.length}`);
  /* O selo do relógio é o "stamp" do nome — é ele que o desenho antigo não
     tinha, e é por ele que se sabe se uma cópia ficou para trás. */
  ok('e o selo do relógio está nas três',
     /circle/.test(logo) && noApp.some((f) => /cx=/.test(f)) && noDoc.some((f) => /cx=/.test(f)));
  ok('o PDF desenha o disco do relógio também',
     /doc\.circle\(|O selo do relógio/.test(app));
}

console.log('\n[2] o nome ao lado do símbolo, do mesmo tamanho nos dois');
{
  const srv = http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    if (u.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end('') }
    if (u === '/sw.js') { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end(fs.readFileSync(ROOT+'/sw.js')) }
    r.writeHead(200, {'Content-Type':'text/html'}); r.end(app);
  });
  await new Promise((r) => srv.listen(8921, r));
  const br = await chromium.launch({ executablePath: CHROME_WS });
  const pg = await (await br.newContext({ viewport: { width: 1200, height: 500 } })).newPage();

  const medir = async (url, sel) => {
    await pg.goto(url, { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(500);
    return pg.evaluate((s) => {
      const b = document.querySelector('.brand'); if (!b) return null;
      const c = getComputedStyle(b), sym = b.querySelector(s);
      return { fs: c.fontSize, fw: c.fontWeight, sp: c.letterSpacing, gap: c.gap,
               svg: sym ? getComputedStyle(sym).width : null, txt: b.textContent.trim() };
    }, sel);
  };

  const naFerramenta = await medir('http://localhost:8921/app.html?lang=pt', 'svg');
  ok('a ferramenta escreve o nome ao lado do símbolo',
     naFerramenta && naFerramenta.txt === 'Walkstamp', JSON.stringify(naFerramenta));

  const noSite = await medir('http://localhost:8802/', 'img').catch(() => null);
  if (!noSite) {
    console.log('     (o Next não está de pé — a comparação com o site fica de fora)');
  } else {
    /* Duas telas do mesmo produto com a mesma marca em dois tamanhos é a
       diferença que ninguém sabe nomear e todo mundo sente. */
    for (const k of ['fs', 'fw', 'sp', 'svg', 'gap'])
      ok(`  ${k} igual nos dois`, naFerramenta[k] === noSite[k],
         `app ${naFerramenta[k]} · site ${noSite[k]}`);

    /* E a FAIXA, não só a marca dentro dela. O cabeçalho da ferramenta era uma
       fileira solta no miolo: sem fundo, sem borda, 37px contra os 62 do site.
       O pulo entre as duas telas acontece o tempo todo — o site é onde se lê e
       a ferramenta é onde se faz. */
    const faixa = async (pg2, sel) => {
      await pg2.waitForTimeout(150);
      return pg2.evaluate((x) => {
        const h = document.querySelector(x); if (!h) return null;
        const c = getComputedStyle(h);
        return { alt: Math.round(h.getBoundingClientRect().height), bg: c.backgroundColor,
                 borda: c.borderBottomWidth, pos: c.position };
      }, sel);
    };
    await pg.goto('http://localhost:8921/app.html?lang=pt', { waitUntil: 'domcontentloaded' });
    const fApp = await faixa(pg, 'header.topo');
    await pg.goto('http://localhost:8802/', { waitUntil: 'domcontentloaded' });
    const fSite = await faixa(pg, 'header');
    ok('a ferramenta tem uma faixa de cabeçalho', !!fApp, JSON.stringify(fApp));
    for (const k of ['alt', 'bg', 'borda', 'pos'])
      ok(`  ${k} igual nos dois`, fApp && fSite && String(fApp[k]) === String(fSite[k]),
         `app ${fApp && fApp[k]} · site ${fSite && fSite[k]}`);
  }
  await br.close(); srv.close();
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nA marca: tudo passou.');
process.exit(falhas ? 1 : 0);
