import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';
const RAIZ='/root/walkstamp';
const html = fs.readFileSync(RAIZ+'/public/app.html','utf8');
const srv=http.createServer((q,r)=>{ if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')} r.writeHead(200,{'Content-Type':'text/html'}); r.end(html); });
await new Promise(r=>srv.listen(8993,r));
const br=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await br.newContext({acceptDownloads:true, viewport:{width:1250,height:900}});
const pg=await ctx.newPage();
const erros=[]; pg.on('pageerror',e=>erros.push(e.message));
await pg.goto('http://localhost:8993/app.html?lang=pt');
await pg.selectOption('#modelo','ata');
await pg.setInputFiles('#file','/tmp/amostra.webm'); await pg.waitForTimeout(2800);
await pg.selectOption('#mode','count'); await pg.fill('#count','8');
await pg.locator('#extract').click();
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=8,null,{timeout:40000});
await pg.waitForTimeout(600);
// uma transcrição em que as frases ATRAVESSAM as fronteiras dos quadros
const vtt = ['WEBVTT',''];
for (let k=0;k<9;k++){
  const a=k*4.7, b=a+4.4;
  const mm=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(Math.floor(n%60)).padStart(2,'0')+'.'+String(Math.round(n%1*1000)).padStart(3,'0');
  vtt.push('00:'+mm(a)+' --> 00:'+mm(b), 'Trecho numero '+(k+1)+' desta reuniao, com uma frase longa o bastante para atravessar a fronteira entre dois quadros.','');
}
await pg.fill('#tr', vtt.join('\n'));
await pg.dispatchEvent('#tr','input');
await pg.waitForTimeout(500);
const r = await pg.evaluate(()=>{
  const q=(window.__quadros()||[]).filter(f=>f.keep);
  return { titulo: (typeof tituloDoDoc==='function') ? 'tem' : 'nao' };
});
const dl = pg.waitForEvent('download',{timeout:60000});
await pg.locator('#html').click();
await (await dl).saveAs('/tmp/med.html');
const doc = fs.readFileSync('/tmp/med.html','utf8');
const falas = [...doc.matchAll(/<p class="fala">([^<]*)<\/p>/g)].map(m=>m[1]);
console.log('quadros com fala:', falas.length);
falas.forEach((f,i)=>console.log('  '+(i+1)+': '+f.slice(0,95)));
const tit = (doc.match(/<h1>([^<]*)<\/h1>/)||[])[1];
const arq = (doc.match(/<p class="arq">([^<]*)<\/p>/)||[])[1];
console.log('\ntitulo:', tit, '| subtitulo:', arq === undefined ? '(nenhum)' : arq);
console.log('erros:', erros.join(' | ').slice(0,200)||'nenhum');
await br.close(); srv.close();
