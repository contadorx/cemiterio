/* Os passos 3 e 4 enquanto a captura ainda está acontecendo.
 *
 * Durante a gravação os quadros entram na lista um a um; durante a cauda a
 * transcrição ainda está sendo costurada às falas. Quem abre a revisão nessa
 * janela edita uma lista que muda debaixo dele — descarta um quadro e outro
 * toma o lugar, corrige uma fala que a próxima janela de áudio vai reescrever.
 * E a chance de alguém tentar é alta justamente porque a espera é chata.
 *
 * O que este arquivo cobra, e é a metade que faz a trava não virar armadilha:
 *   - travado NÃO é mudo. A tela tem que dizer o que se está esperando;
 *   - parar e pular continuam alcançáveis. Espera sem saída é pior do que a
 *     bagunça que a trava evita;
 *   - e no fim tudo destrava sozinho, sem precisar de um clique de ninguém.
 */
import { chromium } from 'playwright';
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
await new Promise(r => srv.listen(8908, r));

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
    setInterval(() => { i++; g.fillStyle = ['#123','#eee','#567','#fa0','#0af'][i%5]; g.fillRect(0,0,1280,720); }, 700);
    return c.captureStream(12);
  }
  navigator.mediaDevices.getDisplayMedia = async () => tela();
  navigator.mediaDevices.getUserMedia = async () => { throw new Error('sem mic'); };
});

const travado = (id) => pg.evaluate(
  (i) => document.getElementById(i).hasAttribute('inert'), id);
const dica = (id) => pg.evaluate((i) => {
  const el = document.getElementById(i);
  return el && !el.classList.contains('hide') ? el.textContent.trim() : '';
}, id);

await pg.goto('http://localhost:8908/app.html?lang=pt');
// o cenário de uso passou a ser obrigatório: sem ele o botão Gravar cobra a escolha
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.waitForTimeout(600);

console.log('[1] antes de qualquer coisa, 3 e 4 já estão travados — e dizendo por quê');
{
  ok('a revisão está travada', await travado('prevCard'));
  ok('o prompt também', await travado('promptCard'));
  ok('e a dica é a de "escolha um vídeo"', /etapa 2/.test(await dica('hintPrev')),
     (await dica('hintPrev')).slice(0, 70));
}

console.log('\n[2] gravando: continuam travados, e a dica muda de assunto');
await pg.locator('#recTr').uncheck();
await pg.evaluate(() => window.__contagem(1));
await pg.locator('#rec').click();
await pg.waitForSelector('#recStop:visible', { timeout: 40000 });
await pg.waitForTimeout(2500);
{
  ok('a revisão continua travada com a gravação rodando', await travado('prevCard'));
  ok('o prompt também', await travado('promptCard'));
  /* E o passo 2 junto. Durante a gravação ele não tem o que fazer: a
     transcrição está acontecendo sozinha, ao vivo, e a extração de quadros
     também. Mexer nos ajustes no meio disso muda o que já está correndo — e o
     cartão ficava lá, aberto pelo cabeçalho, convidando. */
  ok('e o passo 2 também, que estava aberto no meio da gravação',
     await travado('cardTr'));
  ok('fechado, e não só travado', await pg.evaluate(
     () => document.getElementById('cardTr').classList.contains('fechado')));
  const dTr = await dica('hintTr');
  ok('dizendo que é a gravação', /Gravando/.test(dTr), dTr.slice(0, 70));
  const d = await dica('hintPrev');
  ok('e a tela diz que é a gravação', /Gravando/.test(d), d.slice(0, 80));
  ok('dizendo também quando abre', /quando você parar/.test(d), d.slice(0, 90));

  /* A saída. Uma trava sem porta é o defeito, não a correção. */
  const parar = await pg.locator('#recStop').isEnabled();
  ok('parar continua clicável', parar);
  ok('e marcar também, que é o que se faz durante a gravação',
     await pg.locator('#recMark').isEnabled());
}

console.log('\n[3] parou: tudo destrava sozinho');
await pg.locator('#recStop').click();
await pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null,
  null, { timeout: 60000 });
await pg.waitForTimeout(1200);
{
  ok('a revisão abriu', !(await travado('prevCard')));
  ok('o prompt abriu', !(await travado('promptCard')));
  /* E o passo 2 volta: aí sim há trabalho — colar uma transcrição que não veio,
     corrigir uma sigla, traduzir. */
  ok('e o passo 2 voltou a valer', !(await travado('cardTr')));
  ok('e a dica sumiu, em vez de ficar dizendo para esperar', (await dica('hintPrev')) === '');
  ok('os quadros estão lá para editar',
     (await pg.locator('#thumbs figure').count()) > 0,
     String(await pg.locator('#thumbs figure').count()));
  ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 150));
}

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTrava dos passos 3 e 4: tudo passou.');
process.exit(falhas ? 1 : 0);
