/* O ÁUDIO ANTES DO MODELO — o que a transcrição custa fora do Whisper.
 *
 * A queixa é "a transcrição é o meu maior problema", e a suspeita de sempre é o
 * modelo de voz. Ele é mesmo o dominante — 80 a 600 MB — mas ele não sobe nesta
 * máquina (a CDN do modelo não é alcançável daqui), e há um pedaço que sobe: a
 * EXTRAÇÃO DO ÁUDIO. Ela roda antes de qualquer inferência, e numa gravação de
 * duas horas ela sozinha aloca centenas de megabytes.
 *
 * Este arquivo mede esse pedaço com material de verdade: uma hora de vídeo com
 * áudio estéreo a 48 kHz, que é o que sai de uma gravação de tela.
 *
 * Ele afirma o que não depende da máquina:
 *
 *   - que o áudio entregue ao modelo está a 16 kHz MONO, que é o que o Whisper
 *     pede — e não a 48 kHz estéreo, que é 6× mais bytes;
 *   - que a taxa é CONFERIDA e não suposta: um navegador que ignore o pedido de
 *     16 kHz entregaria fala em câmera lenta ao modelo, e o defeito apareceria
 *     como "a transcrição veio errada", não como "a taxa está errada";
 *   - que o canal do meio não é jogado fora (em 5.1 é nele que mora a fala).
 *
 * Tempo e memória saem impressos.
 *
 *   node testes/audio.mjs
 *
 * Precisa de `/tmp/longo.webm`:  python3 testes/amostras.py --longo
 */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const RAIZ = `${RAIZ_WS}`;
const VIDEO = '/tmp/longo.webm';
if (!fs.existsSync(VIDEO)) {
  console.log('  pulado  ' + VIDEO + ' não existe.');
  console.log('          Gere com:  python3 testes/amostras.py --longo   (~1 min)');
  process.exit(0);
}

const html = fs.readFileSync(RAIZ + '/public/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) {
    r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end('');
  }
  r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(html);
});
await new Promise(r => srv.listen(8942, r));

let falhas = 0;
const ok = (n, c, e) => {
  console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : ''));
  if (!c) falhas++;
};

