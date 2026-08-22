/* Consolidar N sessões num documento só. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const html = fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
const srv = http.createServer((q,r)=>{ if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')} r.writeHead(200,{'Content-Type':'text/html'}); r.end(html); });
await new Promise(r=>srv.listen(8937,r));
const br = await chromium.launch({ executablePath:CHROME_WS });
let falhas = 0;
const ok = (n,c,e2)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e2?'  → '+e2:''));if(!c)falhas++};
const ctx = await br.newContext({ acceptDownloads:true, viewport:{width:1300,height:1000} });
const pg = await ctx.newPage();
const erros=[]; pg.on('pageerror', e=>erros.push(e.message));
await pg.route('**/jspdf**', r=>r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
await pg.goto('http://localhost:8937/app.html?lang=pt');

/* Três sessões, cada uma exportada como o produto exporta. */
console.log('[1] gerar três sessões de participantes diferentes');
for (const [cod, quantos] of [['P01',3],['P02',2],['P03',3]]) {
  await pg.selectOption('#modelo','usabilidade');
  await pg.setInputFiles('#file','/tmp/amostra.webm'); await pg.waitForTimeout(2500);
  await pg.selectOption('#mode','count'); await pg.fill('#count', String(quantos));
  await pg.locator('#extract').click();
  await pg.waitForFunction(n=>document.querySelectorAll('#thumbs figure').length>=n, quantos,{timeout:40000});
  await pg.waitForTimeout(400);
  await pg.fill('#tr', `WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nfala do ${cod}`);
  await pg.dispatchEvent('#tr','input');
  for (let i=0;i<quantos;i++)
    await pg.locator('#thumbs figure').nth(i).locator('input.nota').fill(`${cod} momento ${i+1}`);
  await pg.locator('#evBox').evaluate(e=>e.open=true);
  await pg.fill('#evChamado', cod);
  await pg.fill('#evCaso','Estudo de checkout');
  await pg.waitForTimeout(300);
  const dl = pg.waitForEvent('download',{timeout:40000});
  await pg.locator('#json').click();
  const d = await dl; await d.saveAs('/tmp/sessao-' + cod + '.json');
  ok('sessão ' + cod + ' exportada', fs.existsSync('/tmp/sessao-' + cod + '.json'));
}

console.log('\n[2] um arquivo só é recusado com o motivo certo');
await pg.reload(); await pg.waitForTimeout(600);
await pg.setInputFiles('#reabrirArq', ['/tmp/sessao-P01.json']);
await pg.waitForTimeout(700);
/* Um botão só: um arquivo abre, dois ou mais juntam. A decisão saiu da tela e
   virou consequência do que a pessoa selecionou. */
ok('um arquivo só abre normalmente, sem virar consolidado',
   !/sessões juntadas/.test(await pg.locator('#reabrirMsg').textContent()),
   (await pg.locator('#reabrirMsg').textContent()).slice(0,60));

console.log('\n[3] juntar as três');
await pg.setInputFiles('#reabrirArq',
  ['/tmp/sessao-P03.json','/tmp/sessao-P01.json','/tmp/sessao-P02.json']);
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=8,null,{timeout:40000});
await pg.waitForTimeout(800);
{
  const msg = await pg.locator('#reabrirMsg').textContent();
  console.log('     ' + msg.replace(/\s+/g,' ').slice(0,150));
  ok('diz quantas sessões e quantos quadros', /3 sessões juntadas, 8 quadros/.test(msg), msg.slice(0,60));
  ok('e avisa que a hora de relógio saiu', /hora de relógio saiu/.test(msg));
}
ok('os oito quadros estão na fileira', (await pg.locator('#thumbs figure').count()) === 8,
   String(await pg.locator('#thumbs figure').count()));
{
  const selos = await pg.locator('.capSelo').allTextContents();
  console.log('     capítulos: ' + selos.join(' | '));
  ok('cada sessão virou uma tarefa', selos.length === 3, selos.join(','));
  ok('nomeadas pelo código do participante, não pelo arquivo',
     JSON.stringify(selos) === JSON.stringify(['P01','P02','P03']), selos.join(','));
}
{
  const resumo = await pg.locator('#capMsg').textContent();
  console.log('     ' + resumo.replace(/\s+/g,' '));
  ok('o resumo traz as três com o tempo de cada uma',
     (resumo.match(/\d\d:\d\d/g)||[]).length === 3, resumo);
}

