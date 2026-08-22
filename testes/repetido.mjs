import { chromium } from './_navegador.mjs';
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
await new Promise(r => srv.listen(8899, r));

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

/* O modelo falso devolve SEMPRE a mesma frase — que é exatamente o artefato do
   Whisper que apareceu em produção: cinco linhas idênticas em cinco instantes
   diferentes. Uma frase nova entra no meio, para provar que o filtro não come
   fala legítima. */
const FAKE = `
export const env = { allowLocalModels:true, allowRemoteModels:true, version:'3.0.0-falso',
                     backends:{ onnx:{ wasm:{} } } };
export async function pipeline(){
  let n = 0;
  return async () => {
    n++;
    const txt = (n === 3) ? 'agora mudei de assunto' : 'Vamos para a linguagem que está gravando.';
    return { chunks: [{ timestamp: [0, 2], text: txt }] };
  };
}
`;
await pg.route('**/@huggingface/transformers**', r => r.fulfill({
  status: 200, headers: {'content-type':'text/javascript','access-control-allow-origin':'*'}, body: FAKE }));
await pg.route('**/onnxruntime-web**', r => r.fulfill({
  status: 200, headers: {'content-type':'application/wasm','access-control-allow-origin':'*'}, body: 'x' }));

// tela sintética que muda, e um canal de áudio só (microfone)
await pg.addInitScript(() => {
  function tela(){
    const c = document.createElement('canvas'); c.width = 320; c.height = 180;
    const g = c.getContext('2d'); let i = 0;
    setInterval(() => {
      i++; g.fillStyle = ['#123','#345','#567','#789'][i % 4];
      g.fillRect(0, 0, 320, 180);
      g.fillStyle = '#fff'; g.font = '40px sans-serif'; g.fillText('T' + i, 20, 100);
    }, 900);
    return c.captureStream(12);
  }
  function som(){
    const ac = new AudioContext(), o = ac.createOscillator(), d = ac.createMediaStreamDestination();
    o.frequency.value = 220; o.connect(d); o.start();
    return d.stream;
  }
  navigator.mediaDevices.getDisplayMedia = async () => {
    const s = tela(); som().getAudioTracks().forEach(tr => s.addTrack(tr)); return s;
  };
  navigator.mediaDevices.getUserMedia = async () => som();
});

await pg.goto('http://localhost:8899/app.html?lang=pt');
// o cenário de uso passou a ser obrigatório: sem ele o Gravar e o envio de vídeo cobram a escolha
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.waitForTimeout(500);

console.log('[1] gravando com um modelo que repete a mesma frase');
/* A contagem regressiva de 3 é opção do produto e vem ligada; num teste
     que mede a gravação ela só adiciona três segundos de espera por rodada. */
  await pg.evaluate(() => window.__contagem(1));
  await pg.locator('#rec').click();
await pg.waitForSelector('#recStop:visible', { timeout: 40000 });
await pg.waitForTimeout(26000);            // mais de uma janela de ASR
await pg.locator('#recStop').click();
await pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null, null, { timeout: 60000 });
await pg.waitForTimeout(500);

const vtt = await pg.locator('#tr').inputValue();
console.log('    VTT:\n' + vtt.split('\n').map(l => '      ' + l).join('\n'));

/* O filtro é por CANAL: o microfone e o computador são duas falas diferentes
   que por acaso dizem a mesma coisa, e juntá-las seria apagar informação. O que
   não pode é a mesma frase se repetir dentro do mesmo canal. */
const porCanal = {};
vtt.split('\n').forEach(l => {
  const m = l.match(/^(Microfone|Computador): (.+)$/);
  if (!m) return;
  const k = m[1] + '|' + m[2];
  porCanal[k] = (porCanal[k] || 0) + 1;
});
const repetidas = Object.entries(porCanal).filter(([, n]) => n > 1);
ok('nenhuma frase repetida dentro do mesmo canal', repetidas.length === 0,
   repetidas.map(([k, n]) => k + ' ×' + n).join(' ; '));
ok('os dois canais foram preservados',
   Object.keys(porCanal).some(k => k.startsWith('Microfone')) &&
   Object.keys(porCanal).some(k => k.startsWith('Computador')));
ok('a fala diferente não foi descartada', /mudei de assunto/.test(vtt));
ok('a barra de progresso sumiu no fim',
   await pg.evaluate(() => document.getElementById('abarWrap').classList.contains('hide')));
ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 200));

await br.close(); srv.close();
console.log(falhas ? '\n' + falhas + ' falha(s)' : '\nRepetição do Whisper: tudo passou.');
process.exit(falhas ? 1 : 0);
