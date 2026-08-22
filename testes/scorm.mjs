/* O pacote SCORM: manifesto, conteúdo e o aviso de conclusão. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';
import { execSync } from 'child_process';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const html = fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
const srv = http.createServer((q,r)=>{ if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')} r.writeHead(200,{'Content-Type':'text/html'}); r.end(html); });
await new Promise(r=>srv.listen(8924,r));
const br = await chromium.launch({ executablePath:CHROME_WS });
let falhas = 0;
const ok = (n,c,e2)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e2?'  → '+e2:''));if(!c)falhas++};
const ctx = await br.newContext({ acceptDownloads:true, viewport:{width:1250,height:950} });
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', e=>erros.push(e.message));
await pg.route('**/jspdf**', r=>r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
await pg.goto('http://localhost:8924/app.html?lang=pt');
await pg.waitForTimeout(400);

console.log('[1] o botão só existe onde faz sentido');
ok('escondido no contexto para IA', await pg.locator('#scorm').isHidden());
await pg.selectOption('#modelo','evidencia'); await pg.waitForTimeout(200);
ok('escondido na evidência — ninguém "conclui" uma evidência', await pg.locator('#scorm').isHidden());
await pg.selectOption('#modelo','tutorial'); await pg.waitForTimeout(200);
ok('aparece no passo a passo', await pg.locator('#scorm').isVisible());

console.log('\n[2] gerar o pacote');
await pg.setInputFiles('#file','/tmp/amostra.webm'); await pg.waitForTimeout(2500);
await pg.selectOption('#mode','count'); await pg.fill('#count','2');
await pg.locator('#extract').click();
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=2,null,{timeout:40000});
await pg.locator('#evBox').evaluate(e=>e.open=true);
await pg.fill('#evCaso','Lançar pedido de compra');
await pg.waitForTimeout(250);
const dl = pg.waitForEvent('download',{timeout:40000});
await pg.locator('#scorm').click();
const d = await dl; await d.saveAs('/tmp/scorm.zip');
ok('o arquivo saiu', fs.existsSync('/tmp/scorm.zip'));
ok('e a mensagem diz quem registra',
   /registra quem concluiu/.test(await pg.locator('#pdfStatus').textContent()),
   (await pg.locator('#pdfStatus').textContent()).slice(0,50));

console.log('\n[3] o que tem dentro');
const lista = execSync('unzip -Z1 /tmp/scorm.zip', {encoding:'utf8'}).trim().split('\n');
console.log('     ' + lista.join('  '));
ok('imsmanifest.xml', lista.includes('imsmanifest.xml'));
ok('index.html', lista.includes('index.html'));
ok('scorm.js', lista.includes('scorm.js'));
const man = execSync('unzip -p /tmp/scorm.zip imsmanifest.xml', {encoding:'utf8'});
ok('o manifesto declara SCORM 1.2', /<schemaversion>1\.2<\/schemaversion>/.test(man));
ok('e o tipo sco (é rastreável, não só um arquivo)', /adlcp:scormtype="sco"/.test(man));
ok('o título é o do documento', /Lançar pedido de compra/.test(man), (man.match(/<title>[^<]*/)||[''])[0]);
ok('o identificador não tem espaço', /identifier="WS-[A-Za-z0-9_-]+"/.test(man),
   (man.match(/identifier="[^"]*"/)||[''])[0]);
ok('os dois arquivos estão declarados no recurso',
   /<file href="index\.html"\/>/.test(man) && /<file href="scorm\.js"\/>/.test(man));

const idx = execSync('unzip -p /tmp/scorm.zip index.html', {encoding:'utf8'});
ok('o conteúdo é o HTML autocontido', /<img src="data:image\/jpeg/.test(idx));
ok('e ele chama o scorm.js', /<script src="scorm\.js"><\/script>/.test(idx));
const js = execSync('unzip -p /tmp/scorm.zip scorm.js', {encoding:'utf8'});
ok('o js marca completed', /lesson_status','completed'/.test(js));

console.log('\n[4] fora de um LMS o documento continua valendo');
{
  /* Um pacote que quebra quando aberto direto é um pacote que ninguém confere
     antes de subir. */
  const dir = '/tmp/scorm-aberto';
  execSync(`rm -rf ${dir} && mkdir -p ${dir} && unzip -qo /tmp/scorm.zip -d ${dir}`);
  const pg2 = await ctx.newPage();
  const e2 = []; pg2.on('pageerror', e=>e2.push(e.message));
  await pg2.goto('file://' + dir + '/index.html');
  await pg2.waitForTimeout(500);
  ok('abre sem erro nenhum', e2.length === 0, e2.join(' | ').slice(0,140));
  ok('e mostra os passos', (await pg2.locator('section.passo').count()) === 2);
  await pg2.close();
}

console.log('\n[5] dentro de um LMS de mentira, ele avisa a conclusão');
{
  const dir = '/tmp/scorm-aberto';
  const pg3 = await ctx.newPage();
  await pg3.addInitScript(() => {
    window.__chamadas = [];
    window.API = {
      LMSInitialize: v => { window.__chamadas.push('init'); return 'true'; },
      LMSSetValue: (k,v) => { window.__chamadas.push(k + '=' + v); return 'true'; },
      LMSCommit: () => { window.__chamadas.push('commit'); return 'true'; },
      LMSFinish: () => { window.__chamadas.push('finish'); return 'true'; },
      LMSGetValue: () => '', LMSGetLastError: () => '0'
    };
  });
  await pg3.goto('file://' + dir + '/index.html');
  await pg3.waitForTimeout(400);
  const ch = await pg3.evaluate(() => window.__chamadas);
  console.log('     ' + ch.join(' → '));
  ok('inicializou a sessão', ch.includes('init'));
  ok('marcou como concluído', ch.includes('cmi.core.lesson_status=completed'));
  ok('e gravou', ch.includes('commit'));
  await pg3.close();
}

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0,180));
await br.close(); srv.close();
console.log(falhas ? '\n'+falhas+' falha(s)' : '\nPacote SCORM: tudo passou.');
process.exit(falhas?1:0);
