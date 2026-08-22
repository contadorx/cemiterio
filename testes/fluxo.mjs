/* O caminho do começo ao fim: nada convida para um clique que não pode dar em nada.
 *
 * O defeito que este teste tranca, e que existiu de verdade: com um vídeo
 * escolhido e nenhum quadro extraído, o passo 3 abria e onze botões ficavam
 * clicáveis. Clicar em qualquer um deles não fazia NADA — cada gerador começava
 * com um `return` mudo, antes até da linha que escreve "gerando…". A pessoa
 * clica, a tela não muda, ela clica de novo, e conclui que o programa quebrou.
 *
 * A regra que este arquivo defende, e que vale para qualquer botão novo:
 *
 *   1. um controle que não pode funcionar fica DESLIGADO, e a tela diz por quê
 *      e onde resolver — botão desligado sem explicação é beco sem saída;
 *   2. o clique que escapar mesmo assim (teclado, `force`) recebe RESPOSTA;
 *   3. nenhuma bolinha de "feito" fica verde por uma coisa que a pessoa não fez;
 *   4. nenhuma bolinha continua verde depois que o que ela afirmava sumiu.
 */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT = `${RAIZ_WS}/public`;
const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
            '.svg': 'image/svg+xml', '.webm': 'video/webm', '.mp4': 'video/mp4',
            '.jpg': 'image/jpeg', '.vtt': 'text/vtt', '.png': 'image/png' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise((r) => srv.listen(8975, r));

const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const ctx = await br.newContext({ acceptDownloads: true, viewport: { width: 1300, height: 1000 } });
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', (e) => erros.push(e.message));
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`, 'utf8');
await pg.route('**/jspdf**', (r) => r.fulfill({ status: 200, headers: { 'content-type': 'text/javascript' }, body: jspdf }));
await pg.route('**/rpc/**', (r) => r.fulfill({ status: 200, body: 'null' }));
await pg.goto('http://localhost:8975/app.html?lang=pt');
await pg.waitForTimeout(700);

/* Tudo o que produz arquivo. Se um botão novo entrar no passo 4 e não estiver
   nesta lista, o teste não o cobre — por isso a contagem abaixo é conferida
   contra o que existe na tela, e não só contra esta lista. */
const SAIDAS = ['go', 'docx', 'html', 'md', 'pptx', 'scorm', 'jira', 'capPacote', 'json', 'csv', 'zip', 'gdocs'];

const estados = () => pg.evaluate((ids) => {
  const vis = (el) => !!(el && el.offsetParent !== null && !el.closest('[inert]'));
  const r = {};
  for (const id of ids) {
    const el = document.getElementById(id);
    r[id] = !el ? 'ausente' : (!vis(el) ? 'escondido' : (el.disabled ? 'desligado' : 'clicavel'));
  }
  return r;
}, SAIDAS);

const bolinhas = () => pg.evaluate(() =>
  [...document.querySelectorAll('details.sub')].map((d) => (d.classList.contains('feito') ? '✓' : '·')).join(''));

console.log('[1] antes de ter quadro, nada convida ao clique');
await pg.selectOption('#modelo', 'evidencia');
/* SEM VÍDEO. Antes este bloco carregava um vídeo e afirmava sobre "vídeo
   carregado, zero quadros" — um estado em que a pessoa ficava parada até
   escolher entre três botões.

   As telas passaram a sair sozinhas quando o vídeo entra, e esse estado deixou
   de existir como lugar onde se espera: ele dura um segundo e meio. A afirmação
   que continua valendo, e vale mais, é sobre o começo de tudo — nada de saída
   convida ao clique antes de haver o que exportar. O bloco [1b] cobre o outro
   lado da mesma moeda: que elas abrem sozinhas depois. */
await pg.waitForTimeout(600);
{
  const e = await estados();
  const soltos = SAIDAS.filter((id) => e[id] === 'clicavel');
  ok('nenhum botão de saída está clicável com zero quadros', soltos.length === 0, soltos.join(' '));
  const st = (await pg.locator('#pdfStatus').textContent()).trim();
  ok('e a tela diz por quê', st.length > 20, st.slice(0, 70));
  ok('dizendo ONDE se resolve, não só que faltou',
     /passo 2|grave a tela/i.test(st), st.slice(0, 90));
  /* Toda a lista da tela, não só a que este arquivo conhece: um botão de SAÍDA
     novo que ninguém pensou em travar cai aqui.

     `#recTodos` fica de fora, e não por conveniência: ele não é uma saída, é o
     controle que REVELA a lista de saídas. Clicá-lo sem material não tenta
     gerar nada — abre uma gaveta em que todos os onze botões estão visivelmente
     desligados, que é a resposta honesta a "quais formatos existem?". Travá-lo
     junto seria esconder o cardápio de quem ainda está decidindo se vale a pena,
     e custaria o acesso às saídas em cinquenta réguas: `_navegador.mjs` abre a
     gaveta clicando nele, e botão desabilitado não responde a clique. */
  const naTela = await pg.locator('#sb4 button:not(.sbOk):not(#recTodos), #sb4 a.btn').evaluateAll(
    (bs) => bs.filter((b) => b.offsetParent !== null && !b.disabled).map((b) => b.id || b.textContent.trim()));
  ok('nem os que este teste não conhece', naTela.length === 0, naTela.join(' '));
}

