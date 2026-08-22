/* O PLANO DE JANELAS E A MONTAGEM — o que a transcrição de arquivo custa fora
   do modelo.
 *
 * A queixa é de velocidade, e o modelo é o dominante — mas ele não é a única
 * coisa que gasta o tempo de quem espera. Este arquivo mede o NOSSO caminho,
 * com um modelo falsificado que cobra um preço fixo por janela, e afirma três
 * coisas que não dependem da máquina:
 *
 *   - que o modelo é montado UMA VEZ, e não duas. O adiantamento (a caixa
 *     "transcrever ao vivo") e o passo 2 disputavam a montagem: o passo 2 via
 *     `pipeServe()` falso enquanto a primeira ainda corria e abria a segunda;
 *   - que a extração do áudio e a montagem do modelo correm JUNTAS, e não uma
 *     depois da outra;
 *   - que a compactação do silêncio manda menos janelas ao modelo E devolve os
 *     tempos da gravação, e não os do áudio compactado. O segundo importa mais
 *     que o primeiro: uma legenda rápida no minuto errado é pior que uma lenta.
 *
 *   node testes/plano.mjs
 */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';

import { CHROME_WS } from './_caminhos.mjs';
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'public');
const CHROME = process.env.CHROME || CHROME_WS;
const VIDEO = '/tmp/reuniao.webm';
const MS_JANELA = 200, MS_MONTAGEM = 3000;
const SEG_AMOSTRA = 150;

const T = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.webm':'video/webm',
           '.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end(''); }
  const u = q.url.split('?')[0], f = path.join(RAIZ, u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'}); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(8951, r));

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

/* O modelo de mentira devolve um trecho por SEGUNDO de janela, com o texto
   carimbado com o instante — é assim que a régua sabe para onde cada tempo foi
   mapeado sem depender de o Whisper acertar coisa nenhuma. */
const FAKE = `
export const env = { allowLocalModels:true, allowRemoteModels:true, backends:{ onnx:{ wasm:{} } } };
export async function pipeline(){
  self.__marca('montagem');
  await new Promise(r => setTimeout(r, ${MS_MONTAGEM}));
  const f = async (d) => {
    self.__janela(d.length);
    await new Promise(r => setTimeout(r, ${MS_JANELA}));
    const n = Math.max(1, Math.floor(d.length / 16000 / 5));
    return { chunks: Array.from({length:n}, (_, k) => ({ timestamp:[k*5, k*5+4], text:'t'+(k*5) })) };
  };
  f.dispose = async () => {};
  return f;
}`;

const br = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });

/* ---- A AMOSTRA ----

   Ela não vem do `amostras.py` porque o que ela precisa ter é justamente o que
   um `sine` do ffmpeg não tem: FALA E PAUSA, com o formato de uma reunião. E
   ela é gravada aqui dentro, pelo próprio MediaRecorder, porque um .webm com
   Opus é o que uma captura de tela produz — decodificá-lo é o caminho de
   verdade, e um .wav mediria outro.

   Custa dois minutos e meio, uma vez: fica em /tmp e as corridas seguintes a
   reaproveitam. */
