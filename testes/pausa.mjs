import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT = `${RAIZ_WS}/public`;
const html = fs.readFileSync(ROOT + '/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) { r.writeHead(200, {'Content-Type':'text/javascript'}); return r.end('') }
  
  if (q.url.startsWith('/favicon.ico')) { r.writeHead(200, {'Content-Type':'image/x-icon'}); return r.end(fs.readFileSync(ROOT+'/favicon.ico')); }
  // o service worker de verdade, com o tipo certo: servi-lo como HTML faria o
  // navegador recusar o registro, e o 404 vira erro no console — os dois
  // acontecem em produção se a hospedagem errar, então o teste usa o arquivo real
  if (q.url.split('?')[0] === '/sw.js') {
    r.writeHead(200, {'Content-Type':'text/javascript'});
    return r.end(fs.readFileSync(ROOT + '/sw.js'));
  }
  r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(html);
});
await new Promise(r => srv.listen(8907, r));

const br = await chromium.launch({
  executablePath: CHROME_WS,
  args: ['--autoplay-policy=no-user-gesture-required']
});
let falhas = 0;
const ok = (n, c, extra) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (extra ? '  → ' + extra : '')); if (!c) falhas++; };

const ctx = await br.newContext();
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));
pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) erros.push(m.text()); });

// --- modelo de transcrição falso, servido no endereço que o app importa ---
const FAKE = `
export const env = { allowLocalModels:true, allowRemoteModels:true, backends:{ onnx:{ wasm:{} } } };
export async function pipeline(){
  let n = 0;
  return async (dados) => {
    n++;
    const seg = dados.length / 16000;
    return { chunks: [{ timestamp: [0, Math.min(2, seg)], text: 'fala numero ' + n }] };
  };
}
`;
await pg.route('**/@huggingface/transformers**', route => route.fulfill({
  status: 200, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }, body: FAKE
}));
await pg.route('**/onnxruntime-web**', route => route.fulfill({
  status: 200, headers: { 'content-type': 'application/wasm', 'access-control-allow-origin': '*' }, body: 'x'
}));

// --- duas fontes de mídia sintéticas, para exercitar os dois canais ---
await pg.addInitScript(() => {
  function tela(){
    const c = document.createElement('canvas'); c.width = 480; c.height = 270;
    const x = c.getContext('2d');
    const cores = ['#e02020', '#1060e0', '#10a040', '#f0f0f0', '#101010', '#e0c020'];
    let n = 0;
    x.fillStyle = cores[0]; x.fillRect(0, 0, 480, 270);
    window.__pintar = setInterval(() => {
      n++;
      x.fillStyle = cores[Math.floor(n / 30) % cores.length];   // troca de cena a cada ~3 s
      x.fillRect(0, 0, 480, 270);
      x.fillStyle = '#888'; x.font = '30px sans-serif';
      x.fillText('tela ' + Math.floor(n / 30), 30, 140);
    }, 100);
    return c.captureStream(12);
  }
  function tom(hz){
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(); o.frequency.value = hz;
    const g = ac.createGain(); g.gain.value = 0.3;
    const d = ac.createMediaStreamDestination();
    o.connect(g); g.connect(d); o.start();
    return d.stream;
  }
  navigator.mediaDevices.getDisplayMedia = async () =>
    new MediaStream([...tela().getVideoTracks(), ...tom(220).getAudioTracks()]);
  navigator.mediaDevices.getUserMedia = async () => tom(440);
});

await pg.goto('http://localhost:8907/app.html?lang=pt');
// o cenário de uso passou a ser obrigatório: sem ele o Gravar e o envio de vídeo cobram a escolha
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.waitForTimeout(600);

console.log('\n[1] pausa e marcação só existem durante a gravação');
ok('pausar escondido antes de gravar', await pg.locator('#recPause').isHidden());
ok('marcar escondido antes de gravar', await pg.locator('#recMark').isHidden());

/* A contagem regressiva de 3 é opção do produto e vem ligada; num teste
     que mede a gravação ela só adiciona três segundos de espera por rodada. */
  await pg.evaluate(() => window.__contagem(1));
  await pg.locator('#rec').click();
await pg.waitForTimeout(3000);
ok('pausar apareceu ao gravar', await pg.locator('#recPause').isVisible());
ok('marcar apareceu ao gravar', await pg.locator('#recMark').isVisible());

console.log('\n[2] marcar guarda um quadro na hora');
const nFrames = async () => {
  const t = await pg.locator('#liveStat').textContent();
  const m = t.match(/(\d+)\s*(frames|quadros)/i);
  return m ? +m[1] : 0;
};
const antes = await nFrames();
await pg.locator('#recMark').click();
await pg.waitForTimeout(500);
const depois = await nFrames();
ok('marcar somou um quadro', depois === antes + 1, `${antes} → ${depois}`);
ok('a mensagem confirma', /marcado/.test(await pg.locator('#recMsg').textContent()));

console.log('\n[3] pausa: o relógio anda, os quadros não');
await pg.locator('#recPause').click();
await pg.waitForTimeout(300);
ok('o rótulo virou Retomar', (await pg.locator('#recPause').textContent()).trim() === 'Retomar');
ok('a mensagem avisa que está pausado', /PAUSADO/.test(await pg.locator('#recMsg').textContent()));
ok('marcar fica indisponível na pausa', await pg.locator('#recMark').isDisabled());
const relA = await pg.evaluate(() => document.getElementById('recMsg').textContent);
const nA = await nFrames();
await pg.waitForTimeout(9000);      // a tela sintética troca de cor a cada ~3 s
const nB = await nFrames();
const relB = await pg.evaluate(() => document.getElementById('recMsg').textContent);
ok('nenhum quadro novo durante a pausa', nB === nA, `${nA} → ${nB}`);
ok('mas o relógio continuou andando', relA !== relB, JSON.stringify([relA.slice(0,26), relB.slice(0,26)]));

console.log('\n[4] retomar captura o estado novo');
await pg.locator('#recPause').click();
await pg.waitForTimeout(600);
const nC = await nFrames();
ok('retomar guardou a tela de volta', nC === nB + 1, `${nB} → ${nC}`);
ok('o rótulo voltou para Pausar', (await pg.locator('#recPause').textContent()).trim() === 'Pausar');
ok('marcar voltou a funcionar', !(await pg.locator('#recMark').isDisabled()));

console.log('\n[5] parar limpa os controles');
await pg.locator('#recStop').click();
await pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null, null, { timeout: 20000 });
await pg.waitForTimeout(600);
ok('pausar sumiu', await pg.locator('#recPause').isHidden());
ok('marcar sumiu', await pg.locator('#recMark').isHidden());
const marcados = await pg.locator('#thumbs figcaption').evaluateAll(
  ns => ns.filter(n => n.textContent.includes('*')).length);
ok('o quadro marcado ficou assinalado na miniatura', marcados >= 1, marcados + ' com *');

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 200));
await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nPausa e marcação: tudo passou.');
process.exit(falhas ? 1 : 0);
