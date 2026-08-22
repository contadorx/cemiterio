/* Saída em PowerPoint: um deck que abre de verdade.

   Um .pptx só existe se o pacote OOXML estiver completo — falta o theme1.xml e o
   PowerPoint recusa o arquivo inteiro com "precisa ser reparado". Por isso o
   teste confere a lista de peças antes de olhar o conteúdo. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';
import { execSync } from 'child_process';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const html = fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
const srv = http.createServer((q,r)=>{ if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')} r.writeHead(200,{'Content-Type':'text/html'}); r.end(html); });
await new Promise(r=>srv.listen(8931,r));
const br = await chromium.launch({ executablePath:CHROME_WS });
let falhas = 0;
const ok = (n,c,e2)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e2?'  → '+e2:''));if(!c)falhas++};
const ctx = await br.newContext({ acceptDownloads:true, viewport:{width:1300,height:1000} });
const pg = await ctx.newPage();
const erros=[]; pg.on('pageerror', e=>erros.push(e.message));
await pg.route('**/jspdf**', r=>r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
await pg.goto('http://localhost:8931/app.html?lang=pt');
await pg.selectOption('#modelo','tutorial');
await pg.setInputFiles('#file','/tmp/amostra.webm'); await pg.waitForTimeout(2500);
await pg.selectOption('#mode','count'); await pg.fill('#count','3');
await pg.locator('#extract').click();
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=3,null,{timeout:40000});
await pg.waitForTimeout(400);
await pg.fill('#tr','WEBVTT\n\n00:00:00.000 --> 00:00:09.000\nAbri a transacao e informei o fornecedor');
await pg.dispatchEvent('#tr','input');
for (let i=0;i<3;i++)
  await pg.locator('#thumbs figure').nth(i).locator('input.nota').fill('passo ' + (i+1) + ' da instrucao');
await pg.locator('#evBox').evaluate(e=>e.open=true);
await pg.fill('#evCaso','Lancar pedido de compra');
await pg.waitForTimeout(300);

console.log('[1] o botão está na fila das saídas');
ok('existe', (await pg.locator('#pptx').count()) === 1);
ok('visível', await pg.locator('#pptx').isVisible());
ok('e diz PowerPoint, não "pptx"', /PowerPoint/.test(await pg.locator('#pptx').textContent()),
   await pg.locator('#pptx').textContent());