console.log('\n[1b] com o vídeo, as telas saem sozinhas e as saídas abrem');
{
  await pg.setInputFiles('#file', '/tmp/amostra.webm');
  /* Nenhum clique entre o vídeo entrar e as telas existirem: é a mudança de
     fluxo inteira numa linha. */
  await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length > 0,
                           null, { timeout: 60000 });
  await pg.waitForFunction(() => !document.getElementById('extract').disabled,
                           null, { timeout: 60000 });
  await pg.waitForTimeout(400);
  const e = await estados();
  const presos = ['go', 'docx', 'zip'].filter((id) => e[id] !== 'clicavel');
  ok('as saídas abrem sem ninguém ter clicado em nada', presos.length === 0, presos.join(' '));
}

console.log('\n[2] o clique que escapa da trava recebe resposta');
{
  /* Volta ao estado sem quadro: é dele que este bloco fala. */
  await pg.evaluate(() => {
    document.querySelectorAll('#thumbs .toque').forEach(b => b.click());
  });
  await pg.waitForTimeout(300);
  /* `force` passa por cima do `disabled` visual do Playwright, e é o que
     acontece na vida com teclado, extensão ou um caminho não previsto. */
  await pg.evaluate(() => { document.getElementById('pdfStatus').textContent = ''; });
  await pg.evaluate(() => { const b = document.getElementById('go'); b.disabled = false; b.click(); });
  await pg.waitForTimeout(500);
  const st = (await pg.locator('#pdfStatus').textContent()).trim();
  ok('o gerador não volta calado', st.length > 20, st || '(nada)');
}

console.log('\n[3] com quadros, tudo abre e a tela diz o que fazer');
await pg.selectOption('#mode', 'count');
await pg.fill('#count', '4');
await pg.locator('#extract').click();
/* Espera a varredura ACABAR, e não "haver quatro miniaturas". Desde que a grade
   passou a encher enquanto a varredura corre, "já há quatro" acontece no meio
   do trabalho — e a linha de status ao lado, que este bloco lê logo abaixo,
   ainda estava contando outra coisa. */
await pg.waitForFunction(() => !document.getElementById('extract').disabled, null, { timeout: 60000 });
await pg.waitForTimeout(700);
{
  const e = await estados();
  const presos = ['go', 'docx', 'html', 'md', 'pptx', 'json', 'csv', 'zip'].filter((id) => e[id] !== 'clicavel');
  ok('os oito formatos de sempre ficam clicáveis', presos.length === 0, presos.join(' '));
  const st = (await pg.locator('#pdfStatus').textContent()).trim();
  /* DUAS FRASES VÁLIDAS, e qual delas aparece depende do relógio da máquina.
     A esperada é "4 quadros prontos — escolha um formato". Mas se a transcrição
     ainda estiver correndo, o aviso de que o documento sairia SEM A FALA ganha
     a linha — e ganha com razão: é a informação que muda a decisão de baixar
     agora. O `espera.mjs` cobra justamente que esse aviso apareça. Exigir só a
     primeira aqui era pôr as duas réguas para brigar, e quem perdia era a
     máquina lenta. O que este bloco afirma é que a linha CONVIDA em vez de
     ficar muda — e as duas convidam. */
  const contou = /4/.test(st);
  const avisou = /fala/i.test(st);
  ok('e a tela convida em vez de ficar muda', (contou || avisou) && st.length > 15,
     st.slice(0, 70));
  const dl = pg.waitForEvent('download', { timeout: 30000 });
  await pg.locator('#md').click();
  await dl;
  ok('e o formato escolhido realmente baixa', true);
}

console.log('\n[4] as bolinhas dizem a verdade');
{
  ok('a 1 acende com quadro', (await bolinhas())[0] === '✓', await bolinhas());
  ok('a 3 NÃO acende sem ninguém digitar nada', (await bolinhas())[2] === '·', await bolinhas());
  await pg.locator('#evBox').evaluate((e) => { e.open = true; });
  await pg.fill('#evCaso', 'CT-01');
  await pg.dispatchEvent('#evCaso', 'input');
  await pg.waitForTimeout(400);
  ok('e acende quando alguém digita', (await bolinhas())[2] === '✓', await bolinhas());
  ok('a 4 acende depois de baixar', (await bolinhas())[3] === '✓', await bolinhas());

  /* A bolinha 4 é a única guardada; guardada sem apagar vira mentira. */
  await pg.fill('#count', '2');
  await pg.locator('#extract').click();
  await pg.waitForTimeout(2500);
  ok('e APAGA quando os quadros são refeitos — o documento antigo não vale mais',
     (await bolinhas())[3] === '·', await bolinhas());
}

console.log('\n[5] o segundo clique também responde');
{
  await pg.waitForTimeout(400);
  const antes = await pg.locator('#movMsg').textContent();
  await pg.locator('#revisar').click();
  await pg.waitForTimeout(500);
  await pg.locator('#revisar').click();          // com a revisão já aberta
  await pg.waitForTimeout(500);
  const depois = await pg.locator('#movMsg').textContent();
  ok('clicar em "revisar" com a revisão aberta diz alguma coisa',
     depois.trim() !== '' && depois !== antes, depois.slice(0, 60));
}

ok('sem erro de JS no caminho inteiro', erros.length === 0, erros.join(' | ').slice(0, 180));
await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nFluxo do começo ao fim: tudo passou.');
process.exit(falhas ? 1 : 0);