async function gravarAmostra(){
  const pg = await br.newPage();
  await pg.goto('about:blank');
  const b64 = await pg.evaluate(async (SEG) => {
    const SR = 48000, ac = new AudioContext({ sampleRate: SR });
    const buf = ac.createBuffer(2, SR*SEG, SR);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    let s = 7; const rnd = () => (s = (s*1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let i = 0, ph = 0;
    while (i < L.length) {
      const d = 3 + rnd()*5, f0 = 95 + rnd()*80, n = Math.min(L.length - i, Math.floor(d*SR));
      for (let k = 0; k < n; k++) {
        const t = k/SR;
        const env = t < .03 ? t/.03 : (t > d-.03 ? Math.max(0,(d-t)/.03) : 1);
        const syl = .35 + .65*Math.abs(Math.sin(2*Math.PI*3.8*t));
        ph += 2*Math.PI*f0/SR;
        const v = ((Math.sin(ph) + .5*Math.sin(2*ph) + .25*Math.sin(3*ph))/1.75
                   + .18*(rnd()*2-1)) * env * syl * .42;
        L[i+k] = v; R[i+k] = v;
      }
      i += n;
      const g = rnd() < .3 ? 5 + rnd()*8 : .4 + rnd()*1.6;
      const m = Math.min(L.length - i, Math.floor(g*SR));
      for (let k = 0; k < m; k++) { const q = (rnd()*2-1)*.0015; L[i+k] = q; R[i+k] = q; }
      i += m;
    }
    const src = ac.createBufferSource(); src.buffer = buf;
    const dst = ac.createMediaStreamDestination(); src.connect(dst);
    const c = document.createElement('canvas'); c.width = 640; c.height = 360;
    const x = c.getContext('2d'); let n = 0;
    const pinta = () => { n++; x.fillStyle = ['#203040','#304050','#405060'][Math.floor(n/25)%3];
                          x.fillRect(0,0,640,360); x.fillStyle = '#fff'; x.font = '28px sans-serif';
                          x.fillText('cena ' + Math.floor(n/25), 40, 180); };
    pinta(); setInterval(pinta, 200);
    const st = new MediaStream([...c.captureStream(5).getVideoTracks(), ...dst.stream.getAudioTracks()]);
    const rec = new MediaRecorder(st, { mimeType: 'video/webm;codecs=vp8,opus' });
    const pedacos = []; rec.ondataavailable = e => pedacos.push(e.data);
    const pronto = new Promise(r => rec.onstop = r);
    rec.start(); src.start();
    await new Promise(r => setTimeout(r, SEG*1000 + 400));
    rec.stop(); await pronto;
    const u = new Uint8Array(await new Blob(pedacos, { type:'video/webm' }).arrayBuffer());
    let bin = '';
    for (let k = 0; k < u.length; k += 8192) bin += String.fromCharCode(...u.subarray(k, k+8192));
    return btoa(bin);
  }, SEG_AMOSTRA);
  fs.writeFileSync(VIDEO, Buffer.from(b64, 'base64'));
  await pg.close();
}

if (!fs.existsSync(VIDEO)) {
  console.log('  gravando a amostra de ' + SEG_AMOSTRA + ' s (uma vez; fica em ' + VIDEO + ')…');
  await gravarAmostra();
}
console.log('  amostra: ' + (fs.statSync(VIDEO).size/1048576).toFixed(2) + ' MB');

async function rodar({ adiantar }) {
  const pg = await br.newPage();
  const erros = []; pg.on('pageerror', e => erros.push(e.message));
  await pg.route('**/rpc/*stamp_*', r => r.fulfill({ status:200, headers:{'access-control-allow-origin':'*'}, body:'null' }));
  await pg.route('**/@huggingface/transformers**', r => r.fulfill({ status:200,
    headers:{'content-type':'text/javascript','access-control-allow-origin':'*'}, body: FAKE }));
  await pg.addInitScript(() => {
    window.__t0 = performance.now(); window.__marcas = []; window.__janelas = [];
    /* Contador que NÃO é zerado pelo relógio do clique: o adiantamento acontece
       antes dele, e o que se quer saber é quantas montagens houve NA VIDA da
       página — uma montagem "depois do clique" pode ser a única que houve. */
    window.__montagens = 0;
    window.__marca = n => { if (n === 'montagem') window.__montagens++;
                            window.__marcas.push({ n, ms: Math.round(performance.now() - window.__t0) }); };
    window.__janela = len => window.__janelas.push({ amostras: len, ms: Math.round(performance.now() - window.__t0) });
    /* O relógio da decodificação, apanhado onde ela realmente acontece. */
    const d0 = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = function (...a) {
      window.__marca('audio:inicio');
      return d0.apply(this, a).then(r => { window.__marca('audio:fim'); return r; });
    };
  });
  await pg.goto('http://localhost:8951/app.html?lang=pt');
  await pg.waitForTimeout(400);
  await pg.selectOption('#modelo', 'evidencia').catch(() => {});
  /* Marcar "transcrever ao vivo" é o que dispara o adiantamento do modelo. */
  if (adiantar) await pg.check('#recTr').catch(() => {});
  await pg.setInputFiles('#file', VIDEO);
  await pg.waitForFunction(() => !document.getElementById('extract').disabled, null, { timeout: 60000 });

  await pg.evaluate(() => { window.__t0 = performance.now(); window.__marcas = []; window.__janelas = []; });
  await pg.click('#auto');
  await pg.waitForFunction(() => document.getElementById('auto').disabled === false &&
    /WEBVTT/.test(document.getElementById('tr').value), null, { timeout: 300000 });

  const r = await pg.evaluate(() => ({
    marcas: window.__marcas, janelas: window.__janelas, montagens: window.__montagens,
    adiantou: !!window.__adiantou,
    plano: window.__ultimoPlano, vtt: document.getElementById('tr').value,
    fim: Math.round(performance.now() - window.__t0),
  }));
  await pg.close();
  return { ...r, erros };
}

/* ---------------------------------------------------------- 1. sem adiantar */
const a = await rodar({ adiantar: false });
const montagens = a.marcas.filter(m => m.n === 'montagem');
const audioIni = a.marcas.find(m => m.n === 'audio:inicio');
const audioFim = a.marcas.find(m => m.n === 'audio:fim');

console.log('\n--- sem adiantamento (ms desde o clique) ---');
for (const m of a.marcas) console.log('  ' + String(m.ms).padStart(6) + '  ' + m.n);
console.log('  ' + String(a.janelas[0] ? a.janelas[0].ms : -1).padStart(6) + '  primeira inferência');
console.log('  ' + String(a.fim).padStart(6) + '  fim');
console.log('  plano:', JSON.stringify(a.plano));

ok('sem erro de página', a.erros.length === 0, a.erros[0]);
ok('uma montagem só', montagens.length === 1, montagens.length + ' montagens');
/* A afirmação da sobreposição: a montagem COMEÇA antes de a extração terminar.
   Comparar durações seria comparar a máquina; comparar a ordem é comparar o
   desenho, que é o que mudou. */
ok('montagem começa antes de o áudio terminar',
   !!(audioFim && montagens[0] && montagens[0].ms < audioFim.ms),
   'montagem em ' + (montagens[0] && montagens[0].ms) + ', áudio termina em ' + (audioFim && audioFim.ms));

/* ------------------------------------------------- 2. com o adiantamento em curso */
const b = await rodar({ adiantar: true });
console.log('\n--- com "transcrever ao vivo" marcado (o modelo é adiantado) ---');
console.log('  adiantamento disparou: ' + b.adiantou);
console.log('  montagens na vida da página: ' + b.montagens);
ok('o adiantamento disparou', b.adiantou);
ok('o passo 2 não monta de novo por cima do adiantamento', b.montagens === 1,
   b.montagens + ' montagens na vida da página');
ok('sem erro de página (adiantando)', b.erros.length === 0, b.erros[0]);

/* --------------------------------------------- 3. o plano, e os tempos de volta */
console.log('\n--- o plano ---');
const p = a.plano;
console.log(`  janelas retas ......... ${p.retas}`);
console.log(`  janelas ao modelo ..... ${p.total}   (${p.compacta ? 'compactado' : 'reto'})`);
console.log(`  silêncio deixado fora . ${p.silencio.toFixed(1)} s`);
console.log(`  inferências ........... ${a.janelas.length}`);
ok('o modelo recebeu exatamente as janelas do plano', a.janelas.length === p.total,
   a.janelas.length + ' ≠ ' + p.total);
ok('nenhuma janela passa de 30 s', a.janelas.every(j => j.amostras <= 30*16000),
   'maior: ' + Math.max(...a.janelas.map(j => j.amostras)) / 16000 + ' s');

/* Os tempos da legenda têm que caber na duração da GRAVAÇÃO, e não na do áudio
   compactado. Com o mapa de volta quebrado, o último tempo encolhe. */
const tempos = [...a.vtt.matchAll(/(\d\d):(\d\d):(\d\d\.\d\d\d) -->/g)]
  .map(m => +m[1]*3600 + +m[2]*60 + +m[3]);
console.log(`  primeiro tempo ........ ${tempos[0].toFixed(1)} s`);
console.log(`  último tempo .......... ${tempos[tempos.length-1].toFixed(1)} s`);
ok('os tempos sobem', tempos.every((v, i) => i === 0 || v >= tempos[i-1]));
/* A afirmação que pega o mapa quebrado: sem ele o último tempo ficaria preso à
   duração do áudio COMPACTADO, que é menor que a da gravação pelo tanto de
   silêncio que saiu. */
const somaJanelas = a.janelas.reduce((s, j) => s + j.amostras, 0) / 16000;
ok('o último tempo passa da duração do áudio compactado',
   !p.compacta || tempos[tempos.length-1] > somaJanelas - 30,
   'último ' + tempos[tempos.length-1].toFixed(1) + ' s, compactado ' + somaJanelas.toFixed(1) + ' s');

/* ------------------- 4. o plano, com fala em posições CONHECIDAS ----------
   O arquivo gravado tem 90 s e três janelas: ele prova o caminho, não a
   compactação. Aqui o áudio é construído com a fala em lugares que a régua
   sabe de cor, e as duas afirmações que importam são feitas sobre eles:

     - NENHUMA FALA SE PERDE. É a que protege o produto: uma transcrição
       rápida com um pedaço faltando é pior do que uma lenta e inteira.
     - O MAPA DE VOLTA ACERTA. Um instante dentro da janela compactada volta
       para o instante da gravação, e não para o do áudio encolhido. */
const pg = await br.newPage();
const erros4 = []; pg.on('pageerror', e => erros4.push(e.message));
await pg.route('**/rpc/*stamp_*', r => r.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:'null'}));
await pg.goto('http://localhost:8951/app.html?lang=pt');
await pg.waitForTimeout(300);

