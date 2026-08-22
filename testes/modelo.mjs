/* O MODELO DE VOZ NA MEMÓRIA — quem monta, e quem SOLTA.
 *
 * `pipe = null` não solta nada. As sessões do ONNX Runtime não vivem no heap
 * JavaScript: vivem na memória linear do WebAssembly e, no caminho da placa, na
 * VRAM. O coletor de lixo não alcança nenhuma das duas — ele libera o objeto de
 * duzentos bytes que apontava para duzentos e cinquenta megabytes e considera o
 * trabalho feito.
 *
 * Três caminhos trocavam de pipeline sem soltar o anterior, e nos três a pessoa
 * ficava com DOIS modelos residentes:
 *
 *   1. trocar de modelo (base → small);
 *   2. a queda da placa para o processador — o pior dos três, porque acontece
 *      justamente na máquina que já estava sem dar conta;
 *   3. "apagar o modelo de voz baixado", que apagava o cache em disco e deixava
 *      o modelo carregado. O botão dizia que tinha liberado; não tinha.
 *
 * COMO ISTO É TESTADO SEM O MODELO. O Whisper real não sobe aqui (a CDN não é
 * alcançável), e mesmo que subisse, baixar 80 MB por afirmação seria um teste
 * que ninguém roda. Então a BIBLIOTECA é falsificada — o `import()` do
 * transformers.js é respondido com um módulo de mentira que conta montagens e
 * liberações. O que roda de verdade é a escada do `buildPipe` e o ciclo de vida
 * deste arquivo, que é exatamente o que estava quebrado.
 */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const RAIZ = `${RAIZ_WS}`;
const html = fs.readFileSync(RAIZ + '/public/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) {
    r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end('');
  }
  r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(html);
});
await new Promise(r => srv.listen(8943, r));

let falhas = 0;
const ok = (n, c, e) => {
  console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : ''));
  if (!c) falhas++;
};

/* A biblioteca de mentira. Ela responde no lugar do transformers.js e mantém um
   registro do que foi montado e do que foi solto — que é a única pergunta que
   este arquivo faz. */
const BIBLIOTECA_FALSA = `
/* O REGISTRO SOBREVIVE AO MODULO, e isso nao e detalhe: o buildPipe importa o
   transformers.js com um parametro diferente na URL a cada ambiente, de
   proposito — e a unica forma de trocar o runtime do onnxruntime dentro da
   mesma aba. Cada import e um modulo NOVO, e um registro dentro dele seria
   zerado a cada tentativa: o teste mediria so a ultima. */
globalThis.__reg = globalThis.__reg || { montados: [], soltos: [], vivos: 0, modulos: 0 };
globalThis.__reg.modulos++;
export const env = {
  allowLocalModels: true,
  allowRemoteModels: true,
  backends: { onnx: { wasm: { numThreads: 1, wasmPaths: undefined } } }
};
export async function pipeline(tarefa, modelo, opcoes){
  const o = opcoes || {};
  /* O caminho da placa falha, como falha na máquina de quem não tem WebGPU de
     verdade: é assim que a escada desce para o processador. */
  if (o.device === 'webgpu') throw new Error('no WebGPU adapter (falso)');
  const id = { tarefa, modelo, device: o.device || '?', dtype: JSON.stringify(o.dtype) };
  globalThis.__reg.montados.push(id);
  globalThis.__reg.vivos++;
  const p = async () => ({ text: '', chunks: [] });
  p.dispose = async () => {
    globalThis.__reg.soltos.push(id);
    globalThis.__reg.vivos--;
  };
  return p;
}
`;

const br = await chromium.launch({
  executablePath: CHROME_WS,
});
const ctx = await br.newContext({ viewport: { width: 1250, height: 980 } });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));
await pg.route('**/@huggingface/transformers**', r => r.fulfill({
  status: 200, headers: { 'content-type': 'text/javascript' }, body: BIBLIOTECA_FALSA }));
await pg.goto('http://localhost:8943/app.html?lang=pt');
await pg.selectOption('#modelo', 'evidencia').catch(() => {});
/* O modelo de voz, a placa e o "apagar o modelo" moram na gaveta de ajustes,
   que nasce fechada — é a parede de dezesseis controles que saiu da frente de
   quem só quer apertar um botão. Quem vem mexer no modelo abre a gaveta, e é
   isso que este arquivo faz, pelo mesmo botão da pessoa. */
await pg.locator('#ajustesBtn').click();
await pg.waitForTimeout(400);
await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForFunction(() => !document.getElementById('extract').disabled,
                         null, { timeout: 60000 });

