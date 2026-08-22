/* A FAIXA QUE APARECIA E SUMIA SOZINHA.
 *
 * O relato: "a faixa avisando que a transcrição e demais pontos de espera estão
 * sendo realizados sumiu, aparece e some".
 *
 * A causa não estava na faixa. `ocupado` era um BOOLEANO, e isso bastava
 * enquanto houvesse um trabalho por vez — mas não há mais: a varredura dos
 * quadros corre JUNTO da transcrição de propósito (elas não disputam nada), e a
 * montagem do modelo começa junto da extração do áudio. O primeiro a terminar
 * apagava o estado do outro.
 *
 * Numa varredura de dez segundos ao lado de uma transcrição de quarenta
 * minutos, a faixa vivia dez segundos.
 *
 * E o estrago maior não é a faixa: é o `beforeunload`. Com `ocupado` falso, a
 * aba fecha SEM AVISAR no meio da transcrição — a única coisa nesta ferramenta
 * que não dá para refazer sem pagar o tempo de novo.
 *
 *   node testes/faixa.mjs      (usa a amostra do testes/plano.mjs)
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';

import { CHROME_WS } from './_caminhos.mjs';
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'public');
const CHROME = process.env.CHROME || CHROME_WS;
const VIDEO = '/tmp/reuniao.webm';
if (!fs.existsSync(VIDEO)) {
  console.log('  pulado  ' + VIDEO + ' não existe. Rode antes:  node testes/plano.mjs');
  process.exit(0);
}
const T = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png',
           '.svg':'image/svg+xml','.ico':'image/x-icon','.webmanifest':'application/json'};
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end(''); }
  const u = q.url.split('?')[0], f = path.join(RAIZ, u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'}); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(8969, r));

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

/* A janela do modelo é LENTA de propósito: a transcrição tem que sobreviver à
   varredura, senão a corrida que produz o defeito não acontece. */
const FAKE = `
export const env = { allowLocalModels:true, allowRemoteModels:true, backends:{ onnx:{ wasm:{} } } };
export async function pipeline(){
  await new Promise(r => setTimeout(r, 300));
  const f = async () => { await new Promise(r => setTimeout(r, 4000));
                          return { chunks: [{ timestamp:[0,2], text:'fala' }] }; };
  f.dispose = async () => {};
  return f;
}`;

const br = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
const pg = await br.newPage();
const erros = []; pg.on('pageerror', e => erros.push(e.message));
await pg.route('**/rpc/*stamp_*', r => r.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:'null'}));
await pg.route('**@huggingface/transformers**', r => r.fulfill({ status:200,
  headers:{'content-type':'text/javascript','access-control-allow-origin':'*'}, body: FAKE }));
await pg.goto('http://localhost:8969/app.html?lang=pt');
await pg.waitForTimeout(400);
await pg.selectOption('#modelo', 'evidencia').catch(() => {});
await pg.setInputFiles('#file', VIDEO);
await pg.waitForFunction(() => !document.getElementById('extract').disabled, null, { timeout: 60000 });

/* "Transcrever a fala" dispara a varredura JUNTO — é o desenho, e é ele que
   cria a corrida. */
await pg.click('#auto');

/* Amostra o estado ao longo do trabalho: quem está trabalhando, e se a faixa
   está na tela. */
const linha = [];
for (let i = 0; i < 120; i++) {
  const e = await pg.evaluate(() => ({
    quem: (window.__trabalhos ? window.__trabalhos() : []).slice().sort(),
    faixa: !document.getElementById('faixa').classList.contains('hide'),
    auto: document.getElementById('auto').disabled,
  }));
  linha.push(e);
  if (!e.auto && i > 4) break;
  await pg.waitForTimeout(500);
}

/* A janela que importa: a transcrição correndo. `#auto` desabilitado é o
   estado que ela mesma mantém, e ele não depende do `ocupado` que está sendo
   medido — usá-lo como referência é medir uma coisa com a outra. */
/* ---- E DEPOIS, ATÉ NÃO SOBRAR NINGUÉM ----

   O laço acima para quando a TRANSCRIÇÃO acaba. Numa máquina em que a
   varredura é a mais lenta das duas, ela ainda está correndo nessa hora — e a
   afirmação "no fim ninguém fica marcado" lia o fim do LAÇO como se fosse o
   fim do TRABALHO, e acusava de vazamento uma varredura que só estava
   trabalhando. Então o laço continua até os dois acabarem de verdade. */
for (let i = 0; i < 90; i++) {
  const e = await pg.evaluate(() => ({
    quem: (window.__trabalhos ? window.__trabalhos() : []).slice().sort(),
    faixa: !document.getElementById('faixa').classList.contains('hide'),
    auto: document.getElementById('auto').disabled,
  }));
  linha.push(e);
  if (e.quem.length === 0) break;
  await pg.waitForTimeout(500);
}

const correndo = linha.filter(x => x.auto);
const comAmbos = linha.filter(x => x.quem.length > 1);
/* A propriedade, vista dos DOIS LADOS: um trabalho que termina não pode apagar
   o estado do outro. Qual dos dois acaba primeiro depende da máquina, e não do
   produto — cobrar só um dos lados fazia o arquivo falhar dizendo "a corrida
   não aconteceu nesta máquina, o teste não afirma nada", que é uma régua
   avisando que não mediu e reprovando assim mesmo. */
const soATranscricao = linha.filter(x => x.quem.length === 1 && x.quem[0] === 'transcricao');
const soAVarredura   = linha.filter(x => x.quem.length === 1 && x.quem[0] === 'varredura');
const sozinho = soATranscricao.length + soAVarredura.length;
console.log('\n  amostras ................. ' + linha.length);
console.log('  transcrição correndo ..... ' + correndo.length);
console.log('  com os dois trabalhando .. ' + comAmbos.length);
console.log('  só a transcrição ......... ' + soATranscricao.length);
console.log('  só a varredura ........... ' + soAVarredura.length);

ok('os dois trabalhos correram ao mesmo tempo', comAmbos.length > 0,
   'nunca houve dois: ' + JSON.stringify(linha.map(x => x.quem).slice(0, 6)));
ok('um deles terminou antes, e o outro continuou marcado', sozinho > 0,
   'os dois começaram e acabaram no mesmo instante — nada a afirmar');

/* AS DUAS AFIRMAÇÕES QUE PEGAM O DEFEITO. Com o booleano de antes, o `false` da
   varredura apagava o estado da transcrição: `quem` ficava vazio e a faixa
   sumia, com a transcrição correndo do mesmo jeito. */
const orfas = correndo.filter(x => !x.quem.includes('transcricao'));
ok('a transcrição continua marcada como trabalhando o tempo todo', orfas.length === 0,
   orfas.length + ' de ' + correndo.length + ' amostras com a transcrição correndo e ninguém marcado');
const sumiu = correndo.filter(x => !x.faixa);
ok('e a faixa não some no meio do caminho', sumiu.length === 0,
   sumiu.length + ' de ' + correndo.length + ' amostras com a transcrição correndo e a faixa fora da tela');
ok('no fim, ninguém fica marcado como trabalhando',
   linha[linha.length-1].quem.length === 0, JSON.stringify(linha[linha.length-1].quem));
ok('sem erro de página', erros.length === 0, erros[0]);

await br.close(); srv.close();
console.log(falhas ? `\n  ${falhas} falha(s)` : '\n  tudo certo');
process.exit(falhas ? 1 : 0);
