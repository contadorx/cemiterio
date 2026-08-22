/* Ambiente, tipo do momento, contagem regressiva e hesitações. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const html = fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
const srv = http.createServer((q,r)=>{ if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')} r.writeHead(200,{'Content-Type':'text/html'}); r.end(html); });
await new Promise(r=>srv.listen(8925,r));
const br = await chromium.launch({ executablePath:CHROME_WS });
let falhas = 0;
const ok = (n,c,e2)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e2?'  → '+e2:''));if(!c)falhas++};
const ctx = await br.newContext({ acceptDownloads:true, viewport:{width:1250,height:980} });
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', e=>erros.push(e.message));
await pg.route('**/jspdf**', r=>r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
await pg.goto('http://localhost:8925/app.html?lang=pt'); await pg.waitForTimeout(400);

console.log('[1] o ambiente é campo de evidência, não de todo mundo');
await pg.selectOption('#modelo','ata'); await pg.waitForTimeout(200);
ok('não aparece numa ata', await pg.locator('#cxAmb').evaluate(e=>e.classList.contains('hide')));
await pg.selectOption('#modelo','evidencia'); await pg.waitForTimeout(200);
ok('aparece na evidência', !(await pg.locator('#cxAmb').evaluate(e=>e.classList.contains('hide'))));

await pg.setInputFiles('#file','/tmp/amostra.webm'); await pg.waitForTimeout(2500);
await pg.selectOption('#mode','count'); await pg.fill('#count','2');
await pg.locator('#extract').click();
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=2,null,{timeout:40000});
await pg.locator('#evBox').evaluate(e=>e.open=true);
await pg.fill('#evCaso','UAT-9 pedido'); await pg.selectOption('#evAmb','QAS');
await pg.waitForTimeout(300);
{
  const dl = pg.waitForEvent('download',{timeout:40000});
  await pg.locator('#html').click();
  const d = await dl; await d.saveAs('/tmp/amb.html');
  ok('o ambiente entra na identificação do documento', /QAS/.test(fs.readFileSync('/tmp/amb.html','utf8')));
  const dl2 = pg.waitForEvent('download',{timeout:40000});
  await pg.locator('#json').click();
  const d2 = await dl2; await d2.saveAs('/tmp/amb.json');
  ok('e no JSON', JSON.parse(fs.readFileSync('/tmp/amb.json','utf8')).evidencia.ambiente === 'QAS');
}

console.log('\n[2] tipo do momento, só na sessão de pesquisa');
await pg.locator('#thumbs figure').nth(0).locator('.editar').click();
await pg.waitForSelector('#lente:not(.hide)');
ok('escondido na evidência', await pg.locator('#lenteTipoCx').evaluate(e=>e.classList.contains('hide')));
await pg.locator('#lenteFechar').click(); await pg.waitForTimeout(200);
await pg.selectOption('#modelo','usabilidade'); await pg.waitForTimeout(300);
await pg.locator('#thumbs figure').nth(0).locator('.editar').click();
await pg.waitForSelector('#lente:not(.hide)');
ok('aparece na sessão', !(await pg.locator('#lenteTipoCx').evaluate(e=>e.classList.contains('hide'))));
await pg.selectOption('#lenteTipo','friccao');
await pg.waitForTimeout(400);
await pg.locator('#lenteFechar').click(); await pg.waitForTimeout(300);
ok('a miniatura ganha a etiqueta', (await pg.locator('#thumbs .tipoTag').count()) === 1);
ok('com a palavra, não só a cor', /fricção/.test(await pg.locator('#thumbs .tipoTag').first().textContent()),
   await pg.locator('#thumbs .tipoTag').first().textContent());
ok('e o prompt manda usar a classificação',
   /classificados pelo pesquisador/.test(await pg.locator('#promptOut').textContent()));
{
  const dl = pg.waitForEvent('download',{timeout:40000});
  await pg.locator('#csv').click();
  const d = await dl; await d.saveAs('/tmp/amb.csv');
  const csv = fs.readFileSync('/tmp/amb.csv','utf8');
  ok('a planilha ganha a coluna do tipo', /Tipo do momento/.test(csv));
  ok('com o valor preenchido', /fricção/.test(csv));
}

console.log('\n[3] a contagem regressiva — sempre, e sem caixa para desligar');
{
  const fonte = fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
  /* A caixa saiu: ela existia só para oferecer o jeito de estragar o primeiro
     quadro da própria gravação — sem os três segundos, o primeiro quadro é
     quase sempre o seletor de tela do navegador que a pessoa acabou de fechar. */
  ok('a caixa de desligar não existe mais', !/id="recCount"/.test(fonte));
  ok('e a contagem conta antes de zerar o relógio',
     fonte.indexOf('for (let c = SEG_CONTAGEM;') < fonte.indexOf('const t0 = performance.now()'));
  /* A régua dos testes encurta um NÚMERO de segundos, e não desvia de caminho:
     o laço que roda aqui é o mesmo que roda na máquina de quem grava. */
  ok('os testes encurtam a contagem sem pular o laço',
     /window\.__contagem = n =>/.test(fonte));
}

console.log('\n[4] tirar hesitações — desligado por padrão');
ok('a caixa começa desmarcada', !(await pg.locator('#hesitar').isChecked()));
await pg.fill('#tr', 'WEBVTT\n\n00:00:00.000 --> 00:00:09.000\nMicrofone: é... eu vou, hã, abrir a tela, tipo, agora');
await pg.dispatchEvent('#tr','input');
/* APLICAR os termos é de todo mundo — o que se vende é a lista ficar gravada.
   E a limpeza de hesitação ganhou botão PRÓPRIO: ela morava dentro da caixa de
   vocabulário por vizinhança, e as duas são coisas diferentes. */
ok('"Termos do seu sistema" está à mão de quem não paga',
   await pg.locator('#vocRow').isVisible());
ok('e tirar hesitações também',
   await pg.locator('#hesitar').isVisible());
ok('sem marcar, não há botão para apertar',
   !(await pg.locator('#hesAplicar').isVisible()));
await pg.locator('#hesitar').check(); await pg.waitForTimeout(200);
ok('marcada na sessão de pesquisa, a nota avisa que a hesitação é o dado',
   !(await pg.locator('#hesitarNota').evaluate(e=>e.classList.contains('hide'))));
ok('e o botão aparece', await pg.locator('#hesAplicar').isVisible());
await pg.locator('#hesAplicar').click(); await pg.waitForTimeout(500);
{
  const txt = (await pg.locator('#tr').inputValue()).split('\n').pop();
  console.log('      ' + txt);
  ok('as hesitações saíram', !/hã/.test(txt) && !/^Microfone: é\.\.\./.test(txt), txt);
  ok('a fala continua inteira', /abrir a tela/.test(txt));
  ok('e a linha de tempo do VTT não foi tocada', /00:00:00\.000 --> 00:00:09\.000/.test(await pg.locator('#tr').inputValue()));
  ok('a mensagem conta quantas', /hesita/i.test(await pg.locator('#hesMsg').textContent()),
     (await pg.locator('#hesMsg').textContent()).slice(0,60));
}
await pg.locator('#hesDesfazer').click(); await pg.waitForTimeout(300);
ok('e dá para desfazer', /hã/.test(await pg.locator('#tr').inputValue()));

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0,180));
await br.close(); srv.close();
console.log(falhas ? '\n'+falhas+' falha(s)' : '\nMiudezas: tudo passou.');
process.exit(falhas?1:0);
