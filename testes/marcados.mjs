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
await new Promise(r => srv.listen(8906, r));

const br = await chromium.launch({
  executablePath: CHROME_WS,
  args: ['--autoplay-policy=no-user-gesture-required']
});
let falhas = 0;
const ok = (n, c, extra) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (extra ? '  → ' + extra : '')); if (!c) falhas++; };

const ctx = await br.newContext({ viewport: { width: 1100, height: 900 } });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));

const FAKE = `
export const env = { allowLocalModels:true, allowRemoteModels:true, version:'3-falso',
                     backends:{ onnx:{ wasm:{} } } };
export async function pipeline(){
  let n = 0;
  return async () => { n++; return { chunks: [{ timestamp:[0,2], text:'fala ' + n }] }; };
}
`;
await pg.route('**/@huggingface/transformers**', r => r.fulfill({
  status: 200, headers: {'content-type':'text/javascript','access-control-allow-origin':'*'}, body: FAKE }));
await pg.route('**/onnxruntime-web**', r => r.fulfill({
  status: 200, headers: {'content-type':'application/wasm','access-control-allow-origin':'*'}, body: 'x' }));

await pg.addInitScript(() => {
  function tela(){
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const g = c.getContext('2d'); let i = 0;
    setInterval(() => { i++; g.fillStyle = ['#123','#eee','#567','#fa0','#0af'][i%5]; g.fillRect(0,0,1280,720); }, 800);
    const s = c.captureStream(12);
    // som do computador mudo de propósito: gera a nota de canal parado
    const ac = new AudioContext(), o = ac.createOscillator(), gain = ac.createGain(), d = ac.createMediaStreamDestination();
    gain.gain.value = 0; o.connect(gain); gain.connect(d); o.start();
    d.stream.getAudioTracks().forEach(t => s.addTrack(t));
    return s;
  }
  function mic(){
    const ac = new AudioContext(), o = ac.createOscillator(), d = ac.createMediaStreamDestination();
    o.frequency.value = 300; o.connect(d); o.start();
    return d.stream;
  }
  navigator.mediaDevices.getDisplayMedia = async () => tela();
  navigator.mediaDevices.getUserMedia = async () => mic();
});

await pg.goto('http://localhost:8906/app.html?lang=pt');
// o cenário de uso passou a ser obrigatório: sem ele o botão Gravar cobra a escolha
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.waitForTimeout(500);

console.log('[1] gravando e marcando duas telas');
await pg.locator('#rec').click();
await pg.waitForSelector('#recStop:visible', { timeout: 40000 });
await pg.waitForTimeout(3000);
await pg.locator('#recMark').click();
await pg.waitForTimeout(2500);
await pg.locator('#recMark').click();
await pg.waitForTimeout(3000);
await pg.locator('#recStop').click();
await pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null, null, { timeout: 60000 });
await pg.waitForTimeout(800);

console.log('\n[2] a mensagem de fim não parece um erro');
{
  const r = await pg.evaluate(() => {
    const m = document.getElementById('recMsg');
    const err = m.querySelector('.err'), nota = m.querySelector('.nota'), ok = m.querySelector('.ok');
    return { temErr: !!err, temNota: !!nota, temOk: !!ok,
             corNota: nota ? getComputedStyle(nota).color : null,
             txt: m.textContent.slice(0, 140) };
  });
  ok('a parte boa está marcada como sucesso', r.temOk);
  ok('a observação do canal mudo NÃO é vermelha de erro', !r.temErr, r.txt);
  ok('ela é uma nota', r.temNota, r.corNota || '');
}

console.log('\n[3] o botão Transcrever explica por que está cinza');
{
  const b = await pg.evaluate(() => {
    const e = document.getElementById('auto');
    return { disabled: e.disabled, txt: e.textContent.trim(), title: e.title };
  });
  ok('continua desabilitado', b.disabled);
  ok('o rótulo diz o estado', /já transcrito ao vivo/.test(b.txt), b.txt);
  ok('o título explica', /não há o que transcrever de novo/.test(b.title), b.title.slice(0, 70));
}

console.log('\n[4] manter só as marcadas');
{
  const total = await pg.locator('#thumbs figure').count();
  ok('há mais telas do que as marcadas', total > 2, total + ' miniaturas');
  ok('o botão apareceu', await pg.locator('#soMarcados').isVisible());
  ok('o rótulo traz a contagem', /\(2\)/.test(await pg.locator('#soMarcados').textContent()),
     await pg.locator('#soMarcados').textContent());

  await pg.locator('#soMarcados').click();
  await pg.waitForTimeout(400);
  const mantidos = await pg.locator('#thumbs figure:not(.off)').count();
  ok('sobraram só as duas marcadas', mantidos === 2, mantidos + ' mantidas');
  ok('as outras foram descartadas, não apagadas',
     (await pg.locator('#thumbs figure').count()) === total);
  ok('a mensagem explica o que fez',
     /Mantidas as 2 telas que você marcou/.test(await pg.locator('#status').textContent()),
     (await pg.locator('#status').textContent()).slice(0, 70));

  await pg.locator('#allOn').click();
  await pg.waitForTimeout(300);
  ok('Manter todos desfaz', (await pg.locator('#thumbs figure:not(.off)').count()) === total);
}

console.log('\n[5] a barra da cauda existe e é a que se vê');
{
  const fonte = fs.readFileSync(`${RAIZ_WS}/public/app.html`, 'utf8');
  ok('a barra da cauda mora no cartão 1', /id="caudaBar"/.test(fonte));
  ok('a porcentagem sai do total da cauda', /function progressoCauda\(\)/.test(fonte));
  ok('a previsão usa o ritmo medido', /relogio\.audio \/ \(relogio\.ms \/ 1000\)/.test(fonte));
  ok('há respiro entre os trechos', /requestAnimationFrame\(\(\) => requestAnimationFrame\(r\)\)/.test(fonte));
  ok('a inferência tenta sair do fio principal', /wasm\.proxy = !!amb\.proxy/.test(fonte));
  ok('a combinação guardada tem versão', /j\.v === MOTOR_VER/.test(fonte));
}

console.log('\n[6] o retorno na janelinha flutuante');
{
  /* A janelinha usa Document Picture-in-Picture, que o Chromium sem cabeça não
     abre — então aqui a verificação é do código que a alimenta. O comportamento
     em si depende de um gesto de usuário numa janela de verdade. */
  const fonte = fs.readFileSync(`${RAIZ_WS}/public/app.html`, 'utf8');
  ok('a confirmação tem prazo, como o aviso da página', /pipAvisoAte = performance\.now\(\)/.test(fonte));
  ok('o relógio da janelinha respeita o prazo', /const aviso = \(performance\.now\(\) < pipAvisoAte\)/.test(fonte));
  ok('o botão da janelinha pisca', /pipMarcar\.classList\.toggle\('piscou'/.test(fonte));
  ok('a janelinha conta as marcadas', /pipMarcados/.test(fonte));
  ok('marcar avisa a janelinha na hora', /pipAviso = t\('pipMarcado'/.test(fonte));
}

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 200));
await br.close(); srv.close();
console.log(falhas ? '\n' + falhas + ' falha(s)' : '\nMarcadas e mensagens: tudo passou.');
process.exit(falhas ? 1 : 0);
