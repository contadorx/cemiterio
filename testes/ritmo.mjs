/* O RITMO DOS QUADROS — a inteligência que faltava para reunião.
 *
 * O relato: "ele troca na média 1 frame a cada 2 segundos". Numa chamada de
 * vídeo a tela "muda" o tempo todo — os quadradinhos das câmeras, o cursor,
 * alguém rolando — e o detector, que só olhava a diferença da tela inteira,
 * disparava a cada amostra. O documento saía sendo a mesma reunião fotografada
 * trezentas vezes.
 *
 * São três mecanismos, e este teste separa um do outro porque juntos eles
 * seriam indistinguíveis de "aumentei o limiar":
 *
 *   1. MÁSCARA: a célula que se mexe em quase toda amostra é vídeo, e deixa de
 *      opinar. O que sobra — o slide, o documento — volta a decidir sozinho;
 *   2. ASSENTAR: a mudança abre uma janela e o quadro só é guardado quando a
 *      tela para. Guarda-se o estado final, e não o meio da transição;
 *   3. PISO de tempo entre quadros.
 *
 * E a válvula: tela que nunca para não pode terminar com zero quadros.
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
await new Promise(r => srv.listen(8933, r));

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const br = await chromium.launch({
  executablePath: CHROME_WS,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
         '--auto-accept-this-tab-capture'],
});

/* Uma "reunião": o slide ocupa a maior parte da tela e fica PARADO; num canto,
   quatro quadradinhos de câmera que mudam a cada tique — que é exatamente o que
   uma chamada de vídeo faz. */
async function gravar(pg, ritmo, roteiro, segundos) {
  await pg.goto('http://localhost:8933/app.html?lang=pt');
  await pg.waitForTimeout(400);
  await pg.selectOption('#modelo', 'outro');
  await pg.selectOption('#ritmo', ritmo);
  await pg.locator('#recTr').uncheck();
  await pg.evaluate(() => window.__contagem(1));
  await pg.evaluate((r) => {
    const c = document.createElement('canvas');
    c.width = 960; c.height = 540;
    const cx = c.getContext('2d');
    let n = 0;
    window.__slide = 0;
    setInterval(() => {
      n++;
      // o slide: grande, parado, e só troca quando alguém manda
      cx.fillStyle = ['#f4f4f8', '#e8f0ff', '#fff4e8', '#eaffea'][window.__slide % 4];
      cx.fillRect(0, 0, 960, 400);
      cx.fillStyle = '#15171C'; cx.font = 'bold 120px sans-serif';
      cx.fillText('SLIDE ' + window.__slide, 60, 260);
      // as câmeras: pequenas, embaixo, mudando SEMPRE
      if (r !== 'semCamera') {
        for (let i = 0; i < 4; i++) {
          cx.fillStyle = `hsl(${(n * 53 + i * 90) % 360} 65% 55%)`;
          cx.fillRect(20 + i * 240, 420, 220, 110);
        }
      }
    }, 100);
    navigator.mediaDevices.getDisplayMedia = async () => c.captureStream(30);
  }, roteiro);
  await pg.locator('#rec').click();
  await pg.waitForSelector('#recStop:visible', { timeout: 40000 });
  const passo = Math.floor(segundos * 1000 / 4);
  for (let i = 1; i <= 3; i++) {
    await pg.waitForTimeout(passo);
    await pg.evaluate(() => { window.__slide++; });   // três trocas de slide
  }
  await pg.waitForTimeout(passo);
  const n = await pg.evaluate(() => window.__qtdFrames || 0);
  await pg.locator('#recStop').click();
  await pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null,
                           null, { timeout: 60000 });
  await pg.waitForTimeout(1500);
  return await pg.locator('#thumbs figure').count();
}

