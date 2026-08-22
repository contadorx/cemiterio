/* A ANOTAÇÃO DO PASSO — depois da gravação, e não durante.
 *
 * O QUE MUDOU, E POR QUÊ. Existia uma caixa de comentário AO VIVO, no cartão e
 * na janelinha, que dizia "o que aconteceu aqui" e comentava a última marcação.
 * O relato de uso foi direto: confusa, e não ajuda.
 *
 * O motivo é o mesmo que separou os dois botões de captura: quem grava está
 * olhando para o sistema que testa, não para nós. Escrever às cegas, num campo
 * de uma linha, sobre uma imagem que não se está vendo, é a pior hora possível
 * para descrever qualquer coisa — e com dois botões de captura, "sobre qual
 * tela eu estou escrevendo" virou uma pergunta a mais no pior momento.
 *
 * O QUE ESTE ARQUIVO CONTINUA COBRANDO é o que sempre importou e não mudou de
 * lugar: a anotação escrita CHEGA ao documento entregue. Uma anotação que
 * aparece na revisão e some no arquivo é pior do que anotação nenhuma — a
 * pessoa acredita que documentou.
 *
 * E cobra a saída da caixa: que ela não existe mais em lugar nenhum, nem no
 * cartão nem na janelinha. Uma remoção pela metade deixaria um campo órfão
 * escrevendo num quadro que ninguém mais aponta.
 */
import { chromium } from './_navegador.mjs';   // abre os painéis e a gaveta das saídas
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
await new Promise(r => srv.listen(8907, r));

const br = await chromium.launch({
  executablePath: CHROME_WS,
  args: ['--autoplay-policy=no-user-gesture-required']
});
let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const ctx = await br.newContext({ viewport: { width: 1100, height: 950 } });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));

await pg.addInitScript(() => {
  function tela(){
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const g = c.getContext('2d'); let i = 0;
    setInterval(() => { i++; g.fillStyle = ['#123','#eee','#567','#fa0','#0af'][i%5]; g.fillRect(0,0,1280,720); }, 800);
    return c.captureStream(12);
  }
  navigator.mediaDevices.getDisplayMedia = async () => tela();
  navigator.mediaDevices.getUserMedia = async () => { throw new Error('sem mic'); };
});

await pg.goto('http://localhost:8907/app.html?lang=pt');
// o cenário de uso passou a ser obrigatório: sem ele o botão Gravar cobra a escolha
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.waitForTimeout(500);

console.log('[1] a caixa de comentário ao vivo não existe mais');
{
  /* Pelo DOCUMENTO, e não por uma variável: o que a pessoa encontra na tela é
     o que existe, e um campo escondido continua sendo um campo. */
  ok('não há campo de comentário no cartão de gravar',
     (await pg.locator('#recNota').count()) === 0 &&
     (await pg.locator('#recNotaCx').count()) === 0);
  const fonte = fs.readFileSync(ROOT + '/app.html', 'utf8');
  ok('nem a caixa da janelinha ficou para trás', !/id="pipNota"/.test(fonte));
  ok('nem as frases dela', !/recNotaPh|recNotaEsp|recNotaEm/.test(fonte));
}

console.log('\n[2] gravando com os dois botões de captura');
/* Sem transcrever e sem contagem: o que este arquivo prova é a anotação, e
   baixar um modelo de voz de 249 MB para isso seria trocar um teste por uma
   espera. */
await pg.locator('#recTr').uncheck();
await pg.evaluate(() => window.__contagem(1));
await pg.locator('#rec').click();
await pg.waitForSelector('#recStop:visible', { timeout: 40000 });
await pg.waitForTimeout(2500);

