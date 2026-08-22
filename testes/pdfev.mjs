import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT=`${RAIZ_WS}/public`;
const html=fs.readFileSync(ROOT+'/app.html','utf8');
const jspdf=fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
const srv=http.createServer((q,r)=>{if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')}r.writeHead(200,{'Content-Type':'text/html'});r.end(html)});
await new Promise(r=>srv.listen(8894,r));
const br=await chromium.launch({executablePath:CHROME_WS});
const ctx=await br.newContext({acceptDownloads:true});
const pg=await ctx.newPage();
await pg.route('**/jspdf**',r=>r.fulfill({status:200,headers:{'content-type':'text/javascript','access-control-allow-origin':'*'},body:jspdf}));
await pg.goto('http://localhost:8894/app.html?lang=pt');
// o cenário virou obrigatório antes de o vídeo entrar ou de a gravação começar
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.setInputFiles('#file','/tmp/amostra.webm');
await pg.waitForTimeout(2500);
await pg.fill('#tr',`WEBVTT

00:00:00.000 --> 00:00:03.000
Abri a transacao ME21N e informei o fornecedor

00:00:03.100 --> 00:00:06.500
Salvei sem centro de custo e o sistema recusou`);
await pg.dispatchEvent('#tr','input');
await pg.selectOption('#mode','count'); await pg.fill('#count','4');
await pg.click('#extract');
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=4,null,{timeout:40000});
await pg.selectOption('#modelo','evidencia');
await pg.waitForTimeout(250);
await pg.locator('#evBox').evaluate(el=>el.open=true);
await pg.fill('#evCaso','UAT-4711 — Criação de pedido de compra');
await pg.fill('#evSis','S4P / 100');
await pg.fill('#evQuem','Leandro B. de Oliveira');
await pg.fill('#evChamado','CHG0045231');
await pg.selectOption('#evRes','ok');
await pg.fill('#evInicio','2026-08-14T12:58:45'); await pg.dispatchEvent('#evInicio','input');
await pg.check('#evHash');
await pg.locator('#thumbs figure').nth(0).locator('input.nota').fill('Espera: o sistema deve exigir centro de custo no item');
await pg.locator('#thumbs figure').nth(1).locator('input.nota').fill('Observado: mensagem KI235 bloqueou a gravação');
const dl=pg.waitForEvent('download',{timeout:60000});
await pg.click('#go');
const d=await dl; await d.saveAs('/tmp/evfull.pdf');
console.log('ok');
await br.close(); srv.close();
