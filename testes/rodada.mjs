import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT = `${RAIZ_WS}/public`;
const html = fs.readFileSync(ROOT + '/app.html', 'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`, 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end('') }
  r.writeHead(200, {'Content-Type':'text/html'}); r.end(html);
});
await new Promise(r => srv.listen(8916, r));

const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, extra) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (extra ? '  → ' + extra : '')); if (!c) falhas++; };

const ctx = await br.newContext({ acceptDownloads: true, viewport: { width: 1300, height: 950 } });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));
await pg.route('**/jspdf**', r => r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
await pg.goto('http://localhost:8916/app.html?lang=pt');
// o cenário virou obrigatório antes de o vídeo entrar ou de a gravação começar
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.waitForTimeout(400);
await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForTimeout(2500);
await pg.selectOption('#mode', 'count');
await pg.fill('#count', '5');
await pg.locator('#extract').click();
await pg.waitForSelector('#prevCard:not(.hide)', { timeout: 40000 });
await pg.waitForTimeout(600);

console.log('[1] o nome do quadro segue o contexto');
{
  const legenda = () => pg.locator('#thumbs figcaption .passo').first().textContent();
  await pg.selectOption('#modelo', 'evidencia');
  await pg.waitForTimeout(300);
  ok('evidência chama de Passo', /Passo 1/.test(await legenda()), await legenda());
  await pg.selectOption('#modelo', 'ata');
  await pg.waitForTimeout(300);
  ok('ata chama de Momento', /Momento 1/.test(await legenda()), await legenda());
  ok('e o campo mostra o padrão', (await pg.locator('#unNome').inputValue()) === 'Momento',
     await pg.locator('#unNome').inputValue());
  await pg.selectOption('#modelo', 'ia');
  await pg.waitForTimeout(300);
  ok('contexto para IA chama de Trecho', /Trecho 1/.test(await legenda()), await legenda());
}

console.log('\n[2] e dá para renomear');
{
  await pg.fill('#unNome', 'Evidência');
  await pg.waitForTimeout(350);
  ok('a miniatura acompanha',
     /Evidência 1/.test(await pg.locator('#thumbs figcaption .passo').first().textContent()));
  await pg.selectOption('#modelo', 'evidencia');
  await pg.waitForTimeout(350);
  ok('trocar de modelo NÃO apaga a escolha da pessoa',
     /Evidência 1/.test(await pg.locator('#thumbs figcaption .passo').first().textContent()),
     await pg.locator('#thumbs figcaption .passo').first().textContent());
  ok('a anotação continua embaixo', await pg.locator('#thumbs figure input.nota').first().isVisible());

  const dl = pg.waitForEvent('download', { timeout: 40000 });
  await pg.locator('#md').click();
  const d = await dl; await d.saveAs('/tmp/rodada.md');
  ok('o documento usa o nome escolhido', /## Evidência 1/.test(fs.readFileSync('/tmp/rodada.md','utf8')));

  await pg.fill('#unNome', '');
  await pg.waitForTimeout(300);
  ok('apagar devolve o padrão do modelo',
     /Passo 1/.test(await pg.locator('#thumbs figcaption .passo').first().textContent()));
}

console.log('\n[3] os filtros contam e marcam');
{
  const txtDedup = await pg.locator('#dedup').textContent();
  ok('repetidos traz a contagem', /\(\d+\)/.test(txtDedup) || /repetidos$/.test(txtDedup), txtDedup);
  await pg.fill('#tr', 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nfala so no comeco');
  await pg.dispatchEvent('#tr', 'input');
  await pg.waitForTimeout(400);
  ok('sem fala traz a contagem', /\(\d+\)/.test(await pg.locator('#mute').textContent()),
     await pg.locator('#mute').textContent());

  await pg.locator('#allOn').click();
  await pg.waitForTimeout(250);
  ok('manter todos fica marcado',
     (await pg.locator('#allOn').getAttribute('class')).includes('ativo'));
  await pg.locator('#dedup').click();
  await pg.waitForTimeout(300);
  ok('descartar repetidos passa a ser o marcado',
     (await pg.locator('#dedup').getAttribute('class')).includes('ativo') &&
     !(await pg.locator('#allOn').getAttribute('class')).includes('ativo'));
  await pg.locator('#mute').click();
  await pg.waitForTimeout(600);
  ok('sem fala assume a marcação',
     (await pg.locator('#mute').getAttribute('class')).includes('ativo'));
}

console.log('\n[4] o tamanho da lente');
{
  await pg.locator('#allOn').click();
  await pg.waitForTimeout(200);
  await pg.locator('#thumbs figure').first().locator('.editar').click();
  await pg.waitForSelector('#lente:not(.hide)');
  const larg = async () => (await pg.locator('.lenteCx').boundingBox()).width;
  const m = await larg();
  await pg.selectOption('#lenteTam', '720');
  await pg.waitForTimeout(300);
  const p = await larg();
  ok('S deixa a lente mais estreita que M', p < m, `${p.toFixed(0)} < ${m.toFixed(0)}`);
  await pg.selectOption('#lenteTam', '1280');
  await pg.waitForTimeout(300);
  ok('L deixa mais larga', (await larg()) > m);
  await pg.locator('#lenteFechar').click();
  await pg.waitForTimeout(200);
  await pg.reload();
  await pg.waitForTimeout(600);
  ok('a escolha é lembrada',
     (await pg.evaluate(() => document.getElementById('lenteTam').value)) === '1280');
}

console.log('\n[5] a captura pede a tela inteira por padrão');
{
  const fonte = fs.readFileSync(ROOT + '/app.html', 'utf8');
  ok("displaySurface 'monitor' na dica", /displaySurface: 'monitor'/.test(fonte));
  ok('telas de monitor incluídas', /monitorTypeSurfaces: 'include'/.test(fonte));
  ok('trocar de janela continua permitido', /surfaceSwitching: 'include'/.test(fonte));
}

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 200));
await br.close(); srv.close();
console.log(falhas ? '\n' + falhas + ' falha(s)' : '\nRodada intermediária: tudo passou.');
process.exit(falhas ? 1 : 0);