const janela = () => ctx.pages().find(p => p !== pg) || null;
const jn = janela();
{
  ok('a janelinha abriu', !!jn);
  /* OS DOIS BOTÕES TÊM QUE ESTAR NA JANELINHA, e isto não é simetria: quem
     grava está dentro do sistema que testa. Clicar na página significa
     alt-tab — e o alt-tab muda a tela que ela ia capturar. */
  ok('e ela tem os dois botões de captura',
     (await jn.locator('#marcar').count()) === 1 && (await jn.locator('#maisTela').count()) === 1);
  ok('o "mais uma tela" não repete o "+" no rótulo',
     !/^\s*\+/.test(await jn.locator('#maisTela').textContent()),
     (await jn.locator('#maisTela').textContent()).slice(0, 40));
}

console.log('\n[3] apertar um botão destaca ELE, e não o outro');
{
  /* O DEFEITO EXATO, relatado no uso: apertar "mais uma tela" acendia o
     "marcar", e quem apertou concluía que tinha clicado errado. Um retorno
     visual que mente sobre o próprio gesto é pior do que retorno nenhum. */
  await jn.locator('#marcar').click();
  await pg.waitForTimeout(700);
  ok('marcar acende o marcar',
     await jn.locator('#marcar').evaluate(e => e.classList.contains('piscou')));
  ok('e não o de mais uma tela',
     !(await jn.locator('#maisTela').evaluate(e => e.classList.contains('piscou'))));

  await pg.waitForTimeout(2600);   // o destaque tem prazo; esperar é parte da regra
  await jn.locator('#maisTela').click();
  await pg.waitForTimeout(700);
  ok('mais uma tela acende o de mais uma tela',
     await jn.locator('#maisTela').evaluate(e => e.classList.contains('piscou')));
  ok('e NÃO o marcar',
     !(await jn.locator('#marcar').evaluate(e => e.classList.contains('piscou'))));
}

console.log('\n[4] a segunda captura entrou no MESMO passo');
await pg.waitForTimeout(2400);
await jn.locator('#marcar').click();          // um passo novo, para haver dois
await pg.waitForTimeout(1500);
await pg.locator('#recStop').click();
await pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null,
                         null, { timeout: 60000 });
await pg.waitForTimeout(1800);
{
  const marcados = await pg.evaluate(() => (window.__quadros() || []).filter(q => q.manual).length);
  const juntos = await pg.evaluate(() => (window.__quadros() || []).filter(q => q.junto).length);
  console.log('      marcados: ' + marcados + '   dos quais grudados no passo anterior: ' + juntos);
  ok('houve três capturas à mão', marcados >= 3, String(marcados));
  ok('e uma delas grudou no passo anterior', juntos === 1, String(juntos));
}

console.log('\n[5] a anotação é escrita na revisão, com a imagem na frente');
{
  const campos = pg.locator('#thumbs figure input.nota');
  const n = await campos.count();
  ok('há um campo de anotação por miniatura', n > 0, String(n));
  await campos.first().fill('o total veio errado aqui');
  await pg.waitForTimeout(250);
  await campos.nth(n - 1).fill('e aqui a tela travou');
  await pg.waitForTimeout(400);
  ok('o que se digita fica no QUADRO, não no campo',
     await pg.evaluate(() => {
       const q = window.__quadros() || [];
       return (q[0].nota === 'o total veio errado aqui') &&
              (q[q.length - 1].nota === 'e aqui a tela travou');
     }));
}

console.log('\n[6] o documento leva a anotação junto');
{
  /* A prova que importa, e a única que não mudou de dono. Por isso o documento
     é GERADO e lido, e não inspecionado por dentro. */
  const dl = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#html').click();
  const d = await dl; await d.saveAs('/tmp/comentario-saida.html');
  const doc = fs.readFileSync('/tmp/comentario-saida.html', 'utf8');
  ok('o documento cita a primeira anotação', doc.includes('o total veio errado aqui'));
  ok('e a última', doc.includes('e aqui a tela travou'));
  ok('sem erro de JS em nada disso', erros.length === 0, erros.join(' | ').slice(0, 160));
}

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nAnotação do passo: tudo passou.');
process.exit(falhas ? 1 : 0);
