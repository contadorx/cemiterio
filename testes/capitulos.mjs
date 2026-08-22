/* Vários casos numa gravação, e o tempo gasto em cada um. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';
import { execSync } from 'child_process';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const html = fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
const srv = http.createServer((q,r)=>{ if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')} r.writeHead(200,{'Content-Type':'text/html'}); r.end(html); });
await new Promise(r=>srv.listen(8934,r));
const br = await chromium.launch({ executablePath:CHROME_WS });
let falhas = 0;
const ok = (n,c,e2)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e2?'  → '+e2:''));if(!c)falhas++};
const ctx = await br.newContext({ acceptDownloads:true, viewport:{width:1300,height:1000} });
const pg = await ctx.newPage();
const erros=[]; pg.on('pageerror', e=>erros.push(e.message));
await pg.route('**/jspdf**', r=>r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
await pg.goto('http://localhost:8934/app.html?lang=pt');
await pg.selectOption('#modelo','usabilidade');
await pg.setInputFiles('#file','/tmp/amostra.webm'); await pg.waitForTimeout(2500);
await pg.selectOption('#mode','count'); await pg.fill('#count','6');
await pg.locator('#extract').click();
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=6,null,{timeout:40000});
await pg.waitForTimeout(500);
for (let i=0;i<6;i++)
  await pg.locator('#thumbs figure').nth(i).locator('input.nota').fill('momento ' + (i+1));
await pg.waitForTimeout(300);

const marcar = async (i, nome) => {
  await pg.locator('#thumbs figure').nth(i).locator('.editar').click();
  await pg.waitForSelector('#lente:not(.hide)');
  await pg.waitForTimeout(250);
  await pg.fill('#lenteCap', nome);
  await pg.waitForTimeout(350);
  await pg.locator('#lenteFechar').click();
  await pg.waitForTimeout(300);
};

console.log('[1] sem fronteira marcada, nada muda');
ok('o resumo não aparece', await pg.locator('#capMsg').isHidden());
ok('nem o botão de separar', await pg.locator('#capPacote').isHidden());
{
  const dl = pg.waitForEvent('download',{timeout:40000});
  await pg.locator('#csv').click();
  const d = await dl; await d.saveAs('/tmp/semcap.csv');
  const csv = fs.readFileSync('/tmp/semcap.csv','utf8');
  ok('e a planilha não ganha coluna vazia de tarefa', !/Tempo na tarefa/.test(csv),
     csv.split('\r\n')[0].slice(0,90));
}

console.log('\n[2] marcar onde começa cada tarefa');
await marcar(0, 'Achar o produto');
await marcar(3, 'Pagar');
ok('o resumo apareceu', await pg.locator('#capMsg').isVisible());
{
  const txt = await pg.locator('#capMsg').textContent();
  console.log('     ' + txt.replace(/\s+/g,' '));
  ok('contando duas tarefas', /2 tarefa/.test(txt), txt.slice(0,40));
  ok('com o nome das duas', /Achar o produto/.test(txt) && /Pagar/.test(txt));
  ok('e um tempo para cada', (txt.match(/\d\d:\d\d/g)||[]).length === 2,
     (txt.match(/\d\d:\d\d/g)||[]).join(' '));
}
ok('a fileira mostra o selo da tarefa', (await pg.locator('.capSelo').count()) === 2,
   String(await pg.locator('.capSelo').count()));
ok('e ele diz o nome', /Achar o produto/.test(await pg.locator('.capSelo').first().textContent()));

console.log('\n[3] o tempo é até o começo da PRÓXIMA tarefa, não até o último passo dela');
{
  /* O tempo entre o último clique de uma tarefa e o primeiro da próxima é
     tempo gasto naquela tarefa — é onde a pessoa ficou procurando. */
  const nums = await pg.evaluate(() => {
    const t = [...document.querySelectorAll('#thumbs figure')].length;
    return { t };
  });
  const dl = pg.waitForEvent('download',{timeout:40000});
  await pg.locator('#csv').click();
  const d = await dl; await d.saveAs('/tmp/comcap.csv');
  const csv = fs.readFileSync('/tmp/comcap.csv','utf8');
  const linhas = csv.trim().split('\r\n');
  console.log('     ' + linhas[0].slice(0,120));
  ok('a planilha ganhou as duas colunas', /"Tarefa";"Tempo na tarefa"/.test(linhas[0]), linhas[0].slice(0,100));
  const col = linhas.slice(1).map(l => l.split(';').map(c=>c.replace(/^"|"$/g,'')));
  ok('a tarefa está em TODA linha, para dar para agrupar',
     col.every(c => c[3]), col.map(c=>c[3]).join('|'));
  ok('os três primeiros passos são da primeira tarefa',
     col.slice(0,3).every(c => c[3] === 'Achar o produto'), col.slice(0,3).map(c=>c[3]).join('|'));
  ok('e os três últimos, da segunda',
     col.slice(3).every(c => c[3] === 'Pagar'), col.slice(3).map(c=>c[3]).join('|'));
  const t1 = col[0][4], t2 = col[3][4];
  ok('os dois tempos são diferentes — não é a duração da gravação repetida',
     t1 !== t2, t1 + ' / ' + t2);
}

