import { chromium } from './_navegador.mjs';   // abre os painéis e a gaveta das saídas
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const html=fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html'});r.end(html)});
await new Promise(r=>srv.listen(8885,r));
const br=await chromium.launch({executablePath:CHROME_WS});
const ctx=await br.newContext({acceptDownloads:true}); const pg=await ctx.newPage();
const erros=[]; pg.on('pageerror',e=>erros.push(e.message));
await pg.goto('http://localhost:8885/app.html?lang=pt'); await pg.waitForTimeout(400);
// o cenário de uso passou a ser obrigatório: sem ele o Gravar e o envio de vídeo cobram a escolha
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.setInputFiles('#file','/tmp/retrato.webm'); await pg.waitForTimeout(2500);
await pg.selectOption('#mode','count'); await pg.fill('#count','3');
await pg.locator('#extract').click();
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>0,null,{timeout:40000}); await pg.waitForTimeout(400);
const d=pg.waitForEvent('download',{timeout:40000});
await pg.locator('#docx').click();
await (await d).saveAs('/tmp/retrato.docx');
console.log('erros de JS:', erros.length?erros:'nenhum');
await br.close(); srv.close();
