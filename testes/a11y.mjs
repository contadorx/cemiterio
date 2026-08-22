/* Teclado e i18n na revisão de frames — os dois bloqueadores que a auditoria achou. */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT=`${RAIZ_WS}/public`;
const T={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png','.webm':'video/webm','.vtt':'text/vtt','.jpg':'image/jpeg','.mp4':'video/mp4'};
const srv=http.createServer((q,r)=>{
  if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')}
  const u=decodeURIComponent(q.url.split('?')[0]); let f=path.join(ROOT,u==='/'?'index.html':u);
  if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
  if(!fs.existsSync(f)){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});r.end(fs.readFileSync(f));
});
await new Promise(r=>srv.listen(8891,r));
const br=await chromium.launch({executablePath:CHROME_WS});
let falhas=0; const ok=(n,c,e)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e?'  → '+e:''));if(!c)falhas++};

for (const [lang, esperado] of [['pt','descartado'], ['en','discarded'], ['es','descartado']]) {
  console.log('\n[' + lang + ']');
  const ctx=await br.newContext(); const pg=await ctx.newPage();
  const erros=[]; pg.on('pageerror',e=>erros.push(e.message));
  await pg.route('**/rpc/*stamp_*', r=>r.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:'null'}));
  await pg.goto(`http://localhost:8891/app.html?lang=${lang}`);
  // o cenário de uso passou a ser obrigatório: sem ele o Gravar e o envio de vídeo cobram a escolha
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  await pg.waitForTimeout(400);

  // a zona de arraste é alcançável e acionável por teclado
  const drop = pg.locator('#drop');
  ok('zona de arraste tem papel de botão', await drop.getAttribute('role') === 'button');
  ok('e entra na ordem de foco', await drop.getAttribute('tabindex') === '0');
  await drop.focus();
  ok('recebe foco de verdade', await pg.evaluate(() => document.activeElement.id) === 'drop');
  /* Esperar o evento de seletor de arquivo é intrinsecamente instável — ele
     depende de o navegador abrir uma janela nativa. O que interessa afirmar é
     outra coisa, e é determinística: a tecla aciona o <input type=file>. */
  await pg.evaluate(() => {
    window.__cliques = 0;
    const f = document.getElementById('file');
    f.click = () => { window.__cliques++; };
  });
  await drop.focus();
  await pg.keyboard.press('Enter');
  await pg.waitForTimeout(120);
  const porEnter = await pg.evaluate(()=>window.__cliques);
  await pg.keyboard.press(' ');
  await pg.waitForTimeout(120);
  const porEspaco = await pg.evaluate(()=>window.__cliques);
  ok('Enter aciona o seletor de arquivo (antes era impossível sem mouse)', porEnter === 1, porEnter);
  ok('barra de espaço também', porEspaco === 2, porEspaco);

  // revisão: miniaturas focáveis, alternáveis por teclado, e com rótulo traduzido
  await pg.setInputFiles('#file', '/tmp/cinco.webm');
  await pg.waitForFunction(()=>!document.getElementById('extract').disabled,null,{timeout:20000});
  await pg.click('#extract');
  await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>1,null,{timeout:60000});
  await pg.waitForTimeout(300);

  /* A miniatura deixou de ser um <figure role=button>: agora é um <button> de
     verdade com o campo de anotação ao lado. Um input dentro de role=button
     seria controle dentro de controle, e o leitor de tela engoliria um dos
     dois — daí a mudança. O teste passou a olhar o botão. */
  const fig = pg.locator('#thumbs figure').first();
  const toque = fig.locator('button.toque');
  ok('miniatura tem botão de verdade', await toque.count() === 1);
  ok('miniatura é focável', await toque.evaluate(el => el.tagName) === 'BUTTON');
  const antes = await pg.locator('#thumbs figure.off').count();
  await toque.focus();
  await pg.keyboard.press('Enter');
  await pg.waitForTimeout(150);
  const depois = await pg.locator('#thumbs figure.off').count();
  ok('Enter descarta o frame', depois === antes + 1, `${antes} → ${depois}`);
  ok('e o estado é anunciado',
     await pg.locator('#thumbs figure').first().locator('button.toque').getAttribute('aria-pressed') === 'true');
  const rotulo = await fig.evaluate(el => getComputedStyle(el, '::after').content);
  ok(`etiqueta traduzida: ${esperado}`, rotulo.includes(esperado), rotulo);
  // render() devolve o foco ao mesmo botão, então a barra de espaço volta nele
  await pg.keyboard.press(' ');
  await pg.waitForTimeout(150);
  ok('barra de espaço devolve o frame', await pg.locator('#thumbs figure.off').count() === antes);

  // o campo de anotação: focável, e digitar espaço nele não pode descartar nada
  const nota = fig.locator('input.nota');
  ok('a miniatura tem campo de anotação', await nota.count() === 1);
  await nota.click();
  await nota.type('espera: o sistema recusa');
  await pg.waitForTimeout(100);
  ok('digitar espaço na anotação não descarta o frame',
     await pg.locator('#thumbs figure.off').count() === antes);
  ok('a anotação fica guardada no frame',
     await pg.evaluate(() => document.querySelector('#thumbs input.nota').value) === 'espera: o sistema recusa');
  ok('a miniatura numera o passo',
     (await fig.locator('figcaption .passo').textContent()).trim().length > 0);

  /* :focus-visible depende da heurística do navegador: foco por script não
     conta, foco por teclado conta. Por isso o teste navega de Tab. */
  /* Antes este teste caçava UM elemento (#drop) e desistia depois de 60 Tabs.
     Ele quebrou quando a revisão ganhou subpassos: o caminho até lá cresceu e o
     laço acabava antes, reportando "0px" como se o contorno tivesse sumido — um
     falso negativo que parecia defeito de acessibilidade.

     A propriedade que interessa não é "o #drop tem contorno": é "todo elemento
     que recebe foco de teclado mostra onde está". Então o teste anda vinte
     paradas a partir do topo e cobra de todas. */
  await pg.evaluate(() => {
    const primeiro = document.querySelector('a[href],button,select,input,summary');
    if (primeiro) primeiro.focus();
  });
  const semAnel = [];
  for (let i = 0; i < 20; i++) {
    await pg.keyboard.press('Tab');
    const r = await pg.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      /* <video controls> e <audio controls> ficam de fora: o anel de foco
         deles é desenhado pelo navegador DENTRO do shadow DOM dos controles,
         onde o CSS da página não alcança e o getComputedStyle não enxerga.
         Cobrar contorno deles é cobrar uma coisa que não se pode dar. */
      const nativo = /^(video|audio)$/i.test(el.tagName) && el.hasAttribute('controls');
      return { id: el.id || el.tagName.toLowerCase(), ow: cs.outlineWidth,
               sombra: cs.boxShadow !== 'none' || nativo };
    });
    if (!r) break;
    if ((r.ow === '0px' || r.ow === 'medium') && !r.sombra) semAnel.push(r.id + ':' + r.ow);
  }
  ok('todo foco de teclado mostra onde está', semAnel.length === 0, semAnel.join(' '));
  ok('sem erro de JS', erros.length===0, erros.join(' | ').slice(0,140));
  await ctx.close();
}
await br.close(); srv.close();
console.log(falhas?`\n${falhas} FALHA(S)`:'\nTeclado e i18n: tudo passou.');
process.exit(falhas?1:0);
