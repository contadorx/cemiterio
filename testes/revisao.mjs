/* Revisão assistida: a ferramenta conduz passo a passo e recaptura só o que mudou. */
import { chromium } from './_navegador.mjs';   // abre os painéis e a gaveta das saídas
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const html = fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
const srv = http.createServer((q,r)=>{ if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')} r.writeHead(200,{'Content-Type':'text/html'}); r.end(html); });
await new Promise(r=>srv.listen(8928,r));
const br = await chromium.launch({ executablePath:CHROME_WS });
let falhas = 0;
const ok = (n,c,e2)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e2?'  → '+e2:''));if(!c)falhas++};
const ctx = await br.newContext({ acceptDownloads:true, viewport:{width:1300,height:1000} });
const pg = await ctx.newPage();
const erros=[]; pg.on('pageerror', e=>erros.push(e.message));
await pg.route('**/jspdf**', r=>r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
await pg.goto('http://localhost:8928/app.html?lang=pt');

console.log('[1] sem documento, não há o que revisar');
ok('o botão começa escondido', await pg.locator('#revisar').isHidden());
/* E o "começar outro" também: numa tela sem documento ele ofereceria sair de
   onde ninguém entrou. */
ok('e o começar-outro também', await pg.locator('#novoFluxo').isHidden());

await pg.selectOption('#modelo','tutorial');
await pg.setInputFiles('#file','/tmp/amostra.webm'); await pg.waitForTimeout(2500);
await pg.selectOption('#mode','count'); await pg.fill('#count','4');
await pg.locator('#extract').click();
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=4,null,{timeout:40000});
await pg.waitForTimeout(400);
for (let i = 0; i < 4; i++)
  await pg.locator('#thumbs figure').nth(i).locator('input.nota').fill('passo ' + (i+1) + ' original');
await pg.waitForTimeout(300);
const antes = await pg.locator('#thumbs figure img').nth(1).getAttribute('src');

console.log('\n[2] a revisão conduz um passo por vez');
ok('o botão aparece com o documento pronto', await pg.locator('#revisar').isVisible());
ok('e o começar-outro aparece junto', await pg.locator('#novoFluxo').isVisible());
/* E COM A CONTAGEM. Um botão que abre uma fila sem dizer o tamanho dela faz a
   pessoa entrar sem saber se são três telas ou trinta — e a decisão de começar
   agora ou depois depende exatamente disso. O número é o mesmo do placar:
   se os dois discordarem, um deles está contando outra coisa. */
{
  const txt = (await pg.locator('#revisar').textContent() || '').trim();
  const placar = (await pg.locator('#nKeep').textContent() || '').trim();
  ok('e diz quantas telas serão conferidas', /\d+/.test(txt), txt);
  ok('e o número é o mesmo do placar',
     (txt.match(/\d+/) || [''])[0] === placar, txt + '  ·  placar: ' + placar);
  /* A palavra vem do cenário, como nos outros dezoito lugares que nomeiam um
     quadro: numa ata a tela toda diz "Momento", e este botão dizia "quadro". */
  const unidade = (await pg.locator('#unNome').inputValue() || '').toLowerCase();
  ok('e usa a palavra do cenário em vigor',
     !unidade || txt.toLowerCase().includes(unidade), txt + '  ·  unidade: ' + unidade);
}
await pg.locator('#revisar').click();
await pg.waitForTimeout(400);
ok('o painel abriu', await pg.locator('#revBox').isVisible());
ok('mostra o passo 1 de 4', /1 de 4/.test(await pg.locator('#revPos').textContent()),
   await pg.locator('#revPos').textContent());
ok('com o nome do passo', /Passo 1/.test(await pg.locator('#revTit').textContent()),
   await pg.locator('#revTit').textContent());
/* A anotação virou CAMPO: conferir um passo e não poder corrigir a frase que o
   descreve é parar no meio — quem descobre que a tela mudou descobre, no mesmo
   segundo, que a anotação envelheceu junto. */
ok('e com a anotação na frente — sem ela a pergunta é sobre pixels',
   /passo 1 original/.test(await pg.locator('#revNotaEd').inputValue()),
   await pg.locator('#revNotaEd').inputValue());
