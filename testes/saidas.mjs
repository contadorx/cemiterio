import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT = `${RAIZ_WS}/public`;
const html = fs.readFileSync(ROOT + '/app.html', 'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`, 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) { r.writeHead(200, {'Content-Type':'text/javascript'}); return r.end('') }
   r.writeHead(200, {'Content-Type':'text/html'}); r.end(html); });
await new Promise(r => srv.listen(8888, r));

const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, extra) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (extra ? '  → ' + extra : '')); if (!c) falhas++; };

const ctx = await br.newContext({ acceptDownloads: true });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));
await pg.route('**/jspdf**', r => r.fulfill({status:200,headers:{'content-type':'text/javascript','access-control-allow-origin':'*'},body:jspdf}));
await pg.goto('http://localhost:8888/app.html?lang=pt');
// o cenário de uso passou a ser obrigatório: sem ele o botão Gravar cobra a escolha
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.waitForTimeout(400);

// vídeo real + transcrição colada, para exercitar o pareamento imagem/fala
await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForTimeout(2500);
await pg.fill('#tr', `WEBVTT

00:00:00.000 --> 00:00:02.500
Microfone: bom dia a todos, vamos comecar

00:00:02.600 --> 00:00:05.000
Computador: o relatorio do trimestre esta na tela

00:00:05.100 --> 00:00:07.900
Microfone: pode passar para o proximo slide`);
await pg.dispatchEvent('#tr', 'input');
await pg.selectOption('#mode', 'count');
await pg.fill('#count', '4');
await pg.locator('#extract').click();
await pg.waitForSelector('#prevCard:not(.hide)', { timeout: 40000 });
/* A ESPERA É PELA CONDIÇÃO, e não por um relógio.
   `#prevCard` sai do `hide` no PRIMEIRO quadro — a grade enche durante a
   varredura, de propósito. Esperar 600 ms depois disso era uma aposta sobre
   quanto os outros três demoram, e ela perdia uma vez em três com a máquina
   ocupada por outro teste ao lado. O que se afirma continua igual: quatro
   quadros, nem mais nem menos — a espera só deixou de ser um palpite. */
await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length >= 4,
                         null, { timeout: 40000 }).catch(() => {});
await pg.waitForTimeout(400);
const n = await pg.locator('#thumbs figure').count();
ok('frames extraídos', n === 4, n + ' miniaturas');

console.log('\n[A] zip só com as figuras');
{
  const dl = pg.waitForEvent('download', { timeout: 30000 });
  await pg.locator('#zip').click();
  const d = await dl;
  await d.saveAs('/tmp/frames.zip');
  ok('nome do arquivo', /^frames-.*\.zip$/.test(d.suggestedFilename()), d.suggestedFilename());
  ok('mensagem de conclusão', /imagens no zip/.test(await pg.locator('#pdfStatus').textContent()));
}

console.log('\n[B] documento do Word');
{
  const dl = pg.waitForEvent('download', { timeout: 30000 });
  await pg.locator('#docx').click();
  const d = await dl;
  await d.saveAs('/tmp/analise.docx');
  ok('nome do arquivo', /^analise-.*\.docx$/.test(d.suggestedFilename()), d.suggestedFilename());
  ok('mensagem de conclusão', /Word com 4 quadros/.test(await pg.locator('#pdfStatus').textContent()));
}

console.log('\n[C] o PDF continua funcionando');
{
  const dl = pg.waitForEvent('download', { timeout: 40000 });
  await pg.locator('#go').click();
  const d = await dl;
  await d.saveAs('/tmp/analise-regressao.pdf');
  ok('PDF ainda sai', fs.readFileSync('/tmp/analise-regressao.pdf').subarray(0,5).toString() === '%PDF-');
}

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 200));
await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nNavegador: todas as verificacoes passaram.');
process.exit(falhas ? 1 : 0);
