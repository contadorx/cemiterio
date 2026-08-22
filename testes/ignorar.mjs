/* A faixa ignorada na detecção: o relógio da barra de tarefas parando de gerar
   quadro repetido — sem sumir do documento. */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const html = fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
const srv = http.createServer((q,r)=>{ if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')} r.writeHead(200,{'Content-Type':'text/html'}); r.end(html); });
await new Promise(r=>srv.listen(8926,r));
const br = await chromium.launch({ executablePath:CHROME_WS });
let falhas = 0;
const ok = (n,c,e2)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e2?'  → '+e2:''));if(!c)falhas++};
const ctx = await br.newContext({ acceptDownloads:true, viewport:{width:1250,height:950} });

async function varrer(ignorar){
  const pg = await ctx.newPage();
  const erros=[]; pg.on('pageerror', e=>erros.push(e.message));
  await pg.route('**/jspdf**', r=>r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
  await pg.goto('http://localhost:8926/app.html?lang=pt');
  // o cenário de uso passou a ser obrigatório: sem ele o Gravar e o envio de vídeo cobram a escolha
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  await pg.setInputFiles('#file','/tmp/so-relogio.webm'); await pg.waitForTimeout(2500);
  await pg.selectOption('#mode','scene');
  await pg.selectOption('#ignorar', ignorar);
  await pg.locator('#extract').click();
  await pg.waitForSelector('#prevCard:not(.hide)',{timeout:40000});
  await pg.waitForFunction(()=>!document.getElementById('extract').disabled,null,{timeout:60000});
  await pg.waitForTimeout(400);
  const n = await pg.locator('#thumbs figure').count();
  /* As medidas saem DAQUI, da aba que ainda está aberta, e não do `src` levado
     para outra aba. Enquanto a imagem era um `data:`, uma string atravessava
     abas sem reclamar; agora ela é um `blob:`, que só existe no documento que o
     criou — carregá-lo noutra aba não falha, fica pendurado para sempre, e o
     teste morre com "promise was garbage collected", que não conta nada.
     Medir onde a imagem mora é o que sempre foi o certo. */
  const dim = await pg.evaluate(() => {
    const im = document.querySelector('#thumbs figure img');
    return im ? { w: im.naturalWidth, h: im.naturalHeight } : null;
  });
  await pg.close();
  return { n, dim, erros };
}

console.log('[1] um vídeo em que SÓ o relógio da barra de baixo muda');
const inteira = await varrer('nada');
console.log('     tela inteira conta : ' + inteira.n + ' quadros');
const semBarra = await varrer('baixo');
console.log('     ignorando a barra  : ' + semBarra.n + ' quadros');
ok('sem ignorar, o relógio vira quadro repetido', inteira.n >= 3, inteira.n + ' quadros');
ok('ignorando a barra, quase tudo some', semBarra.n < inteira.n,
   semBarra.n + ' < ' + inteira.n);
ok('mas ainda sobra o primeiro quadro — a tela existiu', semBarra.n >= 1, semBarra.n + '');
ok('sem erro de JS', inteira.erros.length === 0 && semBarra.erros.length === 0);

console.log('\n[2] a faixa ignorada NÃO some do documento');
{
  /* Quem revisa uma evidência quer ver a barra de tarefas; só não quer que ela
     decida o que é passo. */
  const alturaImg = semBarra.dim;
  console.log('     imagem exportada: ' + alturaImg.w + '×' + alturaImg.h);
  ok('a proporção continua a do vídeo (16:9), sem recorte',
     Math.abs(alturaImg.w / alturaImg.h - 960/540) < 0.02,
     (alturaImg.w/alturaImg.h).toFixed(3));
}

console.log('\n[3] o padrão é ignorar a barra de baixo');
{
  const fonte = fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
  ok('vem marcado "a barra de baixo"', /<option value="baixo" selected/.test(fonte));
  ok('e o texto explica que é só a detecção',
     /barra de baixo \(relógio do Windows\)/.test(fonte));
}

await br.close(); srv.close();
console.log(falhas ? '\n'+falhas+' falha(s)' : '\nIgnorar região: tudo passou.');
process.exit(falhas?1:0);
