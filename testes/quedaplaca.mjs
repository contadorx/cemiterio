/* A QUEDA DA PLACA — a recuperação que esperava por si mesma.
 *
 * O caso: a montagem na placa de vídeo dá certo, e a PRIMEIRA inferência
 * estoura com um erro de sessão. É a classe de máquina que o código já
 * reconhece — tem WebGPU, mas não dá conta do modelo —, e acontece no instante
 * mais caro do fluxo: logo depois do download.
 *
 * O que estava errado, e é o que este arquivo cobra:
 *
 *   1. `usandoPipe` era decrementado no `finally`, quer dizer, DEPOIS do
 *      `catch`. A recuperação chamava `soltarPipe()` estando ela mesma contada
 *      como inferência ativa, e a função espera enquanto houver ativa: 600
 *      ciclos de 100 ms. Um minuto parado antes de o conserto sequer começar;
 *   2. o pipeline de recuperação era montado à mão, com `{ dtype:'q8' }` e SEM
 *      `device:'wasm'` — e sem ele a biblioteca pode escolher a placa sozinha,
 *      fazendo o degrau "de processador" correr pelo caminho que acabou de
 *      falhar;
 *   3. o último degrau da escada é um resgate PELA PLACA. Bom em geral, e uma
 *      armadilha aqui: devolveria a pessoa ao motor que a trouxe até este
 *      ponto.
 *
 * A biblioteca é falsificada, como em `modelo.mjs`: o Whisper real não sobe
 * aqui, e o que precisa rodar de verdade é a escada do `buildPipe` e o ciclo
 * de vida deste arquivo — que é exatamente o que estava quebrado.
 *
 *   node testes/quedaplaca.mjs
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';

const html = fs.readFileSync(RAIZ_WS + '/public/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) {
    r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end('');
  }
  r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(html);
});
await new Promise(r => srv.listen(8947, r));

let falhas = 0;
const ok = (n, c, e) => {
  console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : ''));
  if (!c) falhas++;
};

/* A biblioteca de mentira. Diferença para a do `modelo.mjs`: aqui a placa
   MONTA — é o que faz `motorEmUso` virar 'placa de vídeo' — e quem estoura é a
   primeira inferência. Sem isso o caminho testado não é alcançado. */
const BIBLIOTECA_FALSA = `
globalThis.__reg = globalThis.__reg || {
  montados: [], soltos: [], vivos: 0, chamadas: [], estourou: false, fita: []
};
globalThis.__fita = (o) => globalThis.__reg.fita.push(o);
export const env = {
  allowLocalModels: true, allowRemoteModels: true,
  backends: { onnx: { wasm: { numThreads: 1, wasmPaths: undefined } } }
};
export async function pipeline(tarefa, modelo, opcoes){
  const o = opcoes || {};
  const id = { modelo, device: o.device || '?', dtype: JSON.stringify(o.dtype) };
  globalThis.__reg.montados.push(id);
  globalThis.__fita('montou ' + id.device + ' ' + id.dtype);
  globalThis.__reg.vivos++;
  const p = async (dados) => {
    const n = dados && dados.length ? dados.length : 0;
    globalThis.__reg.chamadas.push({ device: id.device, amostras: n });
    globalThis.__fita('inferiu ' + id.device + ' n=' + n);
    /* A PRIMEIRA inferencia na placa estoura, e so ela: e a maquina que tem
       WebGPU e nao da conta do modelo. */
    if (id.device === 'webgpu' && !globalThis.__reg.estourou) {
      globalThis.__reg.estourou = true;
      globalThis.__fita('ESTOUROU');
      throw new Error('Failed to run JSEP kernel: ERROR_CODE 6, session id 2');
    }
    return { text: 'ok', chunks: [] };
  };
  p.dispose = async () => {
    globalThis.__fita('soltou ' + id.device);
    globalThis.__reg.soltos.push(id);
    globalThis.__reg.vivos--;
  };
  return p;
}
`;

const br = await chromium.launch({ executablePath: CHROME_WS });
const ctx = await br.newContext({ viewport: { width: 1250, height: 980 } });
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', e => erros.push(e.message));
/* A caixa da placa só existe onde o navegador diz ter WebGPU. O Chromium de
   teste não tem — e sem este remendo o caso inteiro é inalcançável. */
await pg.addInitScript(() => {
  try { Object.defineProperty(navigator, 'gpu', { value: { __falso: true }, configurable: true }); }
  catch (e) {}
});
await pg.route('**/@huggingface/transformers**', r => r.fulfill({
  status: 200, headers: { 'content-type': 'text/javascript' }, body: BIBLIOTECA_FALSA }));
