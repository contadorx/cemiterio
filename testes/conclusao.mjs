/* O FIM DO TRABALHO — dito por escrito, uma vez.
 *
 * O download acontecia e a tela ficava igual: os mesmos botões, o mesmo cartão,
 * como se nada tivesse ocorrido. Quem terminou não tinha como saber que
 * terminou — e, pior, não tinha como saber o que AINDA não estava guardado.
 * Documento baixado e projeto guardado são coisas diferentes; quem baixa o PDF
 * acha que guardou tudo, fecha a aba, e perde a possibilidade de reabrir e
 * corrigir uma tela.
 *
 * E o prompt para IA era o "passo 4 de 4". A numeração dizia que entregar o
 * vídeo a uma máquina é um quarto da tarefa — para a maioria não é tarefa
 * nenhuma, e quem vinha gravar uma tela terminava olhando para um passo por
 * fazer.
 *
 * O que este arquivo cobra:
 *
 *   1. o painel só existe DEPOIS que um documento sai;
 *   2. ele nomeia o arquivo e conta o material;
 *   3. ele distingue documento baixado de projeto guardado, e diz o que
 *      acontece se a aba fechar;
 *   4. "baixar de novo" entrega o MESMO arquivo sem remontá-lo;
 *   5. guardar o projeto muda a linha do checklist, e não some com ela;
 *   6. o prompt não é mais um passo numerado.
 *
 *   node testes/conclusao.mjs
 */
import { chromium } from './_navegador.mjs';   // abre os painéis e a gaveta das saídas
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';

const html = fs.readFileSync(RAIZ_WS + '/public/app.html', 'utf8');
const jspdf = fs.readFileSync(RAIZ_WS + '/vendor/jspdf.umd.min.js', 'utf8');
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (u.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end(''); }
  r.writeHead(200, { 'Content-Type':'text/html' }); r.end(html);
});
await new Promise(r => srv.listen(8977, r));

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const br = await chromium.launch({ executablePath: CHROME_WS });
const ctx = await br.newContext({ viewport: { width: 1250, height: 980 }, acceptDownloads: true });
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', e => erros.push(e.message));
/* A medição não pode sair daqui para lugar nenhum — e serve de contador: o
   segundo download do MESMO arquivo não pode contar como documento novo. */
const medidos = [];
await pg.route('**/rpc/walkstamp_evento', r => {
  try { medidos.push(JSON.parse(r.request().postData() || '{}')); } catch (e) {}
  r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: 'null' });
});
await pg.route('**/jspdf**', r => r.fulfill({ status:200,
  headers:{'content-type':'text/javascript','access-control-allow-origin':'*'}, body:jspdf }));
await pg.goto('http://localhost:8977/app.html?lang=pt');
await pg.selectOption('#modelo', 'evidencia').catch(() => {});
await pg.waitForTimeout(400);

const painel = () => pg.evaluate(() => {
  const cx = document.getElementById('fimCx');
  const li = [...document.querySelectorAll('#fimLista li')]
    .map(l => ({ txt: l.textContent, sim: l.classList.contains('sim') }));
  return {
    visivel: !!cx && !cx.classList.contains('hide'),
    titulo: (document.getElementById('fimTit') || {}).textContent || '',
    arquivo: (document.getElementById('fimArq') || {}).textContent || '',
    resumo: (document.getElementById('fimResumo') || {}).textContent || '',
    linhas: li,
    deNovo: (document.getElementById('fimDeNovo') || {}).textContent || '',
  };
});

console.log('[1] antes de sair documento, não há conclusão nenhuma');
{
  const p = await painel();
  ok('o painel nasce escondido', p.visivel === false);
}

console.log('\n[2] o prompt não é mais um passo numerado');
{
  const nums = await pg.locator('.card h2 .step').allTextContents();
  console.log('     passos numerados: ' + nums.join(', '));
  ok('sobraram três passos', nums.length === 3, JSON.stringify(nums));
  ok('e nenhum deles é o 4', !nums.includes('4'), JSON.stringify(nums));
  /* O cartão não sumiu — só perdeu o número. Quem usa continua achando. */
  ok('o cartão do prompt continua na página', await pg.locator('#promptBox').count() === 1);
}

await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForFunction(() => !document.getElementById('extract').disabled, null, { timeout: 60000 });
await pg.locator('#extract').click();
await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length >= 3,
                         null, { timeout: 120000 });

