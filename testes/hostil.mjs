import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const html=fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
const srv=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html'});r.end(html)});
await new Promise(r=>srv.listen(8887,r));
const br=await chromium.launch({executablePath:CHROME_WS});
const ctx=await br.newContext({acceptDownloads:true});
const pg=await ctx.newPage();
const erros=[]; pg.on('pageerror',e=>erros.push(e.message));
await pg.goto('http://localhost:8887/app.html?lang=pt');
// o cenário de uso passou a ser obrigatório: sem ele o Gravar e o envio de vídeo cobram a escolha
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.waitForTimeout(400);
await pg.setInputFiles('#file', '/tmp/a&b <c> "d".webm');
const carregou = await pg.evaluate(()=>document.getElementById('file').files.length);
console.log('arquivo com nome hostil carregado:', carregou === 1);
await pg.waitForTimeout(2500);
// texto que quebra XML mal escapado
await pg.fill('#tr', `WEBVTT

00:00:00.000 --> 00:00:03.000
Microfone: P&L caiu <5% & margem "boa" — não é 'ótimo'

00:00:03.100 --> 00:00:06.000
Computador: veja </w:t></w:r></w:p> e o símbolo ©®™ e emoji 🚀 中文`);
await pg.dispatchEvent('#tr','input');
await pg.selectOption('#mode','count'); await pg.fill('#count','3');
await pg.locator('#extract').click();
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>0,null,{timeout:40000});
await pg.waitForTimeout(500);
// injeta OCR hostil também
await pg.evaluate(() => { /* nada: OCR real exige rede */ });
const d1 = pg.waitForEvent('download',{timeout:30000});
await pg.locator('#docx').click();
await (await d1).saveAs('/tmp/hostil.docx');
const d2 = pg.waitForEvent('download',{timeout:30000});
await pg.locator('#zip').click();
const dz = await d2;
await dz.saveAs('/tmp/hostil.zip');
console.log('nome do zip:', dz.suggestedFilename());
console.log('status:', await pg.locator('#pdfStatus').textContent());
console.log('erros de JS:', erros.length ? erros : 'nenhum');
await br.close(); srv.close();
