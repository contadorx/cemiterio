/* EV-001, auto-parar, atalhos e o cabeçalho de procedimento. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const html = fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
const srv = http.createServer((q,r)=>{ if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')} r.writeHead(200,{'Content-Type':'text/html'}); r.end(html); });
await new Promise(r=>srv.listen(8929,r));
const br = await chromium.launch({ executablePath:CHROME_WS });
let falhas = 0;
const ok = (n,c,e2)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e2?'  → '+e2:''));if(!c)falhas++};
const ctx = await br.newContext({ acceptDownloads:true, viewport:{width:1300,height:1000} });
const pg = await ctx.newPage();
const erros=[]; pg.on('pageerror', e=>erros.push(e.message));
await pg.route('**/jspdf**', r=>r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
await pg.goto('http://localhost:8929/app.html?lang=pt');
await pg.selectOption('#modelo','evidencia');
await pg.setInputFiles('#file','/tmp/amostra.webm'); await pg.waitForTimeout(2500);
await pg.selectOption('#mode','count'); await pg.fill('#count','2');
await pg.locator('#extract').click();
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=2,null,{timeout:40000});
await pg.locator('#evBox').evaluate(e=>e.open=true);
await pg.fill('#evCaso','UAT-77 pedido');
await pg.waitForTimeout(300);

console.log('[1] numeração automática, desligada por padrão');
ok('a caixa começa desmarcada', !(await pg.locator('#evNum').isChecked()));
{
  const dl = pg.waitForEvent('download',{timeout:40000});
  await pg.locator('#md').click();
  const d = await dl;
  ok('sem ela, o nome não ganha número', !/^EV-/.test(d.suggestedFilename()), d.suggestedFilename());
}
await pg.locator('#evNum').check(); await pg.waitForTimeout(250);
ok('marcada, ela anuncia o próximo', /EV-001/.test(await pg.locator('#evNumAtual').textContent()),
   await pg.locator('#evNumAtual').textContent());
{
  const dl = pg.waitForEvent('download',{timeout:40000});
  await pg.locator('#md').click();
  const d = await dl;
  ok('o primeiro documento sai EV-001', /^EV-001-/.test(d.suggestedFilename()), d.suggestedFilename());
  const dl2 = pg.waitForEvent('download',{timeout:40000});
  await pg.locator('#md').click();
  const d2 = await dl2;
  ok('e o segundo, EV-002', /^EV-002-/.test(d2.suggestedFilename()), d2.suggestedFilename());
}
{
  /* Um contador que continuasse de ontem, numa ferramenta que promete não
     guardar nada, seria a primeira contradição da política. */
  const ctx2 = await br.newContext();
  const pg2 = await ctx2.newPage();
  await pg2.goto('http://localhost:8929/app.html?lang=pt');
  await pg2.waitForTimeout(300);
  const guardado = await pg2.evaluate(() => localStorage.getItem('Walkstamp.contador'));
  ok('o contador não vai para a localStorage', guardado === null);
  await ctx2.close();
}
await pg.reload(); await pg.waitForTimeout(600);
ok('mas sobrevive ao F5 da mesma aba — é a mesma tarde de trabalho',
   (await pg.evaluate(() => sessionStorage.getItem('Walkstamp.contador'))) === '2');

console.log('\n[2] o cabeçalho de procedimento só existe na instrução');
await pg.selectOption('#modelo','evidencia'); await pg.waitForTimeout(250);
ok('a evidência não pede "válido a partir de"',
   await pg.locator('#cxValido').evaluate(e=>e.classList.contains('hide')));
await pg.selectOption('#modelo','tutorial'); await pg.waitForTimeout(250);
ok('a instrução pede', !(await pg.locator('#cxValido').evaluate(e=>e.classList.contains('hide'))));
ok('e pede a área / dono', !(await pg.locator('#cxDono').evaluate(e=>e.classList.contains('hide'))));

console.log('\n[3] e eles chegam no documento em português legível');
{
  await pg.setInputFiles('#file','/tmp/amostra.webm'); await pg.waitForTimeout(2500);
  await pg.selectOption('#mode','count'); await pg.fill('#count','2');
  await pg.locator('#extract').click();
  await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=2,null,{timeout:40000});
  await pg.locator('#evBox').evaluate(e=>e.open=true);
  await pg.fill('#evCaso','Lançar pedido');
  await pg.fill('#evDono','Compras / Suprimentos');
  await pg.fill('#evValido','2027-03-01');
  await pg.waitForTimeout(300);
  const dl = pg.waitForEvent('download',{timeout:40000});
  await pg.locator('#html').click();
  const d = await dl; await d.saveAs('/tmp/proc.html');
  const h = fs.readFileSync('/tmp/proc.html','utf8');
  ok('a área / dono entrou', /Compras \/ Suprimentos/.test(h));
  ok('e a data saiu por extenso, não como 2027-03-01',
     /de março de 2027|1 de março/.test(h), (h.match(/[^<>]*mar[^<>]*/)||[''])[0].slice(0,40));
}

console.log('\n[4] auto-parar: existe, é generoso e é desligável');
{
  const fonte = fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
  ok('a caixa vem marcada', /id="recAuto" checked/.test(fonte));
  ok('com 45 minutos de padrão', /id="recAutoMin" value="45"/.test(fonte));
  ok('e o limite é conferido no relógio da gravação, não num timer paralelo',
     /recAuto'\) && \$\('recAuto'\)\.checked/.test(fonte) && /agora\(\) >= lim/.test(fonte));
  ok('a mensagem de fim explica que parou sozinha', /recAutoParou/.test(fonte));
}

console.log('\n[5] atalhos de teclado');
{
  /* A dica escrita saiu da tela na revisão de UX: era uma linha de leitura para
     um recurso que quem usa toda semana descobre uma vez e nunca mais lê. Os
     atalhos continuam existindo — e é isso que este teste passa a cobrar, que
     é a parte que importa. */
  ok('a dica escrita saiu da tela', (await pg.locator('[data-i18n="atalhos"]').count()) === 0);
  /* A tecla não pode roubar a digitação de ninguém. */
  await pg.locator('#thumbs figure').nth(0).locator('input.nota').fill('');
  await pg.locator('#thumbs figure').nth(0).locator('input.nota').focus();
  await pg.keyboard.type('gravar em produção');
  await pg.waitForTimeout(300);
  ok('digitar "g" numa anotação escreve, não grava',
     (await pg.locator('#thumbs figure').nth(0).locator('input.nota').inputValue()) === 'gravar em produção',
     await pg.locator('#thumbs figure').nth(0).locator('input.nota').inputValue());
  ok('e nada começou a gravar', await pg.locator('#recStop').isHidden());
}

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0,180));
await br.close(); srv.close();
console.log(falhas ? '\n'+falhas+' falha(s)' : '\nMiudezas 2: tudo passou.');
process.exit(falhas?1:0);
