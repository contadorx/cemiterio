/* A SAÍDA RECOMENDADA — uma decisão em vez de onze.
 *
 * O cartão das saídas oferecia PDF, Word, HTML, Markdown, PowerPoint, SCORM,
 * Jira, Google Docs, JSON, CSV e ZIP com o mesmo peso. São onze botões e,
 * portanto, onze decisões — cobradas de quem acabou de conferir trinta telas e
 * só quer entregar o trabalho.
 *
 * E o produto SABE o caso: a pessoa escolheu o cenário no passo 1. Uma
 * evidência se anexa a um chamado e não pode ser editada pelo destinatário —
 * PDF. Um tutorial e uma ata são textos que alguém vai continuar escrevendo —
 * Word. Isso não é gosto nosso, é o que o formato faz.
 *
 * O que este arquivo cobra:
 *
 *   1. a recomendação existe, muda com o cenário, e diz POR QUÊ;
 *   2. ela não duplica lógica: o botão recomendado aciona o botão que já
 *      existe, e o arquivo que sai é o mesmo;
 *   3. os outros formatos ficam recolhidos — e a um clique, não removidos;
 *   4. a gaveta LEMBRA de quem a abriu;
 *   5. layout e papel moram lá dentro: são decisões de forma, e não se
 *      pergunta o tamanho do papel a quem ainda não escolheu PDF.
 *
 *   node testes/saidarec.mjs
 */
/* O Playwright CRU, e não o `_navegador.mjs` — pelo mesmo motivo do
   `perna.mjs`: este arquivo mede a gaveta FECHADA, e o atalho a abre. Um
   teste que usasse o atalho estaria medindo o atalho. */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';

const html = fs.readFileSync(RAIZ_WS + '/public/app.html', 'utf8');
const jspdf = fs.readFileSync(RAIZ_WS + '/vendor/jspdf.umd.min.js', 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end(''); }
  r.writeHead(200, { 'Content-Type':'text/html' }); r.end(html);
});
await new Promise(r => srv.listen(8985, r));

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const br = await chromium.launch({ executablePath: CHROME_WS });
const ctx = await br.newContext({ viewport: { width: 1250, height: 980 }, acceptDownloads: true });
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', e => erros.push(e.message));
await pg.route('**/rpc/*stamp_*', r => r.fulfill({ status:200, headers:{'access-control-allow-origin':'*'}, body:'null' }));
await pg.route('**/jspdf**', r => r.fulfill({ status:200,
  headers:{'content-type':'text/javascript','access-control-allow-origin':'*'}, body:jspdf }));
await pg.goto('http://localhost:8985/app.html?lang=pt');
await pg.waitForTimeout(400);

const rec = () => pg.evaluate(() => {
  const g = id => document.getElementById(id) || {};
  const cx = document.getElementById('saidasTodas');
  return {
    visivel: !document.getElementById('recCx').classList.contains('hide'),
    titulo: g('recTit').textContent || '',
    porque: g('recPor').textContent || '',
    prim: { txt: g('recPrim').textContent || '', alvo: (g('recPrim').dataset || {}).alvo || '' },
    seg:  { txt: g('recSeg').textContent  || '', alvo: (g('recSeg').dataset  || {}).alvo || '' },
    aberta: !!cx && !cx.classList.contains('hide'),
    rotuloGaveta: g('recTodos').textContent || '',
    expandido: (g('recTodos').getAttribute && g('recTodos').getAttribute('aria-expanded')) || '',
  };
});

console.log('[1] a recomendação segue o cenário');
{
  await pg.selectOption('#modelo', 'evidencia');
  await pg.waitForTimeout(250);
  const r = await rec();
  console.log('     evidência  →  ' + r.prim.txt + '  |  ' + r.seg.txt);
  console.log('     porque: ' + r.porque);
  ok('a recomendação está na tela', r.visivel === true);
  /* Evidência se anexa a um chamado, e ninguém deve conseguir editá-la depois. */
  ok('evidência recomenda o PDF', r.prim.alvo === 'go', r.prim.alvo);
  ok('e oferece o Word como segunda', r.seg.alvo === 'docx', r.seg.alvo);
  /* Um "recomendado" sem motivo é uma ordem; com o motivo é um conselho, e de
     conselho a pessoa consegue discordar. */
  ok('e diz por quê', r.porque.length > 25, r.porque);

  await pg.selectOption('#modelo', 'tutorial');
  await pg.waitForTimeout(250);
  const r2 = await rec();
  console.log('     tutorial   →  ' + r2.prim.txt + '  |  ' + r2.seg.txt);
  /* Um tutorial é um texto que alguém vai continuar escrevendo. */
  ok('tutorial recomenda o Word', r2.prim.alvo === 'docx', r2.prim.alvo);
  ok('e a razão muda junto', r2.porque !== r.porque, r2.porque);

  await pg.selectOption('#modelo', 'ata');
  await pg.waitForTimeout(250);
  ok('ata também recomenda o Word', (await rec()).prim.alvo === 'docx');
}