console.log('\n[2] o pacote sai e está completo');
{
  const dl = pg.waitForEvent('download',{timeout:60000});
  await pg.locator('#pptx').click();
  const d = await dl; await d.saveAs('/tmp/deck.pptx');
  ok('a extensão é .pptx', /\.pptx$/.test(d.suggestedFilename()), d.suggestedFilename());
  ok('o arquivo existe e não é vazio', fs.statSync('/tmp/deck.pptx').size > 20000,
     String(fs.statSync('/tmp/deck.pptx').size));
  const lista = execSync('unzip -Z1 /tmp/deck.pptx',{encoding:'utf8'}).trim().split('\n');
  /* As peças sem as quais o PowerPoint recusa o arquivo. */
  for (const peca of ['[Content_Types].xml','_rels/.rels','ppt/presentation.xml',
                      'ppt/_rels/presentation.xml.rels','ppt/theme/theme1.xml',
                      'ppt/slideMasters/slideMaster1.xml','ppt/slideLayouts/slideLayout1.xml'])
    ok('tem ' + peca, lista.includes(peca));
  const slides = lista.filter(x=>/^ppt\/slides\/slide\d+\.xml$/.test(x));
  ok('quatro slides: a capa mais os três passos', slides.length === 4, slides.join(' '));
  const midia = lista.filter(x=>/^ppt\/media\//.test(x));
  ok('e uma imagem por passo', midia.length === 3, midia.join(' '));
  ok('cada slide tem o seu .rels',
     lista.filter(x=>/^ppt\/slides\/_rels\//.test(x)).length === 4);
}

console.log('\n[3] o conteúdo chegou nos slides');
{
  const capa = execSync('unzip -p /tmp/deck.pptx ppt/slides/slide1.xml',{encoding:'utf8'});
  ok('a capa traz o caso', /Lancar pedido de compra/.test(capa),
     (capa.match(/<a:t>[^<]{5,40}<\/a:t>/g)||[]).slice(0,3).join(' '));
  const s2 = execSync('unzip -p /tmp/deck.pptx ppt/slides/slide2.xml',{encoding:'utf8'});
  ok('o primeiro passo tem o título numerado', /Passo 1/.test(s2),
     (s2.match(/<a:t>[^<]*<\/a:t>/g)||[])[0]);
  ok('e a anotação do usuário', /passo 1 da instrucao/.test(s2));
  ok('a imagem entra como imagem, não como texto', /<p:pic>/.test(s2));
  {
    /* Um rId solto é o defeito clássico do OOXML escrito à mão: o slide abre,
       a imagem não aparece, e ninguém sabe por quê. */
    const rid = (s2.match(/r:embed="(rId\d+)"/)||[])[1];
    const rels = execSync('unzip -p /tmp/deck.pptx ppt/slides/_rels/slide2.xml.rels',{encoding:'utf8'});
    ok('a imagem aponta para um rId declarado no rels do slide',
       !!rid && new RegExp(`Id="${rid}"[^>]*relationships/image`).test(rels), rid);
    const noPacote = execSync('unzip -Z1 /tmp/deck.pptx',{encoding:'utf8'}).trim().split('\n');
    ok('e o alvo é um arquivo que está mesmo no pacote',
       noPacote.includes('ppt/media/' + (rels.match(/media\/([^"]+)/)||[])[1]),
       (rels.match(/media\/([^"]+)/)||[])[1]);
  }
  const s4 = execSync('unzip -p /tmp/deck.pptx ppt/slides/slide4.xml',{encoding:'utf8'});
  ok('o último passo é o 3', /Passo 3/.test(s4));
}

console.log('\n[4] o XML é bem formado — é isso que o PowerPoint valida primeiro');
{
  const nomes = execSync('unzip -Z1 /tmp/deck.pptx',{encoding:'utf8'}).trim().split('\n')
                .filter(x=>/\.xml$|\.rels$/.test(x));
  let ruins = [];
  for (const n of nomes) {
    /* Os colchetes de [Content_Types].xml são glob para o unzip. */
    const alvo = n.replace(/[[\]]/g, c => '\\' + c);
    try { execSync(`unzip -p /tmp/deck.pptx "${alvo}" | python3 -c "import sys,xml.dom.minidom as m; m.parseString(sys.stdin.buffer.read())"`,
                   {stdio:['pipe','pipe','pipe']}); }
    catch(e) { ruins.push(n); }
  }
  ok('todos os ' + nomes.length + ' XMLs abrem no parser', ruins.length === 0, ruins.join(' '));
}

console.log('\n[5] o texto do usuário não quebra o XML');
{
  await pg.locator('#thumbs figure').nth(0).locator('input.nota')
     .fill('use "aspas" & <tags> no campo — a nota do passo 1');
  await pg.waitForTimeout(300);
  const dl = pg.waitForEvent('download',{timeout:60000});
  await pg.locator('#pptx').click();
  const d = await dl; await d.saveAs('/tmp/deck2.pptx');
  const s2 = execSync('unzip -p /tmp/deck2.pptx ppt/slides/slide2.xml',{encoding:'utf8'});
  ok('o & virou &amp;', /&amp;/.test(s2));
  ok('e a tag não virou tag de verdade', /&lt;tags&gt;/.test(s2));
  try {
    execSync(`unzip -p /tmp/deck2.pptx ppt/slides/slide2.xml | python3 -c "import sys,xml.dom.minidom as m; m.parseString(sys.stdin.buffer.read())"`,
             {stdio:['pipe','pipe','pipe']});
    ok('o slide continua bem formado', true);
  } catch(e) { ok('o slide continua bem formado', false, String(e).slice(0,80)); }
}

console.log('\n[6] a tarja é queimada no slide, como nas outras saídas');
{
  /* Se o PowerPoint recebesse a imagem original e a tarja só como um retângulo
     por cima, qualquer um arrastaria o retângulo e leria o dado. */
  await pg.locator('#thumbs figure').nth(1).locator('.editar').click();
  await pg.waitForSelector('#lente:not(.hide)');
  await pg.waitForTimeout(400);
  await pg.locator('#tarjaModo').click();
  await pg.waitForTimeout(200);
  const b = await pg.locator('#lenteImgCx').boundingBox();
  await pg.mouse.move(b.x + b.width*0.20, b.y + b.height*0.25);
  await pg.mouse.down();
  for (let i=1;i<=8;i++)
    await pg.mouse.move(b.x + b.width*(0.20 + 0.35*i/8), b.y + b.height*(0.25 + 0.25*i/8));
  await pg.mouse.up();
  await pg.waitForTimeout(300);
  const n = await pg.locator('#lenteTarjas i').count();
  await pg.locator('#lenteFechar').click(); await pg.waitForTimeout(300);
  ok('desenhei uma tarja no passo 2', n >= 1, String(n));
  const dl = pg.waitForEvent('download',{timeout:60000});
  await pg.locator('#pptx').click();
  const d = await dl; await d.saveAs('/tmp/deck3.pptx');
  const bytes = (arq) => execSync(`unzip -p ${arq} ppt/media/img0002.jpg | wc -c`,
                                  {encoding:'utf8',shell:'/bin/bash'}).trim();
  ok('a imagem do slide mudou — a tarja foi queimada nela',
     bytes('/tmp/deck2.pptx') !== bytes('/tmp/deck3.pptx'),
     bytes('/tmp/deck2.pptx') + ' → ' + bytes('/tmp/deck3.pptx'));
  {
    /* E o preto tem de estar nos pixels do JPEG que foi para o slide, não num
       retângulo por cima que qualquer um arrasta. */
    execSync('unzip -o -p /tmp/deck3.pptx ppt/media/img0002.jpg > /tmp/slide2.jpg', {shell:'/bin/bash'});
    const saida = execSync(`python3 - <<'PY'
from PIL import Image
im = Image.open('/tmp/slide2.jpg').convert('RGB')
px = im.load(); n = 0
for y in range(0, im.height, 3):
  for x in range(0, im.width, 3):
    r,g,b = px[x,y]
    if r < 24 and g < 24 and b < 24: n += 1
print(n)
PY`, {encoding:'utf8', shell:'/bin/bash'}).trim();
    ok('o preto da tarja está nos pixels da imagem do slide', Number(saida) > 200, saida);
  }
}

console.log('\n[7] a mensagem conta o que saiu');
ok('e ela fala em slides', /slides/.test(await pg.locator('#pdfStatus').textContent()),
   (await pg.locator('#pdfStatus').textContent()).slice(0,90));

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0,180));
await br.close(); srv.close();
console.log(falhas ? '\n'+falhas+' falha(s)' : '\nPowerPoint: tudo passou.');
process.exit(falhas?1:0);
