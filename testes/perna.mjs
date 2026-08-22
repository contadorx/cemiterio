/* A PERNA CURTA — a etapa de conferir abre curta, e não com tudo aberto.
 *
 * Os quatro painéis do passo 3 nasciam ABERTOS. A etapa que se chama "conferir"
 * abria com a grade, os sete botões de lote, a transcrição inteira num campo de
 * texto, o vocabulário, as hesitações, a tradução e os campos de identificação
 * — sete blocos para rolar antes de conferir qualquer coisa.
 *
 * Agora dois deles nascem RECOLHIDOS: a fala, que é estado do material e não
 * tarefa, e a identificação, que num cenário genérico não tem o que preencher.
 * Recolhido não é escondido: a linha do título diz o que tem dentro — "118
 * trechos", "3 campos preenchidos" — antes de a pessoa decidir entrar.
 *
 * ESTE ARQUIVO IMPORTA O PLAYWRIGHT DIRETO, de propósito. Os outros cinquenta
 * importam de `_navegador.mjs`, que abre os painéis para conseguir dirigir os
 * controles que moram lá dentro. Se este também importasse de lá, o atalho
 * apagaria a única régua do próprio atalho — e o estado que a pessoa vê ao
 * abrir a página não teria ninguém olhando por ele.
 *
 * O que este arquivo cobra:
 *
 *   1. a fala e a identificação nascem recolhidas; a grade e o gerar, não;
 *   2. o que está dentro delas continua EXISTINDO e alcançável num clique;
 *   3. a linha do título conta o que há dentro, para a decisão de abrir ser
 *      informada;
 *   4. e a etapa encolheu de verdade — medido em pixels, não em opinião.
 *
 *   node testes/perna.mjs
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
await new Promise(r => srv.listen(8959, r));

let falhas = 0;
const ok = (n, c, e) => {
  console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : ''));
  if (!c) falhas++;
};

const br = await chromium.launch({ executablePath: CHROME_WS });
const ctx = await br.newContext({ viewport: { width: 1250, height: 980 } });
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', e => erros.push(e.message));
await pg.goto('http://localhost:8959/app.html?lang=pt');
await pg.selectOption('#modelo', 'evidencia').catch(() => {});
await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length >= 3,
                         null, { timeout: 90000 });
await pg.waitForTimeout(900);

const paineis = () => pg.evaluate(() => [1, 2, 3, 4].map((n) => {
  const d = document.getElementById('sb' + n);
  return { n, aberto: !!(d && d.open),
           estado: ((document.getElementById('sbEst' + n) || {}).textContent || '').trim() };
}));

console.log('[1] a etapa abre curta');
{
  const p = await paineis();
  p.forEach(x => console.log('     sb' + x.n + '  ' + (x.aberto ? 'aberto  ' : 'recolhido') +
                             '   "' + x.estado + '"'));
  /* A grade é o trabalho desta etapa: ela abre. */
  ok('a grade abre', p[0].aberto === true);
  /* A fala é ESTADO do material, e quase sempre está certa. */
  ok('a fala nasce recolhida', p[1].aberto === false);
  /* Num cenário genérico não há o que preencher — e um bloco aberto e vazio é
     uma pendência que não existe. */
  ok('a identificação nasce recolhida', p[2].aberto === false);
  /* Gerar é a saída da etapa: ela não se esconde. */
  ok('e o gerar continua aberto', p[3].aberto === true);
}

console.log('\n[2] recolhido não é escondido: a linha do título conta o que há dentro');
{
  const p = await paineis();
  /* Sem isto, decidir se vale abrir exigiria abrir — que é o clique que
     recolher existe para poupar. */
  ok('a fala diz o que tem dentro', p[1].estado.length > 0, p[1].estado);
  ok('a identificação também', p[2].estado.length > 0, p[2].estado);
}

console.log('\n[3] o que está dentro continua alcançável, a um clique');
{
  /* Esconder complexidade, nunca esconder capacidade. */
  const antes = await pg.locator('#tr').isVisible();
  ok('a transcrição começa fora da vista', antes === false);
  await pg.locator('#sb2 > summary').click();
  await pg.waitForTimeout(300);
  ok('um clique no título a traz', await pg.locator('#tr').isVisible() === true);
  await pg.locator('#sb3 > summary').click();
  await pg.waitForTimeout(300);
  ok('e o mesmo vale para a identificação',
     await pg.locator('#evBox').isVisible() === true);
  /* E ela continua servindo: recolher não pode ter deixado o campo inerte. */
  await pg.fill('#tr', 'WEBVTT\n\n00:00:00.000 --> 00:00:04.000\nabri o portal');
  await pg.waitForTimeout(400);
  ok('e o campo continua funcionando',
     (await pg.locator('#tr').inputValue()).includes('abri o portal'));
}

console.log('\n[4] a perna encolheu — em pixels');
{
  const medir = () => pg.evaluate(() => {
    const c = document.getElementById('prevCard');
    return Math.round(c.getBoundingClientRect().height);
  });
  await pg.evaluate(() => { document.getElementById('sb2').open = false;
                            document.getElementById('sb3').open = false; });
  await pg.waitForTimeout(300);
  const curta = await medir();
  await pg.evaluate(() => { document.getElementById('sb2').open = true;
                            document.getElementById('sb3').open = true; });
  await pg.waitForTimeout(300);
  const longa = await medir();
  console.log('     recolhida: ' + curta + ' px   aberta: ' + longa + ' px   ' +
              '(' + Math.round((1 - curta / longa) * 100) + '% menor)');
  /* O NÚMERO QUE IMPORTA. Sem ele, "a etapa ficou mais curta" é opinião — e o
     dia em que alguém devolver um painel para aberto por engano, ninguém
     percebe. */
  ok('a etapa recolhida é bem menor que a aberta', curta < longa * 0.8,
     curta + ' px vs ' + longa + ' px');
}

console.log('\n[5] o atalho da régua abre painéis, e mais nada');
{
  /* `_navegador.mjs` existe para os outros cinquenta arquivos conseguirem
     dirigir o que mora dentro dos painéis. Ele não pode virar um jeito de a
     régua ver uma tela que a pessoa não vê — então ele abre `details.sub`, e o
     resto da página tem de sair idêntico. */
  const { chromium: comAtalho } = await import('./_navegador.mjs');
  const br2 = await comAtalho.launch({ executablePath: CHROME_WS });
  const pg2 = await br2.newPage({ viewport: { width: 1250, height: 980 } });
  await pg2.goto('http://localhost:8959/app.html?lang=pt');
  await pg2.waitForTimeout(700);
  const comEle = await pg2.evaluate(() => ({
    abertos: [1, 2, 3, 4].map(n => !!document.getElementById('sb' + n).open),
    cenario: document.getElementById('modelo').value,
    telas: document.querySelectorAll('#thumbs figure').length,
    resumo: document.getElementById('resumoRev').classList.contains('hide'),
  }));
  console.log('     com o atalho: ' + JSON.stringify(comEle));
  ok('ele abre os quatro painéis', comEle.abertos.every(Boolean));
  /* E não mexe em mais nada: cenário por escolher, sem telas, resumo escondido
     — exatamente o que uma página recém-aberta mostra. */
  ok('e não toca em estado nenhum',
     comEle.cenario === '' && comEle.telas === 0 && comEle.resumo === true,
     JSON.stringify(comEle));
  await br2.close();
}

console.log(erros.length ? '\nerros de JS: ' + erros.join(' | ') : '\nsem erro de JS');
if (erros.length) falhas++;
await br.close(); srv.close();
console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTodas as verificações passaram.');
process.exit(falhas ? 1 : 0);