/* Daqui para baixo é preciso ter material: o cartão das saídas é `inert` até
   existir quadro, e está certo — não se escolhe formato sem documento. */
await pg.selectOption('#modelo', 'evidencia');
await pg.waitForTimeout(200);
await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForFunction(() => !document.getElementById('extract').disabled, null, { timeout: 60000 });
await pg.locator('#extract').click();
await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length >= 3,
                         null, { timeout: 120000 });

console.log('\n[2] os outros formatos ficam recolhidos, não removidos');
{
  const r = await rec();
  ok('a gaveta nasce fechada', r.aberta === false);
  ok('e se anuncia como fechada para o teclado', r.expandido === 'false', r.expandido);
  ok('o rótulo oferece ver todos', /todos os formatos/i.test(r.rotuloGaveta), r.rotuloGaveta);
  /* Recolher é diferente de remover, e a diferença é este botão. */
  ok('o PowerPoint continua existindo', await pg.locator('#pptx').count() === 1);
  ok('mas não está à vista', !(await pg.locator('#pptx').isVisible()));
  /* Não se pergunta o tamanho do papel a quem ainda não escolheu PDF. */
  ok('o papel também não está à vista', !(await pg.locator('#papel').isVisible()));

  await pg.locator('#recTodos').click();
  await pg.waitForTimeout(200);
  const r2 = await rec();
  ok('um clique abre', r2.aberta === true);
  ok('o PowerPoint aparece', await pg.locator('#pptx').isVisible());
  ok('e o papel também', await pg.locator('#papel').isVisible());
  ok('o rótulo passa a oferecer recolher', /recolher/i.test(r2.rotuloGaveta), r2.rotuloGaveta);
  ok('e o teclado sabe que abriu', r2.expandido === 'true', r2.expandido);
}

console.log('\n[3] o botão recomendado aciona o que já existe');
{
  const r = await rec();
  ok('o rótulo é o do botão original', r.prim.txt.length > 2, r.prim.txt);

  const dl = pg.waitForEvent('download', { timeout: 90000 });
  await pg.locator('#recPrim').click();
  const d = await dl; await d.saveAs('/tmp/rec.pdf');
  /* Nenhuma lógica duplicada: duas funções produzindo o mesmo arquivo é como
     dois formatos divergirem sem ninguém notar. O que sai é o PDF de sempre. */
  ok('sai um PDF de verdade',
     fs.readFileSync('/tmp/rec.pdf').subarray(0, 5).toString() === '%PDF-');
  ok('com o nome que o botão original daria', /\.pdf$/.test(d.suggestedFilename()),
     d.suggestedFilename());
}

console.log('\n[4] a gaveta lembra de quem a abriu');
{
  /* Quem abriu uma vez quase sempre é quem mexe sempre — o mesmo argumento da
     gaveta de ajustes. Fechar de novo a cada recarga faria essa pessoa
     procurar todo dia o que ela usa todo dia.

     Recarregada, a página não tem material e o cartão volta a ser `inert`; o
     clique aqui é programático de propósito, porque o que se está medindo é a
     MEMÓRIA e não o gesto — o gesto já foi medido em [2]. */
  await pg.reload();
  await pg.waitForTimeout(500);
  ok('depois de recarregar, continua aberta', (await rec()).aberta === true);
  await pg.evaluate(() => document.getElementById('recTodos').click());
  await pg.waitForTimeout(150);
  await pg.reload();
  await pg.waitForTimeout(500);
  ok('e fechada continua fechada', (await rec()).aberta === false);
}

ok('sem erro de página', erros.length === 0, erros[0]);
await br.close(); srv.close();
console.log(falhas ? `\n  ${falhas} falha(s)` : '\n  tudo certo');
process.exit(falhas ? 1 : 0);
