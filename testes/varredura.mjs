/* A VARREDURA DE UM VÍDEO LONGO — o caminho que ninguém tinha medido.
 *
 * As medições de desempenho deste projeto olharam todas para a GRAVAÇÃO de
 * tela. O passo 2 é outro código: ele não captura nada, ele busca posições num
 * `<video>` (`seek`), tira a assinatura de 32×18 e bisseca os intervalos que
 * mudaram. O `seek` é assíncrono e devolve o fio ao navegador, o que dá uma boa
 * razão para achar que está tudo bem — e nenhuma para afirmar.
 *
 * Uma hora de vídeo é o caso real: reunião gravada, sessão de teste, aula.
 * Este arquivo roda uma hora de verdade (`/tmp/longo.webm`, 120 trocas de tela)
 * e imprime o que custou.
 *
 * O vídeo não viaja no zip — são 8 MB e um minuto de ffmpeg. Ele é gerado por
 *
 *     python3 testes/amostras.py --longo
 *
 * e este teste PULA, dizendo isso, quando ele não está lá: uma esteira vermelha
 * por um insumo ausente é uma esteira que se aprende a ignorar.
 *
 * Afirmações: só as que não dependem da máquina — que a varredura termina, que
 * ela acha as trocas de tela, e que o fio principal continua atendendo. O tempo
 * de parede sai impresso.
 */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const RAIZ = `${RAIZ_WS}`;
const VIDEO = '/tmp/longo.webm';
if (!fs.existsSync(VIDEO)) {
  console.log('  pulado  ' + VIDEO + ' não existe.');
  console.log('          Gere com:  python3 testes/amostras.py --longo   (~1 min, 8 MB)');
  process.exit(0);
}

const html = fs.readFileSync(RAIZ + '/public/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) {
    r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end('');
  }
  r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(html);
});
await new Promise(r => srv.listen(8939, r));

let falhas = 0;
const ok = (n, c, e) => {
  console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : ''));
  if (!c) falhas++;
};

const br = await chromium.launch({
  executablePath: CHROME_WS,
  args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
const ctx = await br.newContext({ viewport: { width: 1250, height: 980 } });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));
await pg.goto('http://localhost:8939/app.html?lang=pt');
await pg.selectOption('#modelo', 'evidencia').catch(() => {});
await pg.waitForTimeout(300);

await pg.setInputFiles('#file', VIDEO);
await pg.waitForFunction(() => !document.getElementById('extract').disabled,
                         null, { timeout: 60000 });
const dur = await pg.evaluate(() => document.getElementById('v').duration);
console.log('     vídeo de ' + (dur / 60).toFixed(1) + ' minutos');

/* O medidor: quantos quadros de tela o navegador conseguiu pintar enquanto a
   varredura corria, e quanto tempo ficou em tarefa longa. Uma varredura que
   trava a página é uma varredura em que a pessoa aperta "cancelar" — ou fecha
   a aba, que é o gesto que este projeto já pagou caro para evitar. */
await pg.evaluate(() => {
  window.__regua = { quadros: [], longas: [] };
  let t0 = performance.now();
  const tique = () => {
    const t = performance.now();
    window.__regua.quadros.push(t - t0); t0 = t;
    requestAnimationFrame(tique);
  };
  requestAnimationFrame(tique);
  try {
    new PerformanceObserver(l => {
      for (const e of l.getEntries()) window.__regua.longas.push(e.duration);
    }).observe({ entryTypes: ['longtask'] });
  } catch (e) {}
  if (window.gc) window.gc();
  window.__heap0 = performance.memory ? performance.memory.usedJSHeapSize : null;
});

await pg.selectOption('#mode', 'scene');
await pg.fill('#maxf', '2000');
await pg.evaluate(() => { window.__regua.quadros.length = 0; window.__regua.longas.length = 0; });

const t0 = Date.now();
await pg.locator('#extract').click();
await pg.waitForFunction(() => !document.getElementById('extract').disabled,
                         null, { timeout: 900000 });
const segundos = (Date.now() - t0) / 1000;
await pg.waitForTimeout(1200);

const r = await pg.evaluate(() => {
  const q = window.__regua.quadros.slice().sort((a, b) => a - b);
  const p = x => q.length ? q[Math.min(q.length - 1, Math.floor(q.length * x))] : 0;
  const quadros = window.__quadros();
  let bytes = 0;
  for (const f of quadros) if (f.img && f.img.blob) bytes += f.img.blob.size;
  return {
    fps: q.length ? 1000 / (q.reduce((s, x) => s + x, 0) / q.length) : 0,
    p50: p(0.5), p95: p(0.95),
    bloqueio: window.__regua.longas.reduce((s, d) => s + Math.max(0, d - 50), 0),
    pior: window.__regua.longas.reduce((m, d) => Math.max(m, d), 0),
    telas: quadros.length,
    bytes,
    heap0: window.__heap0,
    heap: performance.memory ? performance.memory.usedJSHeapSize : null
  };
});

const linha = (k, v) => console.log('   ' + k.padEnd(38) + v);
console.log('\n  varredura por cena de ' + (dur / 60).toFixed(0) + ' minutos de vídeo\n');
linha('tempo de parede', segundos.toFixed(1) + ' s  (' +
      (dur / segundos).toFixed(0) + '× o tempo real)');
linha('telas encontradas', r.telas);
linha('FPS da página durante a varredura',
      r.fps.toFixed(1) + '   p50 ' + r.p50.toFixed(1) + ' ms, p95 ' + r.p95.toFixed(1) + ' ms');
linha('bloqueio do fio principal',
      Math.round(r.bloqueio) + ' ms em ' + segundos.toFixed(0) + ' s (' +
      (r.bloqueio / (segundos * 1000) * 100).toFixed(1) + '%), pior ' + Math.round(r.pior) + ' ms');
linha('as telas em memória', (r.bytes / 1048576).toFixed(1) + ' MB  (' +
      (r.telas ? (r.bytes / r.telas / 1024).toFixed(1) : '0') + ' KB cada)');
if (r.heap != null) linha('heap JS antes / depois',
  (r.heap0 / 1048576).toFixed(1) + ' MB / ' + (r.heap / 1048576).toFixed(1) + ' MB');

console.log('\n  o que este arquivo AFIRMA:');
ok('a varredura de uma hora termina', r.telas > 0, String(r.telas));
/* O vídeo tem 120 trocas de tela, uma a cada 30 s. Achar metade delas já
   descarta "o detector não vê nada"; exigir as 120 exatas seria afirmar sobre a
   bisseção, que tem tolerância de meio segundo por desenho. */
ok('e encontra as trocas de tela que existem lá', r.telas >= 60,
   r.telas + ' de 120 trocas');
/* A página tem que continuar VIVA. Abaixo de 10 FPS a pessoa vê "página sem
   resposta" — e a resposta racional a isso é fechar a aba. */
ok('a página continua respondendo durante a varredura', r.fps >= 10,
   r.fps.toFixed(1) + ' FPS');
ok('nenhuma tarefa isolada passa de 2 s', r.pior < 2000, Math.round(r.pior) + ' ms');
ok('sem erro de JavaScript', erros.length === 0, erros.join(' | ').slice(0, 200));

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