ok('e ela é editável ali mesmo',
   await pg.locator('#revNotaEd').isEditable());
/* Antes isto exigia `data:image` no `src`. Exigia o CODIFICADOR, não o produto:
   quando os quadros passaram a viver em Blob, a afirmação caiu sem que nada
   tivesse quebrado para ninguém. O que ela quer dizer é que o painel mostra a
   mesma tela que está no documento — então é isso que ela pergunta agora: a
   imagem carregou de verdade (tem pixel) e é a MESMA da miniatura do passo. */
ok('mostrando a tela que está no documento hoje',
   await pg.evaluate(() => {
     const r = document.getElementById('revImg');
     const mini = document.querySelector('#thumbs figure .toque img');
     return !!(r && mini) && r.naturalWidth > 0 && r.src === mini.src;
   }),
   await pg.locator('#revImg').getAttribute('src'));

console.log('\n[2b] editar a anotação ali gruda no quadro');
{
  await pg.locator('#revNotaEd').fill('corrigido na revisão');
  await pg.waitForTimeout(300);
  const nas = await pg.locator('#thumbs figure input.nota').evaluateAll((ns) => ns.map((n) => n.value));
  ok('a anotação nova está no quadro', nas.includes('corrigido na revisão'), nas.join(' | '));
  await pg.locator('#revNotaEd').fill('passo 1 original');
  await pg.waitForTimeout(250);
}

console.log('\n[2c] a porta para tarja, destaque, seta e caneta');
{
  /* As ferramentas moram na lente e continuam lá — uma segunda cópia aqui
     seria uma segunda cópia para manter. O que faltava era a porta. */
  await pg.locator('#revEditar').click();
  await pg.waitForTimeout(400);
  ok('a lente abriu', !(await pg.locator('#lente').evaluate((e) => e.classList.contains('hide'))));
  for (const id of ['tarjaModo', 'mkModo', 'cropModo'])
    ok(`  e traz o ${id}`, await pg.locator('#' + id).isVisible());
  await pg.locator('#mkModo').click();
  await pg.waitForTimeout(250);
  for (const id of ['mkRet', 'mkSeta', 'mkCaneta'])
    ok(`  destaque: ${id}`, await pg.locator('#' + id).isVisible());
  /* Tarjar de verdade, e conferir que a REVISÃO mostra a tarja depois.
     Sem isto o painel continuava exibindo a imagem de antes: a tarja existia no
     documento e não na tela, e o que a pessoa concluía era que a marcação não
     tinha pegado. */
  await pg.locator('#lenteFechar').click();
  await pg.waitForTimeout(350);
  ok('e a revisão continua no mesmo passo depois de fechar',
     /1 de 4/.test(await pg.locator('#revPos').textContent()),
     await pg.locator('#revPos').textContent());
}

console.log('\n[2d] a tarja feita na lente aparece na revisão');
{
  const antes = await pg.locator('#revImg').getAttribute('src');
  await pg.locator('#revEditar').click();
  await pg.waitForTimeout(400);
  await pg.locator('#tarjaModo').click();
  await pg.waitForTimeout(250);
  /* Arrastar sobre a imagem: é assim que uma tarja nasce. */
  const cx = await pg.locator('#lenteImgCx').boundingBox();
  await pg.mouse.move(cx.x + cx.width * 0.25, cx.y + cx.height * 0.25);
  await pg.mouse.down();
  await pg.mouse.move(cx.x + cx.width * 0.60, cx.y + cx.height * 0.55, { steps: 12 });
  await pg.mouse.up();
  await pg.waitForTimeout(500);
  ok('a tarja foi criada', (await pg.locator('#lenteTarjas > *').count()) > 0,
     String(await pg.locator('#lenteTarjas > *').count()));
  await pg.locator('#lenteFechar').click();
  await pg.waitForTimeout(700);
  ok('a revisão voltou sozinha, sem clique nenhum',
     !(await pg.locator('#revBox').evaluate((e) => e.classList.contains('hide'))));
  ok('e a imagem que ela mostra é a NOVA',
     (await pg.locator('#revImg').getAttribute('src')) !== antes);
  ok('no mesmo passo em que se estava', /1 de 4/.test(await pg.locator('#revPos').textContent()),
     await pg.locator('#revPos').textContent());
}

