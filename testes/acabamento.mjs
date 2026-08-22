/* Três acabamentos que não são acabamento.
 *
 * 1. A BARRA QUE PENSAVA SOZINHA. Depois de a transcrição terminar, a barra
 *    listrada continuava andando na tela. Ela era escondida no fim do
 *    `bombearAsr`, mas dentro de um `if (emCauda)` — e o relógio da cauda, que
 *    roda a cada segundo, podia reaparecer com ela na fresta entre aquele
 *    esconder e o `emCauda = false`. Depois disso ninguém mais mexia nela.
 *    Uma barra que anda sem nada acontecer faz a pessoa esperar por nada.
 *
 * 2. O SUBPASSO QUE NUNCA FICAVA VERDE. O estado é calculado, e isso é certo —
 *    um "concluído" que deixa de ser verdade é pior que nenhum. Mas dois dos
 *    quatro subpassos podem estar legitimamente vazios: gravação sem fala,
 *    cenário sem identificação. Neles o cálculo respondia "não feito" para
 *    sempre, e apertar Pronto fechava o bloco com a bolinha cinza.
 *
 * 3. A REVISÃO QUE ACABAVA SOZINHA. Confirmava-se o último quadro e a caixa
 *    sumia. Do lado de cá é um fechamento; do lado de lá parece que deu errado.
 */
import { chromium } from './_navegador.mjs';
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
await new Promise(r => srv.listen(8953, r));

const br = await chromium.launch({
  executablePath: CHROME_WS,
  args: ['--autoplay-policy=no-user-gesture-required']
});
let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const ctx = await br.newContext({ viewport: { width: 1150, height: 980 } });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));
await pg.addInitScript(() => {
  function tela(){
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const g = c.getContext('2d'); let i = 0;
    setInterval(() => { i++; g.fillStyle = ['#123','#eee','#567','#fa0'][i%4]; g.fillRect(0,0,1280,720); }, 700);
    return c.captureStream(12);
  }
  navigator.mediaDevices.getDisplayMedia = async () => tela();
  navigator.mediaDevices.getUserMedia = async () => { throw new Error('sem mic'); };
});
await pg.goto('http://localhost:8953/app.html?lang=pt');
await pg.selectOption('#modelo', 'ia');
/* `tudo`: esta gravacao dura dois segundos e meio, e o que este teste prova
   depende de sair MAIS DE UM quadro dela. O padrao novo ("equilibrado") tem
   piso de 1,5 s entre quadros e espera a tela parar — certo para o produto, e
   incompativel com uma gravacao de dois segundos. */
await pg.selectOption('#ritmo', 'tudo');
await pg.waitForTimeout(500);

console.log('[1] a barra da cauda não fica pensando depois que acabou');
await pg.locator('#recTr').uncheck();
await pg.evaluate(() => window.__contagem(1));
await pg.locator('#rec').click();
await pg.waitForSelector('#recStop:visible', { timeout: 40000 });
await pg.waitForTimeout(2500);
await pg.locator('#recStop').click();
await pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null,
  null, { timeout: 60000 });
/* Três segundos DEPOIS de tudo terminar. O defeito não é a barra aparecer —
   é ela sobreviver ao fim do trabalho. */
await pg.waitForTimeout(3000);
{
  const est = await pg.evaluate(() => {
    const b = document.getElementById('caudaBar');
    const r = document.getElementById('recBarWrap');
    return { cauda: b.classList.contains('hide'), indef: b.classList.contains('indef'),
             rec: !r || r.classList.contains('hide'),
             visivel: b.offsetParent !== null };
  });
  ok('a barra da cauda está escondida', est.cauda, JSON.stringify(est));
  ok('e sem as listras andando', !est.indef);
  ok('não sobra nada na tela', !est.visivel);
  ok('a barra do modelo também sumiu', est.rec);
}

