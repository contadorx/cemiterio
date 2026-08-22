import { chromium } from './_navegador.mjs';   // abre os painéis e a gaveta das saídas
import http from 'http'; import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT = `${RAIZ_WS}/public`;
const html = fs.readFileSync(ROOT + '/app.html', 'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`, 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) { r.writeHead(200, {'Content-Type':'text/javascript'}); return r.end('') }
   r.writeHead(200, {'Content-Type':'text/html'}); r.end(html); });
await new Promise(r => srv.listen(8882, r));
const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

for (const [lang, esperado] of [['pt','ClipContext'], ['en','ClipContext'], ['es','ClipContext']]) {
  const ctx = await br.newContext({ acceptDownloads: true });
  const pg = await ctx.newPage();
  const erros = []; pg.on('pageerror', e => erros.push(e.message));
  await pg.route('**/jspdf**', r => r.fulfill({status:200,headers:{'content-type':'text/javascript','access-control-allow-origin':'*'},body:jspdf}));
  await pg.goto(`http://localhost:8882/app.html?lang=${lang}`);
  // o cenário de uso passou a ser obrigatório: sem ele o Gravar e o envio de vídeo cobram a escolha
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  await pg.waitForTimeout(400);
  await pg.setInputFiles('#file', '/tmp/amostra.webm');
  await pg.waitForTimeout(2200);
  await pg.selectOption('#mode', 'count'); await pg.fill('#count', '3');
  await pg.locator('#extract').click();
  await pg.waitForSelector('#prevCard:not(.hide)', { timeout: 60000 });
  await pg.waitForTimeout(400);

  const dp = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#go').click();
  await (await dp).saveAs(`/tmp/idioma-${lang}.pdf`);

  const dw = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#docx').click();
  await (await dw).saveAs(`/tmp/idioma-${lang}.docx`);

  ok(`${lang}: gerou PDF e docx`, fs.statSync(`/tmp/idioma-${lang}.pdf`).size > 10000 && fs.statSync(`/tmp/idioma-${lang}.docx`).size > 10000);
  ok(`${lang}: sem erro de JS`, erros.length === 0, erros.join(' | ').slice(0,150));
  await ctx.close();
}
await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nGeração nos três idiomas: ok.');
process.exit(falhas ? 1 : 0);