console.log('\n[3] "continua assim" só avança');
await pg.locator('#revIgual').click();
await pg.waitForTimeout(300);
ok('foi para o passo 2', /2 de 4/.test(await pg.locator('#revPos').textContent()));
ok('e nada foi tocado', (await pg.locator('#thumbs figure').count()) === 4);

console.log('\n[4] "mudou" troca a imagem e preserva o resto');
await pg.setInputFiles('#revArq', `${RAIZ_WS}/public/apple-touch-icon.png`);
await pg.waitForTimeout(800);
ok('avançou sozinho para o passo 3', /3 de 4/.test(await pg.locator('#revPos').textContent()),
   await pg.locator('#revPos').textContent());
{
  const depois = await pg.locator('#thumbs figure img').nth(1).getAttribute('src');
  ok('a imagem do passo 2 mudou', depois !== antes);
  ok('a anotação do passo 2 ficou',
     (await pg.locator('#thumbs figure').nth(1).locator('input.nota').inputValue()) === 'passo 2 original');
  ok('e a ordem não mexeu',
     /Passo 2/.test(await pg.locator('#thumbs figcaption .passo').nth(1).textContent()));
}

console.log('\n[5] "não existe mais" descarta e não pula o seguinte');
{
  /* O quadro sai da lista dos mantidos, então o índice já aponta para o
     próximo. Incrementar aqui pularia um passo — numa revisão de quarenta, é o
     erro que ninguém percebe. */
  const antesTexto = await pg.locator('#revNotaEd').inputValue();
  await pg.locator('#revFora').click();
  await pg.waitForTimeout(500);
  ok('a lista de mantidos caiu para 3',
     (await pg.locator('#thumbs figure:not(.off)').count()) === 3,
     String(await pg.locator('#thumbs figure:not(.off)').count()));
  ok('e o painel foi para o passo seguinte, não para o mesmo',
     (await pg.locator('#revNotaEd').inputValue()) !== antesTexto,
     await pg.locator('#revNotaEd').inputValue());
  ok('a numeração diz 3 de 3', /3 de 3/.test(await pg.locator('#revPos').textContent()),
     await pg.locator('#revPos').textContent());
}

console.log('\n[6] o fim conta o que aconteceu');
await pg.locator('#revIgual').click();
await pg.waitForTimeout(500);
ok('o painel fechou', await pg.locator('#revBox').isHidden());
{
  const msg = await pg.locator('#movMsg').textContent();
  console.log('     ' + msg);
  ok('o resumo conta confirmados, trocados e descartados',
     /2 confirmados, 1 com imagem nova, 1 descartados/.test(msg), msg);
}

console.log('\n[7] o documento sai revisado');
{
  const dl = pg.waitForEvent('download',{timeout:40000});
  await pg.locator('#md').click();
  const d = await dl; await d.saveAs('/tmp/rev.md');
  const md = fs.readFileSync('/tmp/rev.md','utf8');
  ok('o passo descartado sumiu', !/passo 3 original/.test(md));
  ok('os outros três ficaram',
     /passo 1 original/.test(md) && /passo 2 original/.test(md) && /passo 4 original/.test(md));
  ok('e a numeração fechou em três', (md.match(/^## /gm) || []).length === 3,
     String((md.match(/^## /gm)||[]).length));
}

console.log('\n[8] dá para sair no meio sem perder nada');
await pg.locator('#revisar').click();
await pg.waitForTimeout(300);
await pg.locator('#revIgual').click();
await pg.waitForTimeout(200);
await pg.locator('#revSair').click();
await pg.waitForTimeout(300);
ok('fechou', await pg.locator('#revBox').isHidden());
ok('e os quadros continuam lá', (await pg.locator('#thumbs figure:not(.off)').count()) === 3);

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0,180));
await br.close(); srv.close();
console.log(falhas ? '\n'+falhas+' falha(s)' : '\nRevisão assistida: tudo passou.');
process.exit(falhas?1:0);
