import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';
const RAIZ='/root/walkstamp';
const html = fs.readFileSync(RAIZ+'/public/app.html','utf8');
const jspdf = fs.readFileSync(RAIZ+'/vendor/jspdf.umd.min.js','utf8');
const srv=http.createServer((q,r)=>{ if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')} r.writeHead(200,{'Content-Type':'text/html'}); r.end(html); });
await new Promise(r=>srv.listen(8995,r));
const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await br.newContext({acceptDownloads:true, viewport:{width:1250,height:900}});
const pg=await ctx.newPage();
const erros=[]; pg.on('pageerror',e=>erros.push(e.message));
await pg.route('**/jspdf**', r=>r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
await pg.goto('http://localhost:8995/app.html?lang=pt');
await pg.selectOption('#modelo','evidencia');
await pg.setInputFiles('#file','/tmp/amostra.webm'); await pg.waitForTimeout(2800);
await pg.selectOption('#mode','count'); await pg.fill('#count','6');
await pg.locator('#extract').click();
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=6,null,{timeout:40000});
await pg.waitForTimeout(600);
const vtt=['WEBVTT',''];
for(let k=0;k<7;k++){const a=k*6.5,b=a+6.0;
  const mm=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(Math.floor(n%60)).padStart(2,'0')+'.000';
  vtt.push('00:'+mm(a)+' --> 00:'+mm(b),'Trecho '+(k+1)+' com uma frase de tamanho normal aqui.','');}
await pg.fill('#tr', vtt.join('\n')); await pg.dispatchEvent('#tr','input');
await pg.waitForTimeout(400);
for (const lay of ['full','uma']) {
  await pg.selectOption('#layout', lay);
  await pg.waitForTimeout(300);
  const dl = pg.waitForEvent('download',{timeout:90000});
  await pg.locator('#go').click();
  await (await dl).saveAs('/tmp/lay-'+lay+'.pdf');
  await pg.waitForTimeout(500);
}
console.log('erros:', erros.join(' | ').slice(0,200)||'nenhum');
await br.close(); srv.close();