console.log('\n[4] a ordem é a do nome do arquivo, não a da bandeja');
{
  /* Entreguei P03, P01, P02 de propósito. Quem nomeia P01..P05 espera essa
     ordem no documento, e a ordem de um input multiple não é garantida. */
  const notas = await pg.locator('#thumbs input.nota').evaluateAll(i=>i.map(x=>x.value));
  ok('o documento começa no P01', /^P01/.test(notas[0]), notas[0]);
  ok('e termina no P03', /^P03/.test(notas[notas.length-1]), notas[notas.length-1]);
}

console.log('\n[5] a hora de relógio não é inventada');
ok('o campo de início ficou vazio', (await pg.locator('#evInicio').inputValue()) === '',
   await pg.locator('#evInicio').inputValue());
{
  const dl = pg.waitForEvent('download',{timeout:40000});
  await pg.locator('#md').click();
  const d = await dl; await d.saveAs('/tmp/junto.md');
  const md = fs.readFileSync('/tmp/junto.md','utf8');
  ok('o documento se declara consolidado', /Documento consolidado/.test(md),
     (md.match(/Documento consolidado[^\n]*/)||[''])[0].slice(0,80));
  ok('dizendo quantas sessões', /3 sessões diferentes/.test(md));
  ok('as três tarefas viraram título', (md.match(/^## P0\d/gm)||[]).length === 3,
     (md.match(/^## P0\d/gm)||[]).join(','));
  ok('os oito momentos estão lá', (md.match(/^### /gm)||[]).length === 8,
     String((md.match(/^### /gm)||[]).length));
  ok('e nenhum passo carrega hora de parede',
     !/\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/.test(md.split('## P01')[1] || ''),
     (md.match(/\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/)||[''])[0]);
}

console.log('\n[6] a fala de cada sessão veio junto, no lugar dela');
{
  const tr = await pg.locator('#tr').inputValue();
  ok('as três falas estão na transcrição',
     /fala do P01/.test(tr) && /fala do P02/.test(tr) && /fala do P03/.test(tr));
  const tempos = [...tr.matchAll(/(\d\d:\d\d:\d\d\.\d\d\d) -->/g)].map(m=>m[1]);
  console.log('     ' + tempos.join(' '));
  ok('deslocadas, não empilhadas em zero', new Set(tempos).size === 3, tempos.join(','));
  ok('e em ordem crescente', tempos.join('') === [...tempos].sort().join(''), tempos.join(','));
}
{
  const dl = pg.waitForEvent('download',{timeout:40000});
  await pg.locator('#csv').click();
  const d = await dl; await d.saveAs('/tmp/junto.csv');
  const csv = fs.readFileSync('/tmp/junto.csv','utf8');
  const linhas = csv.trim().split('\r\n').slice(1).map(l=>l.split(';').map(c=>c.replace(/^"|"$/g,'')));
  ok('a planilha tem uma linha por quadro', linhas.length === 8, String(linhas.length));
  ok('com a sessão em toda linha', linhas.every(c=>/^P0\d$/.test(c[3])), linhas.map(c=>c[3]).join(''));
  /* Duas sessões podem durar o mesmo — o que não pode é alguma durar zero, que
     era o defeito: sem vídeo no elemento, a duração total voltava 0 e a última
     sessão saía com 00:00. */
  const porSessao = {};
  linhas.forEach(c => { porSessao[c[3]] = c[4]; });
  console.log('     ' + JSON.stringify(porSessao));
  ok('as três sessões têm tempo', Object.keys(porSessao).length === 3, JSON.stringify(porSessao));
  ok('e nenhuma delas dura zero — inclusive a última',
     Object.values(porSessao).every(v => v && v !== '00:00'), JSON.stringify(porSessao));
  ok('a coluna de hora de relógio saiu vazia', linhas.every(c=>!c[2]), linhas[0].join('|'));
}

console.log('\n[7] arquivo ilegível no meio não derruba o resto');
{
  fs.writeFileSync('/tmp/sessao-ruim.json','{isto nao e json}');
  await pg.setInputFiles('#reabrirArq',
    ['/tmp/sessao-P01.json','/tmp/sessao-ruim.json','/tmp/sessao-P02.json']);
  await pg.waitForTimeout(2500);
  const msg = await pg.locator('#reabrirMsg').textContent();
  console.log('     ' + msg.replace(/\s+/g,' ').slice(0,140));
  ok('as duas boas entraram', /2 sessões juntadas/.test(msg), msg.slice(0,50));
  ok('e o pulado é dito, não engolido', /1 arquivo\(s\) não deram para ler/.test(msg), msg.slice(-60));
}

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0,200));
await br.close(); srv.close();
console.log(falhas ? '\n'+falhas+' falha(s)' : '\nJuntar sessões: tudo passou.');
process.exit(falhas?1:0);