console.log('\n[4] o capítulo é título nos documentos');
{
  const dl = pg.waitForEvent('download',{timeout:40000});
  await pg.locator('#md').click();
  const d = await dl; await d.saveAs('/tmp/cap.md');
  const md = fs.readFileSync('/tmp/cap.md','utf8');
  const h2 = (md.match(/^## .*/gm)||[]);
  console.log('     ' + h2.join(' | ').slice(0,140));
  ok('as duas tarefas viraram título de nível 2', h2.length === 2, String(h2.length));
  ok('o passo desceu para o nível 3', (md.match(/^### /gm)||[]).length === 6,
     String((md.match(/^### /gm)||[]).length));
  ok('e o título traz o tempo da tarefa', /nesta tarefa/.test(h2[0]), h2[0]);
}
{
  const dl = pg.waitForEvent('download',{timeout:40000});
  await pg.locator('#html').click();
  const d = await dl; await d.saveAs('/tmp/cap.html');
  const h = fs.readFileSync('/tmp/cap.html','utf8');
  ok('o HTML também', (h.match(/class="cap"/g)||[]).length === 2,
     String((h.match(/class="cap"/g)||[]).length));
}
{
  const dl = pg.waitForEvent('download',{timeout:60000});
  await pg.locator('#go').click();
  const d = await dl; await d.saveAs('/tmp/cap.pdf');
  const txt = execSync('pdftotext /tmp/cap.pdf - 2>/dev/null || true',{encoding:'utf8'});
  ok('o PDF traz o nome das tarefas', /Achar o produto/.test(txt) && /Pagar/.test(txt),
     (txt.match(/Achar[^\n]*/)||[''])[0]);
}

console.log('\n[5] um documento por tarefa, num pacote só');
ok('o botão apareceu com duas tarefas', await pg.locator('#capPacote').isVisible());
{
  const dl = pg.waitForEvent('download',{timeout:60000});
  await pg.locator('#capPacote').click();
  const d = await dl; await d.saveAs('/tmp/tarefas.zip');
  const lista = execSync('unzip -Z1 /tmp/tarefas.zip',{encoding:'utf8'}).trim().split('\n');
  console.log('     ' + lista.join('  '));
  ok('seis arquivos: duas tarefas × três formatos', lista.length === 6, String(lista.length));
  ok('e o nome de cada um é o da tarefa',
     lista.some(x=>/Achar-o-produto/i.test(x)) && lista.some(x=>/Pagar/i.test(x)), lista.join(' '));
  const um = execSync('unzip -p /tmp/tarefas.zip "*Achar*md"',{encoding:'utf8'});
  ok('o documento da primeira tarefa tem só os passos dela',
     (um.match(/momento \d/g)||[]).length === 3, (um.match(/momento \d/g)||[]).join(','));
  ok('e não tem os da outra', !/momento 5/.test(um));
}
console.log('\n[6] e a tela volta como estava');
ok('os seis quadros continuam mantidos',
   (await pg.locator('#thumbs figure:not(.off)').count()) === 6,
   String(await pg.locator('#thumbs figure:not(.off)').count()));
ok('o caso de teste não ficou com o nome da última tarefa',
   (await pg.locator('#evCaso').inputValue()) === '', await pg.locator('#evCaso').inputValue());

console.log('\n[7] apagar a fronteira desfaz o capítulo');
await marcar(3, '');
ok('sobrou uma tarefa', /1 tarefa/.test(await pg.locator('#capMsg').textContent()),
   await pg.locator('#capMsg').textContent());
ok('e o botão de separar sumiu — uma tarefa só não se separa em nada',
   await pg.locator('#capPacote').isHidden());

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0,200));
await br.close(); srv.close();
console.log(falhas ? '\n'+falhas+' falha(s)' : '\nCapítulos: tudo passou.');
process.exit(falhas?1:0);