const reg = () => pg.evaluate(() => JSON.parse(JSON.stringify(globalThis.__reg || {})));
const transcrever = async () => {
  await pg.locator('#auto').click();
  await pg.waitForFunction(() => !document.getElementById('auto').disabled,
                           null, { timeout: 120000 });
  await pg.waitForTimeout(300);
};

// ---------------------------------------------------------------------------
console.log('[1] a primeira transcrição monta UM modelo');
{
  await transcrever();
  const r = await reg();
  console.log('     montados: ' + r.montados.map(m => m.modelo + '/' + m.device).join(', '));
  ok('montou pelo menos um', r.montados.length >= 1, JSON.stringify(r.montados));
  ok('e há exatamente um vivo', r.vivos === 1, String(r.vivos));
  ok('sem erro de JavaScript', erros.length === 0, erros.join(' | ').slice(0, 200));
}

// ---------------------------------------------------------------------------
console.log('\n[2] transcrever de novo NÃO monta outro');
{
  const antes = (await reg()).montados.length;
  await transcrever();
  const r = await reg();
  ok('reusou o que já estava montado', r.montados.length === antes,
     antes + ' → ' + r.montados.length);
  ok('e continua um só vivo', r.vivos === 1, String(r.vivos));
}

// ---------------------------------------------------------------------------
console.log('\n[3] TROCAR DE MODELO solta o anterior');
{
  const opcoes = await pg.locator('#model option').evaluateAll(o => o.map(x => x.value));
  const atual = await pg.locator('#model').inputValue();
  const outro = opcoes.find(v => v && v !== atual);
  ok('há outro modelo para escolher', !!outro, opcoes.join(' '));
  await pg.selectOption('#model', outro);
  await pg.waitForTimeout(300);
  await transcrever();
  const r = await reg();
  console.log('     montados: ' + r.montados.map(m => m.modelo).join(', '));
  console.log('     soltos:   ' + r.soltos.map(m => m.modelo).join(', '));
  ok('montou o novo', r.montados.some(m => m.modelo.includes(outro.split('/').pop())),
     JSON.stringify(r.montados.map(m => m.modelo)));
  ok('soltou o antigo', r.soltos.length >= 1, JSON.stringify(r.soltos.map(m => m.modelo)));
  /* O NÚMERO QUE IMPORTA. Dois vivos significa dois modelos na memória da aba —
     que é o defeito, e ele não aparece em lugar nenhum da tela. */
  ok('e continua UM vivo, não dois', r.vivos === 1, String(r.vivos));
}

// ---------------------------------------------------------------------------
console.log('\n[4] a caixa da placa de vídeo deixou de ser enfeite');
{
  /* Antes: `pipeId !== modelId` era falso depois do primeiro modelo montado,
     então marcar ou desmarcar "usar a placa" não mudava nada até alguém trocar
     de modelo. A caixa existia e não fazia. */
  const temGpu = await pg.locator('#gpu').count() > 0;
  if (!temGpu) {
    console.log('     (esta máquina não expõe a caixa da placa — bloco pulado)');
  } else {
    await pg.evaluate(() => {
      const c = document.getElementById('gpu');
      c.closest('label').classList.remove('hide');
    });
    const antes = await reg();
    const marcada = await pg.locator('#gpu').isChecked();
    await pg.locator('#gpu').setChecked(!marcada);
    await pg.waitForTimeout(200);
    await transcrever();
    const r = await reg();
    ok('mudar a caixa refez o pipeline', r.montados.length > antes.montados.length,
       antes.montados.length + ' → ' + r.montados.length);
    ok('soltando o de antes', r.soltos.length > antes.soltos.length,
       antes.soltos.length + ' → ' + r.soltos.length);
    ok('e ainda um só vivo', r.vivos === 1, String(r.vivos));
    await pg.locator('#gpu').setChecked(marcada);
    await pg.waitForTimeout(200);
  }
}

// ---------------------------------------------------------------------------
console.log('\n[5] "apagar o modelo de voz" solta o que está carregado');
{
  /* O botão apagava o CACHE em disco e deixava o modelo na memória — dizendo,
     na tela, que tinha liberado. */
  await transcrever();
  const antes = await reg();
  ok('havia um modelo carregado', antes.vivos === 1, String(antes.vivos));
  await pg.locator('#limparModelo').click();
  await pg.waitForFunction(() => !document.getElementById('limparModelo').disabled,
                           null, { timeout: 30000 });
  await pg.waitForTimeout(400);
  const r = await reg();
  ok('e depois de apagar não sobrou nenhum na memória', r.vivos === 0, String(r.vivos));
  ok('sem erro de JavaScript', erros.length === 0, erros.join(' | ').slice(0, 200));
}

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nModelo de voz: tudo passou.');
process.exit(falhas ? 1 : 0);