console.log('[1] a reunião: câmeras mexendo o tempo todo, slide trocando 3 vezes');
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 950 } });
  const pg = await ctx.newPage();
  const erros = []; pg.on('pageerror', e => erros.push(e.message));

  const tudo = await gravar(pg, 'tudo', 'comCamera', 24);
  const reuniao = await gravar(pg, 'reuniao', 'comCamera', 24);

  console.log(`      "cada mudança": ${tudo} quadros · "reunião": ${reuniao} quadros`);
  /* O número exato depende da máquina; a RELAÇÃO é o que se afirma. Com as
     câmeras mexendo, o modo antigo guarda dezenas; o de reunião tem que ficar
     na ordem das trocas de slide. */
  ok('o modo antigo enche de quadros', tudo >= 8, String(tudo));
  ok('o de reunião guarda muito menos', reuniao < tudo / 2, `${reuniao} contra ${tudo}`);
  ok('e ainda assim guarda alguma coisa — não zerou', reuniao >= 1, String(reuniao));
  ok('sem erro de JavaScript', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

console.log('\n[2] sem câmera nenhuma, o de reunião continua vendo as trocas');
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 950 } });
  const pg = await ctx.newPage();
  const n = await gravar(pg, 'reuniao', 'semCamera', 60);
  /* A máscara não pode virar cegueira: numa tela parada que troca de verdade,
     as trocas continuam sendo quadro. Três trocas de slide, mais a captura de
     abertura e a de fechamento. */
  ok('as trocas de slide viraram quadros', n >= 3, String(n));
  await ctx.close();
}

console.log('\n[3] tela que NUNCA para não termina com zero quadros');
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 950 } });
  const pg = await ctx.newPage();
  await pg.goto('http://localhost:8933/app.html?lang=pt');
  await pg.waitForTimeout(400);
  await pg.selectOption('#modelo', 'outro');
  await pg.selectOption('#ritmo', 'reuniao');
  await pg.locator('#recTr').uncheck();
  await pg.evaluate(() => window.__contagem(1));
  /* Tela INTEIRA em movimento: um vídeo em tela cheia. Sem a válvula, ela
     nunca assentaria e o documento sairia vazio. */
  await pg.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 960; c.height = 540;
    const cx = c.getContext('2d');
    let n = 0;
    setInterval(() => {
      n++;
      cx.fillStyle = `hsl(${(n * 17) % 360} 70% 50%)`;
      cx.fillRect(0, 0, 960, 540);
      cx.fillStyle = '#fff'; cx.font = '140px sans-serif';
      cx.fillText(String(n), 60, 300);
    }, 90);
    navigator.mediaDevices.getDisplayMedia = async () => c.captureStream(30);
  });
  await pg.locator('#rec').click();
  await pg.waitForSelector('#recStop:visible', { timeout: 40000 });
  await pg.waitForTimeout(60000);
  await pg.locator('#recStop').click();
  await pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null,
                           null, { timeout: 60000 });
  await pg.waitForTimeout(1500);
  const n = await pg.locator('#thumbs figure').count();
  ok('a válvula guardou quadros mesmo sem a tela nunca parar', n >= 2, String(n));
  /* E sem virar o flipbook de novo: em sessenta segundos, com espera de 45 s,
     não pode sair um quadro por segundo. */
  ok('e sem encher — a válvula é lenta de propósito', n <= 8, String(n));
  await ctx.close();
}

console.log('\n[4] o cenário escolhe o ritmo, e quem discorda manda');
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 950 } });
  const pg = await ctx.newPage();
  await pg.goto('http://localhost:8933/app.html?lang=pt');
  await pg.waitForTimeout(400);
  await pg.selectOption('#modelo', 'ata');
  ok('ata de reunião escolhe o ritmo de reunião',
     (await pg.locator('#ritmo').inputValue()) === 'reuniao',
     await pg.locator('#ritmo').inputValue());
  await pg.selectOption('#modelo', 'evidencia');
  ok('evidência de teste volta ao equilibrado',
     (await pg.locator('#ritmo').inputValue()) === 'equilibrado');
  /* Sobrescrever a escolha da pessoa na próxima troca de cenário é o jeito mais
     rápido de um controle parecer quebrado. */
  await pg.selectOption('#ritmo', 'tudo');
  await pg.selectOption('#modelo', 'ata');
  ok('mas depois de escolher à mão, o cenário para de mandar',
     (await pg.locator('#ritmo').inputValue()) === 'tudo',
     await pg.locator('#ritmo').inputValue());
  await ctx.close();
}

await br.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
