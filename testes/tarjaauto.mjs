/* Tarjar de uma vez o que o aviso de dado sensível encontrou.

   O Tesseract vem de uma CDN que não é alcançável daqui, então o resultado do
   OCR entra pela porta pública que existe para isso: um documento reaberto, com
   `textoNaTela` e `palavrasNaTela` — exatamente os campos que o próprio produto
   grava quando o leitor roda de verdade. */
import { chromium } from './_navegador.mjs';   // abre os painéis e a gaveta das saídas
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const html = fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
const srv = http.createServer((q,r)=>{ if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')} r.writeHead(200,{'Content-Type':'text/html'}); r.end(html); });
await new Promise(r=>srv.listen(8927,r));
const br = await chromium.launch({ executablePath:CHROME_WS });
let falhas = 0;
const ok = (n,c,e2)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e2?'  → '+e2:''));if(!c)falhas++};
const ctx = await br.newContext({ acceptDownloads:true, viewport:{width:1250,height:980} });
const pg = await ctx.newPage();
const erros=[]; pg.on('pageerror', e=>erros.push(e.message));
await pg.route('**/jspdf**', r=>r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
await pg.goto('http://localhost:8927/app.html?lang=pt');
await pg.selectOption('#modelo','evidencia');
await pg.setInputFiles('#file','/tmp/amostra.webm'); await pg.waitForTimeout(2500);
await pg.selectOption('#mode','count'); await pg.fill('#count','3');
await pg.locator('#extract').click();
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=3,null,{timeout:40000});
await pg.waitForTimeout(400);
{
  const dl = pg.waitForEvent('download',{timeout:40000});
  await pg.locator('#json').click();
  const d = await dl; await d.saveAs('/tmp/ta.json');
}
const base = JSON.parse(fs.readFileSync('/tmp/ta.json','utf8'));

function comOcr(comPalavras){
  const j = JSON.parse(JSON.stringify(base));
  j.frames[0].textoNaTela = 'Cliente 123.456.789-00 pedido 4500001234';
  j.frames[1].textoNaTela = 'contato joao@empresa.com.br';
  if (comPalavras) {
    j.frames[0].palavrasNaTela = [
      { t:'Cliente', x:.05, y:.10, w:.09, h:.03 },
      { t:'123.456.789-00', x:.16, y:.10, w:.17, h:.03 },
      { t:'pedido', x:.36, y:.10, w:.07, h:.03 },
      { t:'4500001234', x:.45, y:.10, w:.13, h:.03 }
    ];
    j.frames[1].palavrasNaTela = [
      { t:'contato', x:.05, y:.20, w:.08, h:.03 },
      { t:'joao@empresa.com.br', x:.15, y:.20, w:.22, h:.03 }
    ];
  }
  const nome = comPalavras ? '/tmp/ta-com.json' : '/tmp/ta-sem.json';
  fs.writeFileSync(nome, JSON.stringify(j));
  return nome;
}

console.log('[1] sem a posição das palavras, o botão se explica em vez de sumir');
await pg.setInputFiles('#reabrirArq', comOcr(false));
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=3,null,{timeout:30000});
await pg.waitForTimeout(600);
ok('o aviso de dado sensível apareceu no documento reaberto',
   !(await pg.locator('#sensAviso').evaluate(e=>e.classList.contains('hide'))));
ok('e ele diz que achou CPF', /CPF/i.test(await pg.locator('#sensAviso').textContent()),
   (await pg.locator('#sensAviso').textContent()).slice(0,70));
ok('o botão existe', (await pg.locator('#tarjarTudo').count()) === 1);
ok('desabilitado e com o motivo', await pg.locator('#tarjarTudo').isDisabled());
ok('o texto diz o que fazer no lugar',
   /não disponível/i.test(await pg.locator('#tarjarTudo').textContent()),
   await pg.locator('#tarjarTudo').textContent());