const br = await chromium.launch({
  executablePath: CHROME_WS,
  args: ['--enable-precise-memory-info', '--js-flags=--expose-gc',
         '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await br.newContext({ viewport: { width: 1250, height: 980 } });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));
await pg.goto('http://localhost:8942/app.html?lang=pt');
await pg.selectOption('#modelo', 'evidencia').catch(() => {});
await pg.waitForTimeout(300);
await pg.setInputFiles('#file', VIDEO);
await pg.waitForFunction(() => !document.getElementById('extract').disabled,
                         null, { timeout: 90000 });

/* `__audio16k` é a mesma função que a transcrição usa, exposta para a régua.
   Medir uma cópia dela aqui mediria a cópia. */
const r = await pg.evaluate(async () => {
  const f = window.__arquivoAtual && window.__arquivoAtual();
  if (!f) return { erro: 'sem arquivo' };
  if (window.gc) window.gc();
  const h0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
  const t0 = performance.now();
  const dados = await window.__audio16k(f);
  const t1 = performance.now();
  const h1 = performance.memory ? performance.memory.usedJSHeapSize : 0;
  /* Uma amostra do sinal: se a mistura tivesse jogado fora um canal, ou se a
     taxa tivesse ficado em 48k, isto seria outro número. */
  let pico = 0, soma = 0;
  for (let i = 0; i < dados.length; i += 97) {
    const v = Math.abs(dados[i]); if (v > pico) pico = v; soma += v;
  }
  /* O que fica RETIDO depois da coleta, com só o resultado na mão. É outra
     pergunta que o pico: o pico dura um instante, o retido dura a transcrição
     inteira. E é aqui que se vê se o resultado está segurando, por baixo, o
     `AudioBuffer` de dois canais de onde ele saiu. */
  window.__retido = dados;
  if (window.gc) { window.gc(); await new Promise(r => setTimeout(r, 300)); window.gc(); }
  const h2 = performance.memory ? performance.memory.usedJSHeapSize : 0;
  return {
    amostras: dados.length,
    bytes: dados.byteLength,
    tipo: dados.constructor.name,
    ms: t1 - t0,
    heapAntes: h0, heapDepois: h1, heapRetido: h2,
    pico, medio: soma / Math.ceil(dados.length / 97),
    arquivoBytes: f.size,
    duracaoVideo: document.getElementById('v').duration
  };
});

if (r.erro) { console.log('  FALHA  ' + r.erro); process.exit(1); }

const seg = r.amostras / 16000;
const linha = (k, v) => console.log('   ' + k.padEnd(38) + v);
console.log(`\n  extração do áudio de ${(r.duracaoVideo / 60).toFixed(0)} minutos de vídeo\n`);
linha('arquivo de entrada', (r.arquivoBytes / 1048576).toFixed(1) + ' MB');
linha('tempo de parede', (r.ms / 1000).toFixed(1) + ' s  (' +
      (r.duracaoVideo / (r.ms / 1000)).toFixed(0) + '× o tempo real)');
linha('amostras entregues ao modelo', r.amostras.toLocaleString('pt-BR') +
      '   = ' + (seg / 60).toFixed(1) + ' min a 16 kHz');
linha('o buffer que fica', (r.bytes / 1048576).toFixed(1) + ' MB  (' + r.tipo + ')');
/* O que ele SERIA sem a redução: 48 kHz estéreo é 6× mais bytes. É a conta que
   a proposta de "cortar 80% do buffer" queria fazer — e que já está feita. */
linha('… se fosse 48 kHz estéreo', (r.bytes * 6 / 1048576).toFixed(1) + ' MB');
linha('heap JS antes / depois', (r.heapAntes / 1048576).toFixed(1) + ' MB / ' +
      (r.heapDepois / 1048576).toFixed(1) + ' MB');
linha('heap RETIDO (só o resultado na mão)', (r.heapRetido / 1048576).toFixed(1) + ' MB');
linha('sinal: pico / médio', r.pico.toFixed(3) + ' / ' + r.medio.toFixed(3));

console.log('\n  o que este arquivo AFIRMA:');
/* 16 kHz mono é o que o Whisper pede. Entregar 48 kHz faria o modelo ouvir a
   fala três vezes mais rápida — e o defeito chegaria como "a transcrição veio
   errada", que manda procurar no lugar errado. */
ok('o áudio entregue tem a duração do vídeo, a 16 kHz',
   Math.abs(seg - r.duracaoVideo) < 2, seg.toFixed(1) + ' s de ' + r.duracaoVideo + ' s');
ok('e é um canal só', r.tipo === 'Float32Array' && r.bytes === r.amostras * 4,
   r.tipo + ' ' + r.bytes + ' B para ' + r.amostras + ' amostras');
/* O vídeo de amostra tem 300 Hz num canal e 440 Hz no outro; o que se cobra aqui
   é só que sobrou sinal — silêncio significaria mistura zerada. O QUANTO sobra
   depende do codec e do bitrate da amostra, e afirmar sobre isso seria afirmar
   sobre o ffmpeg. */
ok('e traz sinal de verdade — a mistura não silenciou o áudio',
   r.pico > 0.01 && r.medio > 0.001, 'pico ' + r.pico.toFixed(3) + ' médio ' + r.medio.toFixed(3));

/* ---- O CANAL DO MEIO ----
   Em 5.1 a fala mora no canal 2. A mistura antiga somava só o 0 e o 1: num vídeo
   5.1 ela entregaria ao modelo a trilha e o ambiente, sem o diálogo — e o
   sintoma seria "ele quase não transcreveu", que não parece erro de mistura.
   Aqui o caso é montado à mão, porque um 5.1 de verdade só reproduziria o mesmo
   com muito mais peças no caminho. */
{
  const m = await pg.evaluate(() => {
    const ctx = new OfflineAudioContext(1, 1000, 16000);
    const b = ctx.createBuffer(6, 1000, 16000);   // 5.1: L R C LFE SL SR
    b.getChannelData(2).fill(0.6);                // só o canal do meio tem fala
    const out = window.__misturarCanais(b);
    let pico = 0;
    for (let i = 0; i < out.length; i++) pico = Math.max(pico, Math.abs(out[i]));
    return { pico, canais: b.numberOfChannels };
  });
  ok('num 5.1, a fala do canal do meio chega ao modelo',
     m.pico > 0.05, 'pico ' + m.pico.toFixed(3) + ' em ' + m.canais + ' canais');
}
ok('sem erro de JavaScript', erros.length === 0, erros.join(' | ').slice(0, 200));

/* ---- a taxa é CONFERIDA, não suposta ----
   `new AudioContext({sampleRate:16000})` é um PEDIDO. Safari ignorou esse
   pedido por anos, e um navegador que o ignore devolve 48 kHz sem erro nenhum:
   a fala chega ao modelo três vezes mais rápida e o texto sai lixo. Aqui o
   navegador é forçado a mentir, e o que se cobra é que a ferramenta perceba. */
console.log('\n  com um navegador que IGNORA o pedido de 16 kHz:');
{
  const ctx2 = await br.newContext({ viewport: { width: 1250, height: 980 } });
  await ctx2.addInitScript(() => {
    const AC = window.AudioContext;
    /* Um AudioContext que aceita a opção e devolve 48000, como o Safari fazia. */
    window.AudioContext = class extends AC {
      constructor(opcoes) { super(); this.__pedido = opcoes && opcoes.sampleRate; }
    };
  });
  const p2 = await ctx2.newPage();
  const e2 = [];
  p2.on('pageerror', e => e2.push(e.message));
  await p2.goto('http://localhost:8942/app.html?lang=pt');
  await p2.selectOption('#modelo', 'evidencia').catch(() => {});
  await p2.setInputFiles('#file', VIDEO);
  await p2.waitForFunction(() => !document.getElementById('extract').disabled,
                           null, { timeout: 90000 });
  const r2 = await p2.evaluate(async () => {
    const f = window.__arquivoAtual();
    const t0 = performance.now();
    const d = await window.__audio16k(f);
    return { amostras: d.length, ms: performance.now() - t0,
             taxaDoContexto: new AudioContext().sampleRate };
  });
  const seg2 = r2.amostras / 16000;
  console.log('   ' + 'taxa que o navegador deu'.padEnd(38) + r2.taxaDoContexto + ' Hz');
  console.log('   ' + 'áudio entregue ao modelo'.padEnd(38) + seg2.toFixed(1) + ' s');
  ok('a ferramenta reamostra e entrega a duração certa mesmo assim',
     Math.abs(seg2 - r.duracaoVideo) < 2,
     seg2.toFixed(1) + ' s de ' + r.duracaoVideo + ' s');
  ok('sem erro de JavaScript', e2.length === 0, e2.join(' | ').slice(0, 200));
  await ctx2.close();
}

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
