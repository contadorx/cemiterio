/* A ferramenta nos cinco idiomas.
 *
 * O site em alemão que abre uma ferramenta em português é uma promessa
 * quebrada no clique seguinte ao da promessa. Este arquivo cobra a ponte:
 * a sigla no cabeçalho, o `?lang=` que vem do site, e — a parte que quebra
 * sozinha — nenhuma tela em branco por chave que faltou.
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT = `${RAIZ_WS}/public`;
const html = fs.readFileSync(ROOT + '/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (u.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end('') }
  if (u === '/sw.js') { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end(fs.readFileSync(ROOT+'/sw.js')) }
  r.writeHead(200, {'Content-Type':'text/html'}); r.end(html);
});
await new Promise(r => srv.listen(8916, r));

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };
const br = await chromium.launch({ executablePath: CHROME_WS });
const pg = await (await br.newContext({ viewport: { width: 1300, height: 950 } })).newPage();
const erros = []; pg.on('pageerror', e => erros.push(e.message));

const PROVA = {
  pt: /Transforme um vídeo/i, en: /Turn a video|Turn your/i, es: /Convierte un vídeo|Convierte tu/i,
  de: /Verwandeln|Video/i,    fr: /Transformez|vidéo/i,
};

for (const L of ['pt','en','es','de','fr']) {
  console.log(`[${L}]`);
  await pg.goto('http://localhost:8916/app.html?lang=' + L);
  await pg.waitForTimeout(700);

  ok('a página declara o idioma', await pg.evaluate(() => document.documentElement.lang) === L);
  const sub = (await pg.locator('.sub').first().textContent() || '').trim();
  ok('e o texto de abertura está nele', PROVA[L].test(sub), sub.slice(0, 70));

  /* O sintoma que só aparece depois: uma chave que faltou vira texto vazio, e
     a tela fica com um botão sem rótulo que ninguém sabe o que faz. */
  const vazios = await pg.evaluate(() => [...document.querySelectorAll('[data-i18n]')]
    .filter(e => !e.textContent.trim())
    .map(e => e.getAttribute('data-i18n')));
  ok('nenhum rótulo ficou em branco', vazios.length === 0, vazios.slice(0, 10).join(' '));

  /* E o contrário: texto que sobrou em português numa tela alemã. */
  if (L !== 'pt') {
    const corpo = await pg.locator('body').innerText();
    const suspeitas = ['Gravar a tela', 'Escolha um vídeo', 'Gerar PDF', 'Baixar', 'Passo a passo']
      .filter(w => corpo.includes(w));
    ok('e nada ficou em português', suspeitas.length === 0, suspeitas.join(' | '));
  }

  const siglas = await pg.locator('#idiomas a, #idiomas button').evaluateAll(
    (as) => as.map(a => a.textContent.trim()).filter(t => /^(PT|EN|ES|DE|FR)$/.test(t)));
  ok('as cinco siglas estão no cabeçalho', siglas.length === 5, siglas.join(' '));

  ok('a aba de ajuda aponta para o site no idioma certo',
     ((await pg.locator('#abaKb').getAttribute('href')) || '')
       .includes({pt:'/ajuda',en:'/en/help',es:'/es/ayuda',de:'/de/hilfe',fr:'/fr/aide'}[L]),
     await pg.locator('#abaKb').getAttribute('href'));
}

ok('sem erro de JS em nenhum idioma', erros.length === 0, erros.join(' | ').slice(0, 160));
await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nFerramenta nos cinco idiomas: tudo passou.');
process.exit(falhas ? 1 : 0);