console.log('\n[2] com as posições, um clique cobre tudo');
await pg.setInputFiles('#reabrirArq', comOcr(true));
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=3,null,{timeout:30000});
await pg.waitForTimeout(600);
const rotulo = await pg.locator('#tarjarTudo').textContent();
console.log('     ' + rotulo);
ok('o botão conta as ocorrências, e só as que batem em padrão',
   /Tarjar as 2 ocorrências/.test(rotulo), rotulo);
await pg.locator('#tarjarTudo').click();
await pg.waitForTimeout(600);
ok('a mensagem confirma quantas foram aplicadas',
   /tarjas aplicadas/.test(await pg.locator('#tarjarTudo').textContent()),
   await pg.locator('#tarjarTudo').textContent());
ok('e o botão trava para não tarjar duas vezes', await pg.locator('#tarjarTudo').isDisabled());

console.log('\n[3] a tarja está mesmo no quadro, e queima na exportação');
await pg.locator('#thumbs figure').nth(0).locator('.editar').click();
await pg.waitForSelector('#lente:not(.hide)');
await pg.waitForTimeout(300);
ok('a lente mostra a tarja do passo 1', (await pg.locator('#lenteTarjas > *').count()) >= 1,
   String(await pg.locator('#lenteTarjas > *').count()));
await pg.locator('#lenteFechar').click(); await pg.waitForTimeout(200);
{
  const dl = pg.waitForEvent('download',{timeout:40000});
  await pg.locator('#json').click();
  const d = await dl; await d.saveAs('/tmp/ta2.json');
  const j = JSON.parse(fs.readFileSync('/tmp/ta2.json','utf8'));
  ok('o JSON exportado conta as tarjas', j.frames[0].tarjas >= 1, String(j.frames[0].tarjas));
  ok('e a imagem exportada mudou — a tarja foi queimada',
     j.frames[0].imagemBase64 !== base.frames[0].imagemBase64);
  ok('o segundo quadro também', j.frames[1].tarjas >= 1, String(j.frames[1].tarjas));
  ok('e o terceiro, que não tinha nada, ficou intacto', (j.frames[2].tarjas || 0) === 0);
}

console.log('\n[4] o número de pedido do SAP não é telefone');
{
  /* A regra anterior aceitava dez dígitos seguidos, e 4500001234 é a cara de um
     pedido de compra. Com a tarja automática isso deixou de ser barulho e virou
     risco: cobrir o número do pedido apaga a prova. */
  const j = JSON.parse(JSON.stringify(base));
  j.frames[0].textoNaTela = 'Pedido 4500001234 criado com sucesso';
  j.frames[0].palavrasNaTela = [{ t:'4500001234', x:.2, y:.2, w:.15, h:.03 }];
  j.frames[1].textoNaTela = 'Ligar para (11) 98888-7777';
  j.frames[1].palavrasNaTela = [{ t:'(11)', x:.1, y:.3, w:.05, h:.03 },
                                { t:'98888-7777', x:.17, y:.3, w:.12, h:.03 }];
  fs.writeFileSync('/tmp/ta-pedido.json', JSON.stringify(j));
  await pg.setInputFiles('#reabrirArq','/tmp/ta-pedido.json');
  await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=3,null,{timeout:30000});
  await pg.waitForTimeout(600);
  const aviso = await pg.locator('#sensAviso').textContent();
  console.log('     ' + aviso.replace(/\s+/g,' ').slice(0, 110));
  ok('o pedido sozinho NÃO é apontado como telefone', !/passos 1[,)]/.test(aviso), aviso.slice(0,60));
  ok('mas o telefone de verdade é', /telefone/i.test(aviso));
  ok('e o botão só oferece cobrir o telefone',
     /Tarjar a ocorrência encontrada/.test(await pg.locator('#tarjarTudo').textContent()),
     await pg.locator('#tarjarTudo').textContent());
}

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0,180));
await br.close(); srv.close();
console.log(falhas ? '\n'+falhas+' falha(s)' : '\nTarja automática: tudo passou.');
process.exit(falhas?1:0);