const r4 = await pg.evaluate(() => {
  const SR = 16000, MIN = 8;
  const buf = new Float32Array(MIN * 60 * SR);
  /* Uma reunião: frases de 3 a 8 s, pausas curtas entre elas, alguma longa. */
  let s = 7; const rnd = () => (s = (s*1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const falas = [];
  let i = 0, ph = 0;
  while (i < buf.length) {
    const d = 3 + rnd()*5, n = Math.min(buf.length - i, Math.floor(d*SR)), f0 = 95 + rnd()*80;
    falas.push([i, i + n]);
    for (let k = 0; k < n; k++) {
      ph += 2*Math.PI*f0/SR;
      const t = k/SR, syl = .35 + .65*Math.abs(Math.sin(2*Math.PI*3.8*t));
      buf[i+k] = ((Math.sin(ph) + .5*Math.sin(2*ph))/1.5 + .18*(rnd()*2-1)) * syl * .42;
    }
    i += n;
    const g = rnd() < .15 ? 6 + rnd()*10 : .4 + rnd()*1.6;
    const m = Math.min(buf.length - i, Math.floor(g*SR));
    for (let k = 0; k < m; k++) buf[i+k] = (rnd()*2-1)*.0015;   // ar-condicionado
    i += m;
  }
  const esc = window.__planoJanelas(buf, 30*SR);

  /* Cobertura: o meio de cada frase precisa estar dentro de alguma janela. */
  let perdidas = 0;
  for (const [a, b] of falas) {
    const meio = (a + b) >> 1;
    if (!esc.janelas.some(j => j.trechos.some(x => meio >= x.s && meio < x.e))) perdidas++;
  }

  /* Mapa de volta: para cada janela, o começo de cada trecho tem que voltar
     exatamente para onde ele saiu. */
  let erroMax = 0;
  for (const j of esc.janelas) {
    for (const x of j.trechos) {
      const volta = window.__tempoReal(j, x.off / SR);
      erroMax = Math.max(erroMax, Math.abs(volta - x.s / SR));
    }
  }
  /* E a janela materializada tem o tamanho que o plano prometeu. */
  const tamOk = esc.janelas.every(j => window.__materializar(buf, j).length === j.amostras);
  const maior = Math.max(...esc.janelas.map(j => j.amostras));
  return { retas: esc.retas, total: esc.janelas.length, compacta: esc.compacta,
           silencio: esc.silencio, frases: falas.length, perdidas, erroMax, tamOk, maior,
           minutos: buf.length / SR / 60 };
});
await pg.close();

console.log('\n--- plano sobre áudio de posições conhecidas ---');
console.log(`  gravação .............. ${r4.minutos.toFixed(1)} min, ${r4.frases} frases`);
console.log(`  janelas retas ......... ${r4.retas}`);
console.log(`  janelas compactadas ... ${r4.total}   (${(100 - r4.total/r4.retas*100).toFixed(0)}% menos inferência)`);
console.log(`  silêncio fora ......... ${(r4.silencio/60).toFixed(1)} min`);
console.log(`  erro do mapa de volta . ${(r4.erroMax*1000).toFixed(3)} ms`);
ok('sem erro de página', erros4.length === 0, erros4[0]);
ok('a compactação entrou', r4.compacta === true);
ok('mandou menos janelas ao modelo', r4.total < r4.retas, r4.total + ' de ' + r4.retas);
ok('nenhuma frase ficou de fora', r4.perdidas === 0, r4.perdidas + ' frases perdidas');
ok('o mapa de volta acerta o instante', r4.erroMax < 0.001, (r4.erroMax*1000).toFixed(1) + ' ms de erro');
ok('nenhuma janela passa de 30 s', r4.maior <= 30*16000, r4.maior/16000 + ' s');
ok('a janela materializada tem o tamanho do plano', r4.tamOk);

await br.close(); srv.close();
console.log(falhas ? `\n  ${falhas} falha(s)` : '\n  tudo certo');
process.exit(falhas ? 1 : 0);