console.log('\n[3] o documento sai, e a tela diz que acabou');
let nomeArquivo = '';
{
  const dl = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#docx').click();
  const d = await dl; await d.saveAs('/tmp/conc.docx');
  nomeArquivo = d.suggestedFilename();
  await pg.waitForTimeout(600);
  const p = await painel();
  console.log('     ' + p.titulo + '  |  ' + p.arquivo);
  console.log('     ' + p.resumo);
  ok('o painel apareceu', p.visivel === true);
  ok('e diz que está pronto', /pronto/i.test(p.titulo), p.titulo);
  /* O nome do arquivo é o que a pessoa vai procurar na pasta de downloads. */
  ok('nomeia o arquivo que saiu', p.arquivo === nomeArquivo,
     p.arquivo + ' vs ' + nomeArquivo);
  ok('e conta o material', /\d+ telas/.test(p.resumo), p.resumo);
}

console.log('\n[4] documento baixado NÃO é projeto guardado');
{
  const p = await painel();
  p.linhas.forEach(l => console.log('     ' + (l.sim ? '✓' : '•') + ' ' + l.txt));
  ok('são três linhas', p.linhas.length === 3, String(p.linhas.length));
  ok('o documento está marcado como baixado',
     p.linhas.some(l => l.sim && /documento baixado/i.test(l.txt)),
     JSON.stringify(p.linhas));
  /* A confusão que este painel existe para desfazer. */
  ok('e o projeto aparece como NÃO guardado',
     p.linhas.some(l => !l.sim && /ainda não guardado/i.test(l.txt)),
     JSON.stringify(p.linhas));
  ok('dizendo o que acontece ao fechar a aba',
     p.linhas.some(l => /reabrir/i.test(l.txt)), JSON.stringify(p.linhas));
  ok('e que o vídeo não saiu daqui',
     p.linhas.some(l => l.sim && /nunca saiu/i.test(l.txt)), JSON.stringify(p.linhas));
}

console.log('\n[5] baixar de novo entrega o mesmo arquivo, sem remontar');
{
  const antes = medidos.filter(m => m.p_nome === 'baixou_saida').length;
  const t0 = Date.now();
  const dl = pg.waitForEvent('download', { timeout: 30000 });
  await pg.locator('#fimDeNovo').click();
  const d = await dl;
  const gasto = Date.now() - t0;
  console.log('     ' + d.suggestedFilename() + '  em ' + gasto + ' ms');
  ok('é o mesmo arquivo', d.suggestedFilename() === nomeArquivo,
     d.suggestedFilename() + ' vs ' + nomeArquivo);
  /* Remontar um .docx com imagens leva segundos. Um blob guardado sai na hora —
     e é essa a diferença entre "baixar de novo" e "gerar de novo". */
  ok('sem remontar o documento', gasto < 1500, gasto + ' ms');
  await pg.waitForTimeout(400);
  const depois = medidos.filter(m => m.p_nome === 'baixou_saida').length;
  /* O segundo clique não é um segundo documento produzido: contá-lo estragaria
     o número que decide o roadmap. */
  ok('e não conta como documento novo', depois === antes, antes + ' → ' + depois);
}

console.log('\n[6] guardar o projeto muda a linha, e o painel continua lá');
{
  const dl = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#fimProjeto').click();
  const d = await dl; await d.saveAs('/tmp/conc.json');
  await pg.waitForTimeout(700);
  const p = await painel();
  p.linhas.forEach(l => console.log('     ' + (l.sim ? '✓' : '•') + ' ' + l.txt));
  ok('saiu um .json', /\.json$/.test(d.suggestedFilename()), d.suggestedFilename());
  ok('a linha do projeto virou guardado',
     p.linhas.some(l => l.sim && /projeto guardado/i.test(l.txt)),
     JSON.stringify(p.linhas));
  /* O projeto NÃO é documento: anunciar "documento pronto" ao guardá-lo faria
     a pessoa achar que já tem o que entregar. O painel continua nomeando o
     documento que saiu, e não o .json. */
  ok('e o painel continua nomeando o DOCUMENTO', p.arquivo === nomeArquivo,
     p.arquivo);
  ok('o painel continua visível', p.visivel === true);
}

ok('sem erro de página', erros.length === 0, erros[0]);
await br.close(); srv.close();
console.log(falhas ? `\n  ${falhas} falha(s)` : '\n  tudo certo');
process.exit(falhas ? 1 : 0);
