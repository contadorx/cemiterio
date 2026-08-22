/* Comparar dois quadros: sobreposição, piscada e diferença calculada. */
import { chromium } from './_navegador.mjs';   // abre os painéis e a gaveta das saídas
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const html = fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
const srv = http.createServer((q,r)=>{ if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')} r.writeHead(200,{'Content-Type':'text/html'}); r.end(html); });
await new Promise(r=>srv.listen(8935,r));
const br = await chromium.launch({ executablePath:CHROME_WS });
let falhas = 0;
const ok = (n,c,e2)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e2?'  → '+e2:''));if(!c)falhas++};
const ctx = await br.newContext({ acceptDownloads:true, viewport:{width:1300,height:1000} });
const pg = await ctx.newPage();
const erros=[]; pg.on('pageerror', e=>erros.push(e.message));
await pg.route('**/jspdf**', r=>r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
await pg.goto('http://localhost:8935/app.html?lang=pt');
await pg.selectOption('#modelo','tutorial');
await pg.setInputFiles('#file','/tmp/amostra.webm'); await pg.waitForTimeout(2500);
await pg.selectOption('#mode','count'); await pg.fill('#count','4');
await pg.locator('#extract').click();
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=4,null,{timeout:40000});
await pg.waitForTimeout(500);

console.log('[1] a comparação abre na lente');
await pg.locator('#thumbs figure').nth(2).locator('.editar').click();
await pg.waitForSelector('#lente:not(.hide)');
await pg.waitForTimeout(300);
ok('o botão existe', await pg.locator('#comparar').isVisible());
ok('e a caixa começa fechada', await pg.locator('#cmpBox').isHidden());
await pg.locator('#comparar').click();
await pg.waitForTimeout(400);
ok('a caixa abriu', await pg.locator('#cmpBox').isVisible());
ok('a camada de sobreposição foi criada', (await pg.locator('#cmpCamada').count()) === 1);
{
  const opcoes = await pg.locator('#cmpCom option').evaluateAll(o=>o.map(x=>x.textContent));
  console.log('     ' + opcoes.join(' | '));
  ok('lista os outros quadros, e não este', opcoes.length === 3, String(opcoes.length));
  ok('o padrão é o quadro anterior', /Passo 2/.test(await pg.locator('#cmpCom option:checked').textContent()),
     await pg.locator('#cmpCom option:checked').textContent());
}

console.log('\n[2] o cursor controla a piscada');
{
  const op0 = await pg.locator('#cmpCamada').evaluate(e=>getComputedStyle(e).opacity);
  ok('começa no meio', Math.abs(+op0 - 0.5) < 0.02, op0);
  await pg.locator('#cmpMistura').fill('0');
  await pg.waitForTimeout(200);
  ok('em 0 mostra só este quadro',
     Math.abs(+(await pg.locator('#cmpCamada').evaluate(e=>getComputedStyle(e).opacity))) < 0.02);
  await pg.locator('#cmpMistura').fill('100');
  await pg.waitForTimeout(200);
  ok('em 100 mostra só o outro',
     Math.abs(+(await pg.locator('#cmpCamada').evaluate(e=>getComputedStyle(e).opacity)) - 1) < 0.02);
  ok('e a mensagem explica o gesto',
     /piscar/.test(await pg.locator('#cmpMsg').textContent()), await pg.locator('#cmpMsg').textContent());
}

console.log('\n[3] a diferença calculada pinta o que mudou');
await pg.locator('#cmpDiff').click();
await pg.waitForTimeout(1500);
{
  const msg = await pg.locator('#cmpMsg').textContent();
  console.log('     ' + msg);
  ok('a conta saiu', /% dos pixels mudaram|iguais/.test(msg), msg);
  const bg = await pg.locator('#cmpCamada').evaluate(e=>e.style.backgroundImage.slice(0,20));
  ok('a camada virou a imagem da diferença', /data:image\/png/.test(bg), bg);
}
{
  /* O vermelho tem que estar nos pixels: uma mensagem dizendo "3% mudaram" com
     a camada vazia seria pior que não ter o botão. */
  const cores = await pg.evaluate(async () => {
    const url = document.getElementById('cmpCamada').style.backgroundImage.slice(5, -2);
    const im = new Image(); im.src = url;
    await new Promise(r => { im.onload = r; });
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    c.getContext('2d').drawImage(im, 0, 0);
    const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let vermelho = 0, transp = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i+3] < 10) transp++;
      else if (d[i] > 200 && d[i+1] < 60) vermelho++;
    }
    return { vermelho, transp };
  });
  console.log('     ' + JSON.stringify(cores));
  ok('há vermelho onde os quadros discordam', cores.vermelho > 100, JSON.stringify(cores));
  ok('e transparente onde eles batem', cores.transp > 100, JSON.stringify(cores));
}

console.log('\n[4] comparar um quadro com ele mesmo dá zero');
{
  /* Duplicar cria uma cópia idêntica: a diferença tem que ser exatamente
     "iguais", e não "0,0%", que deixaria dúvida. */
  await pg.locator('#duplicar').click();
  await pg.waitForTimeout(800);
  await pg.locator('#lenteFechar').click();
  await pg.waitForTimeout(300);
  // acha o par de miniaturas com a MESMA imagem — é o original e a cópia
  const par = await pg.evaluate(() => {
    const src = [...document.querySelectorAll('#thumbs figure img')].map(i => i.src);
    for (let a = 0; a < src.length; a++)
      for (let b = a + 1; b < src.length; b++) if (src[a] === src[b]) return [a, b];
    return null;
  });
  ok('a duplicata existe e é idêntica', !!par, JSON.stringify(par));
  await pg.locator('#thumbs figure').nth(par[0]).locator('.editar').click();
  await pg.waitForSelector('#lente:not(.hide)');
  await pg.waitForTimeout(300);
  await pg.locator('#comparar').click();
  await pg.waitForTimeout(400);
  await pg.selectOption('#cmpCom', String(par[1]));
  await pg.waitForTimeout(300);
  await pg.locator('#cmpDiff').click();
  await pg.waitForTimeout(1500);
  const msg = await pg.locator('#cmpMsg').textContent();
  console.log('     ' + msg);
  ok('comparar um quadro com a cópia dele diz "iguais", e não "0,0%"',
     /iguais|idênticos/i.test(msg), msg);
  await pg.locator('#comparar').click();
  await pg.waitForTimeout(200);
  await pg.locator('#lenteFechar').click();
  await pg.waitForTimeout(300);
}

console.log('\n[5] a comparação é leitura, não edição');
ok('fechar a lente tira a camada', (await pg.locator('#cmpCamada').count()) === 0);
{
  const dl = pg.waitForEvent('download',{timeout:40000});
  await pg.locator('#md').click();
  const d = await dl; await d.saveAs('/tmp/cmp.md');
  const md = fs.readFileSync('/tmp/cmp.md','utf8');
  ok('nada da comparação entrou no documento', !/vermelho|diferen/i.test(md));
  ok('e as imagens continuam lá', (md.match(/!\[/g)||[]).length >= 4,
     String((md.match(/!\[/g)||[]).length));
}
await pg.locator('#thumbs figure').nth(0).locator('.editar').click();
await pg.waitForSelector('#lente:not(.hide)');
await pg.waitForTimeout(300);
ok('e reabrir a lente noutro quadro começa sem comparação', await pg.locator('#cmpBox').isHidden());

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0,200));
await br.close(); srv.close();
console.log(falhas ? '\n'+falhas+' falha(s)' : '\nComparar quadros: tudo passou.');
process.exit(falhas?1:0);