await pg.goto('http://localhost:8947/app.html?lang=pt');
await pg.selectOption('#modelo', 'evidencia').catch(() => {});
await pg.locator('#ajustesBtn').click();
await pg.waitForTimeout(400);

const temGpu = await pg.locator('#gpu').count();
if (!temGpu) { ok('a caixa da placa existe', false, 'sem #gpu na página'); }
else { await pg.locator('#gpu').check(); await pg.waitForTimeout(200); }

await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForFunction(() => !document.getElementById('extract').disabled,
                         null, { timeout: 60000 });

const reg = () => pg.evaluate(() => JSON.parse(JSON.stringify(globalThis.__reg || {})));

console.log('[1] a placa cai na primeira inferência, e a recuperação é IMEDIATA');
const t0 = Date.now();
await pg.locator('#auto').click();
await pg.waitForFunction(() => !document.getElementById('auto').disabled,
                         null, { timeout: 120000 });
await pg.waitForTimeout(300);
const gasto = Date.now() - t0;
{
  const r = await reg();
  console.log('     montados: ' + r.montados.map(m => m.device).join(' → '));
  console.log('     inferências: ' + r.chamadas.map(c => c.device).join(' → '));
  console.log('     tempo total: ' + (gasto / 1000).toFixed(1) + ' s');
  console.log('     fita:');
  (r.fita || []).forEach((f, i) => console.log('       ' + (i+1) + '. ' + f));
  ok('a placa chegou a estourar', r.estourou === true);
  /* O NÚMERO QUE IMPORTA. Com o autobloqueio, `soltarPipe()` esperava a própria
     inferência do `catch` terminar — 600 × 100 ms. Doze segundos é folga larga
     para um teste com biblioteca falsa e dá margem de sobra antes dos 60. */
  ok('sem a espera de um minuto', gasto < 12000, (gasto / 1000).toFixed(1) + ' s');
}

console.log('\n[2] a recuperação vai para o PROCESSADOR, e por escrito');
{
  const r = await reg();
  const depois = r.montados.slice(r.montados.findIndex(m => m.device === 'webgpu') + 1);
  ok('montou de novo depois da queda', depois.length >= 1,
     JSON.stringify(r.montados.map(m => m.device)));
  /* Sem `device:'wasm'` explícito a biblioteca pode escolher a placa sozinha —
     e o degrau "de processador" correria pelo caminho que acabou de falhar. */
  ok('e o novo pipeline é wasm', depois.length > 0 && depois[0].device === 'wasm',
     depois.length ? depois[0].device : '—');
  /* O resgate pela placa é o último degrau da escada. Aqui ele é armadilha. */
  ok('nenhum degrau volta para a placa', depois.every(m => m.device !== 'webgpu'),
     JSON.stringify(depois.map(m => m.device)));
}

console.log('\n[3] o mesmo trecho é refeito, e sobra UM modelo vivo');
{
  const r = await reg();
  const naPlaca = r.chamadas.filter(c => c.device === 'webgpu');
  const noProc  = r.chamadas.filter(c => c.device === 'wasm');
  ok('houve inferência no processador depois da queda', noProc.length >= 1,
     JSON.stringify(r.chamadas.map(c => c.device)));
  /* O trecho que estourou não pode sumir do documento: ele é refeito com o
     MESMO áudio, e não pulado. */
  ok('e é o MESMO trecho, refeito',
     naPlaca.length > 0 && noProc.some(c => c.amostras === naPlaca[0].amostras),
     JSON.stringify(r.chamadas));
  /* Dois vivos são dois modelos na memória da aba — na máquina que acabou de
     falhar por não dar conta de um. */
  ok('sobrou UM modelo vivo, não dois', r.vivos === 1, String(r.vivos));
  ok('a placa foi solta', r.soltos.some(m => m.device === 'webgpu'),
     JSON.stringify(r.soltos.map(m => m.device)));
}

console.log('\n[4] a caixa da placa fica desmarcada, e decidida');
{
  const st = await pg.evaluate(() => {
    const g = document.getElementById('gpu');
    return { marcada: !!g && g.checked, mao: !!g && g.dataset.mao === '1' };
  });
  /* Sem o `mao`, a próxima repintura devolve o padrão "marcada" por cima da
     placa que acabou de falhar, e a queda vira um laço. */
  ok('desmarcada', st.marcada === false);
  ok('e marcada como decidida pela pessoa', st.mao === true);
}

ok('sem erro de JavaScript', erros.length === 0, erros.join(' | ').slice(0, 200));
await br.close(); srv.close();
console.log(falhas ? `\n  ${falhas} falha(s)` : '\n  tudo certo');
process.exit(falhas ? 1 : 0);