console.log('\n[2] apertar "Pronto" pinta o subpasso de verde');
{
  /* O subpasso 3 é a identificação. Neste cenário (genérico) não há nada para
     preencher, então o cálculo dizia "não feito" para sempre. */
  const antes = await pg.locator('#sb3').evaluate(e => e.classList.contains('feito'));
  ok('antes de apertar, ele não está verde', !antes);
  await pg.locator('.sbOk[data-sb="3"]').click();
  await pg.waitForTimeout(400);
  ok('depois de apertar, está', await pg.locator('#sb3').evaluate(e => e.classList.contains('feito')));

  /* E o subpasso 1 NÃO obedece à declaração: "zero quadros" não é um estado
     legítimo de passo concluído, é trabalho que falta. Declarar o contrário
     seria a bolinha mentindo — que é o defeito que o cálculo evitava. */
  const temQuadros = (await pg.locator('#thumbs figure').count()) > 0;
  ok('há quadros nesta gravação', temQuadros, String(await pg.locator('#thumbs figure').count()));
  ok('e por isso o subpasso 1 já está verde por cálculo',
     await pg.locator('#sb1').evaluate(e => e.classList.contains('feito')));
}

console.log('\n[3] o último quadro da revisão diz que é o último');
await pg.locator('#revisar').click();
await pg.waitForTimeout(700);
{
  const total = await pg.locator('#thumbs figure').count();
  ok('a revisão abriu', !(await pg.locator('#revBox').evaluate(e => e.classList.contains('hide'))));
  const pos1 = (await pg.locator('#revPos').textContent() || '').trim();
  ok('no primeiro, a posição não fala em último', !/último/i.test(pos1), pos1);
  const btn1 = (await pg.locator('#revIgual').textContent() || '').trim();
  ok('e o botão não fala em finalizar', !/finalizar/i.test(btn1), btn1);

  // andar até o último
  for (let i = 0; i < total - 1; i++) {
    await pg.locator('#revIgual').click();
    await pg.waitForTimeout(250);
  }
  const posN = (await pg.locator('#revPos').textContent() || '').trim();
  ok('no último, a posição avisa', /último/i.test(posN), posN);
  const btnN = (await pg.locator('#revIgual').textContent() || '').trim();
  ok('e o botão vira um finalizar', /finalizar/i.test(btnN), btnN);
  ok('e ele ganha destaque, porque é o gesto de terminar',
     await pg.locator('#revIgual').evaluate(e => e.classList.contains('destaque')));
  /* As outras duas saídas também terminam — e também dizem. */
  ok('descartar no último também diz que finaliza',
     /finalizar/i.test(await pg.locator('#revFora').textContent() || ''),
     await pg.locator('#revFora').textContent());

  await pg.locator('#revIgual').click();
  await pg.waitForTimeout(600);
  ok('e clicar fecha a revisão', await pg.locator('#revBox').evaluate(e => e.classList.contains('hide')));
  ok('com o resumo do que aconteceu',
     /concluída/i.test(await pg.locator('#movMsg').textContent() || ''),
     await pg.locator('#movMsg').textContent());
}

console.log('\n[4] o LinkedIn tem cara de LinkedIn');
{
  const fonte = fs.readFileSync(ROOT + '/app.html', 'utf8');
  ok('o botão leva o logo desenhado', /compLinkedin'\)\.innerHTML =[\s\S]{0,120}<svg/.test(fonte));
  ok('na cor da marca deles, e não na nossa', /fill="#0A66C2"/.test(fonte));
  /* Inline, e não `<img src>`: a ferramenta abre de file:// no pacote offline,
     e uma imagem externa não carregaria — um botão de compartilhar sem ícone é
     pior que um sem imagem nenhuma. */
  ok('e vai inline, para funcionar de file://',
     !/compLinkedin[\s\S]{0,200}<img /.test(fonte));
}

console.log('\n[5] nada disso quebrou o JS');
ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 170));

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nAcabamento: tudo passou.');
process.exit(falhas ? 1 : 0);
