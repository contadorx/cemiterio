/* Modelo de saída: uma escolha só que acerta layout, prompt, nome do arquivo e
   os dados da evidência. Mais o botão que transforma a fala em anotação. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs'; import zlib from 'zlib';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT=`${RAIZ_WS}/public`;
const html=fs.readFileSync(ROOT+'/app.html','utf8');
const jspdf=fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
const srv=http.createServer((q,r)=>{if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')}r.writeHead(200,{'Content-Type':'text/html'});r.end(html)});
await new Promise(r=>srv.listen(8896,r));
const br=await chromium.launch({executablePath:CHROME_WS});
let falhas=0;
const ok=(n,c,extra)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(extra?'  → '+extra:''));if(!c)falhas++;};

function lerZip(caminho){
  const b=fs.readFileSync(caminho); const saida={}; let i=0;
  while((i=b.indexOf('PK\x03\x04',i))!==-1){
    const nl=b.readUInt16LE(i+26), el=b.readUInt16LE(i+28), n=b.readUInt32LE(i+18);
    saida[b.subarray(i+30,i+30+nl).toString('utf8')]=b.subarray(i+30+nl+el,i+30+nl+el+n);
    i=i+30+nl+el+n;
  }
  return saida;
}
function textoDoPdf(caminho){
  const buf=fs.readFileSync(caminho); let out=''; let i=0;
  while((i=buf.indexOf('stream',i))!==-1){
    let a=i+6; if(buf[a]===13)a++; if(buf[a]===10)a++;
    const fim=buf.indexOf('endstream',a); if(fim===-1)break;
    try{out+=zlib.inflateSync(buf.subarray(a,fim)).toString('latin1')}catch(e){}
    i=fim+9;
  }
  return out;
}

const ctx=await br.newContext({acceptDownloads:true});
const pg=await ctx.newPage();
const erros=[]; pg.on('pageerror',e=>erros.push(e.message));
await pg.route('**/jspdf**',r=>r.fulfill({status:200,headers:{'content-type':'text/javascript','access-control-allow-origin':'*'},body:jspdf}));
await pg.goto('http://localhost:8896/app.html?lang=pt');
await pg.waitForTimeout(400);

console.log('\n[1] não há padrão: a caixa começa perguntando');
/* Havia um padrão — "Contexto para IA" — e ele decidia sozinho o cabeçalho, a
   hora de relógio, o nome do quadro e o formato do documento inteiro para quem
   não reparou na caixa. Um padrão invisível numa escolha irreversível é pior
   que uma pergunta: o erro só aparece no fim, quando não há o que fazer. */
ok('nenhum cenário vem escolhido', (await pg.locator('#modelo').inputValue()) === '',
   JSON.stringify(await pg.locator('#modelo').inputValue()));
/* A explicação do cenário mora no passo 1, ao lado da escolha; a revisão só
   lembra qual cenário está valendo. Enquanto ninguém escolheu, ela diz por que
   a escolha importa em vez de descrever um cenário que não foi pedido. */
ok('a linha de baixo diz por que a escolha importa',
   /cabeçalho|hora de relógio|prompt/i.test(await pg.locator('#cenDica').textContent()),
   (await pg.locator('#cenDica').textContent()).slice(0,44));
await pg.selectOption('#modelo', 'ia');
await pg.waitForTimeout(250);
ok('e escolhido o genérico, ela passa a descrever o genérico',
   (await pg.locator('#cenDica').textContent()).includes('Sequência com a fala'),
   (await pg.locator('#cenDica').textContent()).slice(0,40));

await pg.setInputFiles('#file','/tmp/amostra.webm');
await pg.waitForTimeout(2500);
await pg.fill('#tr',`WEBVTT

00:00:00.000 --> 00:00:03.000
Abri a transacao ME21N e informei o fornecedor

00:00:03.100 --> 00:00:06.000
Salvei sem centro de custo e o sistema recusou

00:00:06.100 --> 00:00:08.000
Corrigi o centro de custo e gravei de novo`);
await pg.dispatchEvent('#tr','input');
await pg.selectOption('#mode','count'); await pg.fill('#count','3');
await pg.click('#extract');
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=3,null,{timeout:40000});
await pg.waitForTimeout(300);

console.log('\n[2] a fala vira o rascunho da anotação');
{
  ok('o botão está habilitado com transcrição marcada no tempo',
     !(await pg.locator('#falaNota').isDisabled()));
  await pg.locator('#thumbs figure').nth(1).locator('input.nota').fill('escrito à mão, não pode ser sobrescrito');
  await pg.waitForTimeout(100);
  await pg.click('#falaNota');
  await pg.waitForTimeout(300);
  const n0=await pg.locator('#thumbs input.nota').nth(0).inputValue();
  const n1=await pg.locator('#thumbs input.nota').nth(1).inputValue();
  ok('a anotação vazia foi preenchida com a fala', /ME21N|transacao/.test(n0), n0.slice(0,40));
  ok('o que a pessoa escreveu não foi sobrescrito', n1==='escrito à mão, não pode ser sobrescrito');
  ok('a mensagem diz quantas foram', /anotaç/.test(await pg.locator('#pdfStatus').textContent()));
}

