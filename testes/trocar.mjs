/* Trocar a imagem de um passo e duplicar um quadro. */
import { chromium } from './_navegador.mjs';   // abre os painéis e a gaveta das saídas
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const html = fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
const srv = http.createServer((q,r)=>{ if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')} r.writeHead(200,{'Content-Type':'text/html'}); r.end(html); });
await new Promise(r=>srv.listen(8923,r));
const br = await chromium.launch({ executablePath:CHROME_WS });
let falhas = 0;
const ok = (n,c,e2)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e2?'  → '+e2:''));if(!c)falhas++};
const ctx = await br.newContext({ acceptDownloads:true, viewport:{width:1250,height:950} });
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', e=>erros.push(e.message));
await pg.route('**/jspdf**', r=>r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
await pg.goto('http://localhost:8923/app.html?lang=pt');
await pg.selectOption('#modelo','tutorial');
await pg.setInputFiles('#file','/tmp/amostra.webm'); await pg.waitForTimeout(2500);
await pg.selectOption('#mode','count'); await pg.fill('#count','3');
await pg.locator('#extract').click();
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=3,null,{timeout:40000});
await pg.waitForTimeout(400);

console.log('[1] trocar a imagem do passo 2');
await pg.locator('#thumbs figure').nth(1).locator('input.nota').fill('acesse a transacao');
await pg.locator('#thumbs figure').nth(1).locator('.editar').click();
await pg.waitForSelector('#lente:not(.hide)');
const antes = await pg.locator('#lenteImg').getAttribute('src');
ok('o botão existe na lente', await pg.locator('#trocarImg').isVisible());
await pg.setInputFiles('#trocarArq', `${RAIZ_WS}/public/apple-touch-icon.png`);
await pg.waitForTimeout(700);
const depois = await pg.locator('#lenteImg').getAttribute('src');
ok('a imagem mudou', antes !== depois);
/* Antes: `/^data:image\/jpeg/`. Aquilo afirmava o CODIFICADOR de dentro, e não
   a promessa — que é "o arquivo que entrou não sobreviveu como veio". Um PNG de
   quatro megabytes guardado do jeito que chegou vira um documento que ninguém
   manda por e-mail, e é disso que este passo trata. A pergunta agora é feita
   sobre o que ficou guardado. */
{
  const guardado = await pg.evaluate(async () => {
    const b = await (await fetch(document.getElementById('lenteImg').src)).blob();
    return { tipo: b.type, bytes: b.size };
  });
  ok('e continua sendo imagem NOSSA, recodificada — o PNG que entrou não sobreviveu',
     guardado.tipo !== 'image/png' && /^image\//.test(guardado.tipo),
     guardado.tipo + '  ' + guardado.bytes + ' B');
}
ok('a mensagem explica o que foi junto',
   /apontavam para pixels/.test(await pg.locator('#tarjaMsg').textContent()),
   (await pg.locator('#tarjaMsg').textContent()).slice(0,50));
ok('a anotação do passo NÃO foi embora',
   (await pg.locator('#lenteNota').inputValue()) === 'acesse a transacao',
   await pg.locator('#lenteNota').inputValue());
ok('e o instante também não',
   /00:0/.test(await pg.locator('#lenteTit').textContent()), await pg.locator('#lenteTit').textContent());

console.log('\n[2] duplicar este passo');
await pg.locator('#duplicar').click();
await pg.waitForTimeout(500);
ok('virou quatro quadros', (await pg.locator('#thumbs figure').count()) === 4);
ok('a cópia ficou logo depois', (await pg.locator('#lenteTit').textContent()).includes('3'),
   await pg.locator('#lenteTit').textContent());
ok('e a lente foi junto para a cópia',
   (await pg.locator('#lenteNota').inputValue()) === 'acesse a transacao');
await pg.locator('#lenteFechar').click(); await pg.waitForTimeout(300);
ok('a linha de aviso conta o que houve', /duplicado/.test(await pg.locator('#movMsg').textContent()),
   await pg.locator('#movMsg').textContent());

console.log('\n[3] a numeração e o documento acompanham');
{
  const caps = await pg.locator('#thumbs figcaption .passo').allTextContents();
  ok('quatro passos numerados em sequência',
     JSON.stringify(caps) === JSON.stringify(['Passo 1','Passo 2','Passo 3','Passo 4']), caps.join(','));
  const dl = pg.waitForEvent('download',{timeout:40000});
  await pg.locator('#md').click();
  const d = await dl; await d.saveAs('/tmp/trocar.md');
  const md = fs.readFileSync('/tmp/trocar.md','utf8');
  ok('a anotação aparece duas vezes — é o mesmo passo provado duas vezes',
     (md.match(/acesse a transacao/g) || []).length === 2,
     String((md.match(/acesse a transacao/g)||[]).length));
}
ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0,180));
await br.close(); srv.close();
console.log(falhas ? '\n'+falhas+' falha(s)' : '\nTrocar e duplicar: tudo passou.');
process.exit(falhas?1:0);
