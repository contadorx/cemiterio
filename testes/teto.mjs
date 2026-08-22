/* O LIMITE DE QUADROS — o que aconteceu numa reunião de verdade.
 *
 * O relato: "fui gravar uma reunião e parou em 60 frames no default". Ele estava
 * certo, e o defeito tinha três camadas:
 *
 *   1. o padrão era 60 — número de vídeo curto de demonstração. Uma reunião de
 *      uma hora passa disso na primeira meia hora;
 *   2. o limite era lido UMA VEZ, no começo. Aumentar o campo com a gravação
 *      rolando não fazia efeito nenhum — e parar para recomeçar é perder a
 *      reunião;
 *   3. e ao bater no teto ele parava de guardar EM SILÊNCIO. Só um contador no
 *      diagnóstico. A pessoa seguia a reunião inteira achando que gravava.
 *
 * A terceira é a que destrói trabalho, e é a que este teste mais persegue.
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT = `${RAIZ_WS}/public`;
const html = fs.readFileSync(ROOT + '/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) { r.writeHead(200, {'Content-Type':'text/javascript'}); return r.end('') }
  r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(html);
});
await new Promise(r => srv.listen(8931, r));

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const br = await chromium.launch({
  executablePath: CHROME_WS,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
         '--auto-accept-this-tab-capture', '--allow-http-screen-capture'],
});
const ctx = await br.newContext({ viewport: { width: 1280, height: 1000 },
                                  permissions: ['microphone'] });
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', e => erros.push(e.message));
await pg.goto('http://localhost:8931/app.html?lang=pt');
await pg.waitForTimeout(400);

console.log('[1] o padrão do campo deixou de ser 60');
{
  const v = await pg.locator('#maxf').inputValue();
  const max = await pg.locator('#maxf').getAttribute('max');
  ok('o padrão subiu', Number(v) >= 300, v);
  ok('e o teto do campo acompanhou', Number(max) >= 2000, max);
}

console.log('\n[2] gravando: o limite é lido a cada quadro, e bater nele FALA');
{
  /* Uma tela falsa que muda o tempo todo: e o que faz a captura guardar quadro
     atras de quadro sem ninguem mexer em nada. */
  await pg.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 640; c.height = 360;
    const cx = c.getContext('2d');
    let n = 0;
    setInterval(() => {
      n++;
      cx.fillStyle = `hsl(${(n * 37) % 360} 70% ${30 + (n % 40)}%)`;
      cx.fillRect(0, 0, 640, 360);
      cx.fillStyle = '#fff'; cx.font = '90px sans-serif';
      cx.fillText(String(n), 40, 200);
    }, 120);
    const stream = c.captureStream(30);
    navigator.mediaDevices.getDisplayMedia = async () => stream;
  });
  /* Um teto baixinho para o teste caber em segundos — o que se prova e o
     COMPORTAMENTO no teto, e ele nao depende do numero. */
  /* `tudo`: este teste precisa encher rapido para chegar no teto em segundos.
     O padrao novo ("equilibrado") espera a tela parar e tem piso de 1,5 s entre
     quadros — otimo para o produto, lento demais para provar o teto aqui. */
  await pg.selectOption('#ritmo', 'tudo');
  await pg.locator('#maxf').fill('6');
  await pg.selectOption('#modelo', 'ata').catch(() => {});
  await pg.locator('#recTr').uncheck();
  await pg.evaluate(() => window.__contagem(1));
  await pg.locator('#rec').click();
  await pg.waitForSelector('#recStop:visible', { timeout: 40000 });

  await pg.waitForFunction(() => /limite de \d+ quadros/i.test(
    document.getElementById('recMsg').textContent || ''), null, { timeout: 30000 })
    .catch(() => {});
  const msg = await pg.locator('#recMsg').innerText();
  ok('a tela DIZ que chegou no limite', /limite de \d+ quadros/i.test(msg), msg.slice(0, 140));
  ok('e deixa claro que a gravação continua', /continuam|continua/i.test(msg), msg.slice(0, 140));
  ok('e traz o conserto junto, em vez de mandar procurar',
     await pg.locator('#recMaisFrames').count() === 1);

  /* A prova de que o aviso NAO tem prazo: ele some depois de oito segundos se
     for do tipo com prazo, e quem grava reuniao esta olhando para a reuniao. */
  await pg.waitForTimeout(9000);
  ok('o aviso continua na tela dez segundos depois',
     /limite de \d+ quadros/i.test(await pg.locator('#recMsg').innerText()));

  const antes = await pg.evaluate(() => window.__frames ? window.__frames.length : null);
  /* AGORA o que mais importa: aumentar o limite COM A GRAVACAO RODANDO volta a
     guardar. Antes o numero congelava no comeco e nao havia saida nenhuma. */

  /* DIGITANDO, como uma pessoa faria — e nao com `evaluate`. Provar com
     `evaluate` provaria que o codigo le o campo, e nao que da para mexer nele
     no meio de uma gravacao, que e a pergunta que importa aqui. */
  /* O BOTAO, e nao o campo. O campo do limite fica abaixo da dobra durante a
     gravacao — medido: y=1167 numa janela de 1000. Quem esta numa reuniao nao
     vai rolar a pagina para achar um campo; o conserto tem que estar onde o
     recado esta. */
  await pg.locator('#recMaisFrames').click();
  await pg.waitForTimeout(3500);
  ok('o botão do aviso dobra o limite na hora',
     (await pg.locator('#maxf').inputValue()) === '12',
     await pg.locator('#maxf').inputValue());
  const msg2 = await pg.locator('#recMsg').innerText();
  ok('o recado do teto sai da tela quando o limite sobe',
     !/limite de \d+ quadros/i.test(msg2), msg2.slice(0, 120));
  ok('e ela avisa que voltou a guardar', /voltei a guardar|aumentado/i.test(msg2), msg2.slice(0, 120));

  await pg.locator('#recStop').click();
  await pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null,
                           null, { timeout: 60000 });
  await pg.waitForTimeout(1200);
  const n = await pg.locator('#thumbs figure').count();
  ok('e o documento saiu com mais quadros que o teto antigo', n > 6, String(n));
}

ok('sem erro de JavaScript', erros.length === 0, erros.join(' | '));
await br.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