console.log('\n[3] trocar o modelo reconfigura os quatro controles');
{
  await pg.selectOption('#modelo','evidencia');
  await pg.waitForTimeout(300);
  ok('layout virou sequência', await pg.locator('#layout').inputValue()==='full');
  ok('o objetivo do prompt virou a ata de evidência', await pg.locator('#goal').inputValue()==='evidencia');
  ok('os dados da evidência abriram', await pg.locator('#evBox').evaluate(el=>el.open));
  ok('o prompt já fala de evidência',
     (await pg.locator('#promptOut').textContent()).includes('evidência'));

  await pg.selectOption('#modelo','ata');
  await pg.waitForTimeout(200);
  ok('ata usa a grade compacta', await pg.locator('#layout').inputValue()==='grid');
  ok('e fecha os dados da evidência', !(await pg.locator('#evBox').evaluate(el=>el.open)));
}

console.log('\n[4] passo a passo: sem hora de relógio, anotação vira título');
{
  await pg.selectOption('#modelo','tutorial');
  await pg.waitForTimeout(300);
  const rel=(await pg.locator('#thumbs figure').first().locator('.rel').textContent()).trim();
  ok('a miniatura esconde a hora de relógio', !/\d\d:\d\d:\d\d/.test(rel), rel);
  const dl=pg.waitForEvent('download',{timeout:60000});
  await pg.click('#go');
  const d=await dl;
  ok('o nome do arquivo diz o que ele é', d.suggestedFilename().startsWith('passo-a-passo-'), d.suggestedFilename());
  await d.saveAs('/tmp/mod-tut.pdf');
  const txt=textoDoPdf('/tmp/mod-tut.pdf');
  // o travessão sai como escape octal no PDF; a checagem exata do título é no .docx
  ok('a anotação está na mesma linha do passo', /Passo 1.{0,14}Abri a transacao/.test(txt));
  ok('nenhuma hora de relógio no documento', !/20\d\d-\d\d-\d\d \d\d:/.test(txt));
  const dw=pg.waitForEvent('download',{timeout:60000}); await pg.click('#docx'); const dd=await dw;
  await dd.saveAs('/tmp/mod-tut.docx');
  const xml=lerZip('/tmp/mod-tut.docx')['word/document.xml'].toString('utf8');
  ok('a anotação virou o título do passo', /Passo 1\s+—\s+Abri a transacao/.test(xml));
  ok('e não há linha de anotação separada', !/<w:t>Abri a transacao[^<]*<\/w:t>/.test(xml.split('Passo 2')[0].replace(/Passo 1[^<]*/,'')));
}

console.log('\n[5] evidência: o prefixo e a hora voltam');
{
  await pg.selectOption('#modelo','evidencia');
  await pg.fill('#evCaso','UAT-4711');
  await pg.fill('#evInicio','2026-08-14T12:58:45');
  await pg.dispatchEvent('#evInicio','input');
  await pg.waitForTimeout(300);
  const dl=pg.waitForEvent('download',{timeout:60000});
  await pg.click('#go');
  const d=await dl;
  ok('prefixo de evidência no nome', d.suggestedFilename().startsWith('evidencia-UAT-4711'), d.suggestedFilename());
  await d.saveAs('/tmp/mod-ev.pdf');
  const txt=textoDoPdf('/tmp/mod-ev.pdf');
  ok('a hora de relógio voltou', /2026-08-14 12:58:4/.test(txt));
  ok('a anotação está numa linha própria, não no título', !/Passo 1  —  /.test(txt));
}

console.log('\n[6] os quatro modelos geram PDF e docx sem quebrar');
for (const m of ['ia','evidencia','tutorial','ata']) {
  await pg.selectOption('#modelo', m);
  await pg.waitForTimeout(150);
  const a=pg.waitForEvent('download',{timeout:60000}); await pg.click('#go'); const da=await a;
  const b=pg.waitForEvent('download',{timeout:60000}); await pg.click('#docx'); const db=await b;
  ok(`${m}: PDF e Word saíram`, !!da.suggestedFilename() && !!db.suggestedFilename(),
     da.suggestedFilename()+' / '+db.suggestedFilename());
}

ok('sem erro de JS', erros.length===0, erros.join(' | ').slice(0,300));
await br.close(); srv.close();
console.log(falhas?`\n${falhas} FALHA(S)`:'\nModelos de saída: tudo passou.');
process.exit(falhas?1:0);
