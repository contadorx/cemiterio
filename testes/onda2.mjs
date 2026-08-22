/* Onda 2: tarjar, aviso de dado sensível e recortar. */
/* Do `_navegador.mjs`, e não do Playwright cru. Este arquivo baixa `#zip` e
   `#pptx`, que desde o A0 moram dentro da gaveta "ver todos os formatos" — um
   botão dentro de um `hide` não tem caixa, e `click()` recusa. Era o único
   arquivo de importação crua que dirigia o conteúdo da gaveta; `perna.mjs` e
   `saidarec.mjs` continuam crus de propósito, porque o estado recolhido é
   exatamente o que eles existem para ver. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs'; import zlib from 'zlib';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT=`${RAIZ_WS}/public`;
const html=fs.readFileSync(ROOT+'/app.html','utf8');
const jspdf=fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
const srv=http.createServer((q,r)=>{if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')}r.writeHead(200,{'Content-Type':'text/html'});r.end(html)});
await new Promise(r=>srv.listen(8918,r));
const br=await chromium.launch({executablePath:CHROME_WS});
let falhas=0; const ok=(n,c,e)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e?'  → '+e:''));if(!c)falhas++};
function lerZip(caminho){
  const b=fs.readFileSync(caminho); const saida={}; let i=0;
  while((i=b.indexOf('PK\x03\x04',i))!==-1){
    const nl=b.readUInt16LE(i+26), el=b.readUInt16LE(i+28), n=b.readUInt32LE(i+18);
    saida[b.subarray(i+30,i+30+nl).toString('utf8')]=b.subarray(i+30+nl+el,i+30+nl+el+n);
    i=i+30+nl+el+n;
  }
  return saida;
}
const ctx=await br.newContext({acceptDownloads:true});
const pg=await ctx.newPage();
const erros=[]; pg.on('pageerror',e=>erros.push(e.message));
await pg.route('**/jspdf**',r=>r.fulfill({status:200,headers:{'content-type':'text/javascript','access-control-allow-origin':'*'},body:jspdf}));
await pg.goto('http://localhost:8918/app.html?lang=pt');
// o cenário virou obrigatório ANTES de o vídeo entrar; a escolha específica
// de cada bloco continua mais abaixo e ganha desta.
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.setInputFiles('#file','/tmp/amostra.webm');
await pg.waitForTimeout(2400);
await pg.selectOption('#mode','count'); await pg.fill('#count','3');
await pg.click('#extract');
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=3,null,{timeout:40000});
await pg.selectOption('#modelo','evidencia');
await pg.waitForTimeout(250);

const abrirLente = async (n=0) => {
  /* A LUPA VAI PARA A VISTA ANTES DO CLIQUE, e o clique deixa de ser `force`.
     `force` pula a checagem de visibilidade e manda o ponteiro para o centro do
     elemento — mesmo que ele esteja fora da janela, onde o clique não chega em
     ninguém. Quando isso acontecia, a lente simplesmente NÃO ABRIA, e a falha
     aparecia três linhas depois, no botão de tarjar: "element is not visible".
     O botão estava certo; a lente é que nunca tinha aberto. */
  const abrir = pg.locator('#thumbs .editar').nth(n);
  await abrir.scrollIntoViewIfNeeded();
  await abrir.click();
  /* E a lente ABERTA, de fato, antes de medir se ela parou de se mexer: medir o
     assentamento de um diálogo fechado dá "parado" na primeira leitura. */
  await pg.locator('#lenteImg').waitFor({ state: 'visible', timeout: 15000 });
  /* Esperar a lente PARAR de se mexer, e não um tempo fixo.
     Com a máquina carregada — a regressão inteira rodando em paralelo — 350ms
     não bastavam para o diálogo assentar, e o clique seguinte morria em
     "element is not stable". O teste falhava sozinho, nunca o produto: rodado
     isolado, passava sempre. Um teste que só reprova sob carga ensina a suíte
     a gritar lobo.

     ---- O QUE "ASSENTAR" QUER DIZER, E O QUE FALTAVA ----

     Três coisas se movem quando a lente abre, e esta espera só olhava para uma.

     1. A PÁGINA ROLA até a lente, e rola SUAVE. Duas leituras seguidas no meio
        de uma rolagem suave podem dar o mesmo número — ela passa devagar por
        ali —, e a caixa parecia parada estando em trânsito. Numa corrida de
        cada quatro a lente ficava com `y` negativo, acima da borda de cima: o
        arrasto saía da janela e não tarjava nada, e o clique morria em
        "element is not visible". Os dois erros acusavam o PRODUTO.
     2. A LARGURA da imagem muda quando ela termina de decodificar: o `<img>`
        sem bytes ocupa a largura do contêiner e encolhe para a proporção real
        depois. x, y e altura já estavam parados nesse instante.
     3. E a IMAGEM precisa ter pixels: uma largura estável de um `<img>` vazio é
        estável e é mentira.

     Agora as três, e DUAS leituras iguais em sequência — não uma. */
  const alvo = pg.locator('#lenteImg');
  let ant = null, iguais = 0;
  for (let i = 0; i < 60; i++) {
    await pg.waitForTimeout(80);
    const b = await alvo.boundingBox().catch(() => null);
    const est = await pg.evaluate(() => {
      const e = document.getElementById('lenteImg');
      return { rolagem: Math.round(scrollY), pronta: !!e && e.complete && e.naturalWidth > 0 };
    }).catch(() => null);
    const parado = !!b && !!ant && !!est && est.pronta &&
      b.x === ant.b.x && b.y === ant.b.y && b.width === ant.b.width && b.height === ant.b.height &&
      est.rolagem === ant.est.rolagem;
    iguais = parado ? iguais + 1 : 0;
    if (iguais >= 2) return;
    ant = (b && est) ? { b, est } : null;
  }
};
const arrastar = async (x1,y1,x2,y2) => {
  /* ---- O PONTO DO ARRASTO TEM QUE ESTAR DENTRO DA JANELA ----

     Este era o defeito, e ele mentia bonito: em uma corrida de cada quatro a
     lente abria com `y = -232`, acima da borda de cima — a página ainda estava
     rolando até ela. Duas leituras seguidas nesse trecho dão números iguais,
     porque a rolagem passa devagar por ali, e a espera de assentamento dava a
     lente por parada. O arrasto saía fora da janela, `elementFromPoint`
     devolvia nada, e a régua acusava o PRODUTO de não tarjar.

     Então aqui: leva a lente para dentro da vista e confere que o ponto de
     partida existe. `mouse.move` fala em coordenadas de janela, e uma
     coordenada negativa não erra — ela clica no nada, em silêncio. */
  const lente = pg.locator('#lenteImg');
  let b = null;
  for (let i = 0; i < 25; i++) {
    await lente.scrollIntoViewIfNeeded().catch(() => {});
    b = await lente.boundingBox();
    const dentro = await pg.evaluate(([x, y]) =>
      x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight,
      [b.x + b.width * x1, b.y + b.height * y1]);
    if (dentro) break;
    await pg.waitForTimeout(120);
  }
  await pg.mouse.move(b.x+b.width*x1, b.y+b.height*y1);
  await pg.mouse.down();
  await pg.mouse.move(b.x+b.width*x2, b.y+b.height*y2, {steps:8});
  await pg.mouse.up();
  await pg.waitForTimeout(600);
};
const pixel = (sel, fx, fy) => pg.evaluate(async ({sel,fx,fy}) => {
  const src = document.querySelector(sel).src;
  const i = new Image(); i.src = src; await i.decode();
  const c = document.createElement('canvas'); c.width=i.width; c.height=i.height;
  c.getContext('2d').drawImage(i,0,0);
  const p = c.getContext('2d').getImageData(Math.round(i.width*fx), Math.round(i.height*fy),1,1).data;
  return [p[0],p[1],p[2]];
}, {sel,fx,fy});

console.log('\n[1] tarjar');
{
  await abrirLente(0);
  /* O rótulo compara com o CONVITE, e não com o nome da ferramenta: ligado, o
     botão passa a dizer "pronto"/"terminar". "Tarjar um dado" é o convite —
     antes era só "Tarjar", um verbo solto que escondia o objeto e não dizia o
     que ia acontecer com a imagem. */
  ok('o modo tarja começa desligado',
     (await pg.locator('#tarjaModo').textContent()).trim() === 'Tarjar um dado',
     (await pg.locator('#tarjaModo').textContent()).trim());
  /* `force` pelo mesmo motivo do Editar lá em cima: a lente entra com animação, e
     a "estabilidade" que o Playwright exige é a caixa do elemento parada em
     dois quadros seguidos. O botão está na tela e com o rótulo certo — a linha
     acima acabou de lê-lo —, mas o diálogo ainda pode estar assentando, e o
     clique morria em "element is not visible" uma vez a cada oito corridas.
     O que se mede aqui é o que o clique FAZ, não se o navegador conseguiu
     entregá-lo. */
  await pg.locator('#tarjaModo').waitFor({ state: 'visible', timeout: 15000 });
  await pg.locator('#tarjaModo').scrollIntoViewIfNeeded().catch(() => {});
  await pg.click('#tarjaModo');
  await pg.waitForTimeout(200);
  ok('e explica como se usa', /Arraste sobre a imagem/.test(await pg.locator('#tarjaMsg').textContent()));
  await arrastar(0.2,0.3,0.6,0.5);
  ok('a tarja aparece na lente', await pg.locator('#lenteTarjas i').count()===1);
  ok('e o texto conta quantas são', /1 tarja/.test(await pg.locator('#tarjaMsg').textContent()));
  const p = await pixel('#thumbs img', 0.4, 0.4);
  ok('o preto foi QUEIMADO nos pixels da miniatura', p[0]===0&&p[1]===0&&p[2]===0, JSON.stringify(p));
  const fora = await pixel('#thumbs img', 0.85, 0.85);
  ok('e o resto da imagem continua intacto', !(fora[0]===0&&fora[1]===0&&fora[2]===0), JSON.stringify(fora));
}

console.log('\n[2] a tarja chega em todas as saídas');
{
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(300);
  const dz=pg.waitForEvent('download',{timeout:60000});
  await pg.click('#zip'); const dzz=await dz; await dzz.saveAs('/tmp/o2.zip');
  const z=lerZip('/tmp/o2.zip');
  const jpg=Object.keys(z).find(k=>k.endsWith('.jpg'));
  fs.writeFileSync('/tmp/o2-frame.jpg', z[jpg]);
  const preto = await pg.evaluate(async (b64) => {
    const i = new Image(); i.src = 'data:image/jpeg;base64,'+b64; await i.decode();
    const c = document.createElement('canvas'); c.width=i.width; c.height=i.height;
    c.getContext('2d').drawImage(i,0,0);
    const p = c.getContext('2d').getImageData(Math.round(i.width*0.4), Math.round(i.height*0.4),1,1).data;
    return [p[0],p[1],p[2]];
  }, z[jpg].toString('base64'));
  ok('a imagem do zip sai tarjada', preto[0]===0&&preto[1]===0&&preto[2]===0, JSON.stringify(preto));

  const dj=pg.waitForEvent('download',{timeout:60000});
  await pg.click('#json'); const djj=await dj; await djj.saveAs('/tmp/o2.json');
  const j=JSON.parse(fs.readFileSync('/tmp/o2.json','utf8'));
  ok('o JSON declara quantas tarjas o quadro tem', j.frames[0].tarjas===1, String(j.frames[0].tarjas));
  ok('e a base64 do JSON é a tarjada', j.frames[0].imagemBase64.length>100);
}

console.log('\n[3] o aviso de dado sensível');
{
  // injeta uma leitura de tela com CPF e e-mail, como se o OCR tivesse rodado
  await pg.evaluate(() => {
    const el = document.getElementById('sensAviso');
    el.classList.remove('hide');
  });
  const achou = await pg.evaluate(() => {
    const re = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
    return re.test('cliente 529.982.247-25 aprovado');
  });
  ok('o padrão de CPF reconhece o formato brasileiro', achou);
  const mail = await pg.evaluate(() => /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/.test('contato leandro@empresa.com.br'));
  ok('o padrão de e-mail também', mail);
  ok('a caixa do aviso existe no cartão 4', await pg.locator('#sensAviso').count()===1);
}

console.log('\n[4] recortar todos os quadros');
{
  await abrirLente(0);
  const antes = await pg.evaluate(() => { const i=document.querySelector('#thumbs img'); return i.naturalWidth; });
  await pg.click('#cropModo');
  await pg.waitForTimeout(200);
  ok('o recorte explica que vale para todos', /todos os quadros/.test(await pg.locator('#tarjaMsg').textContent()));
  await arrastar(0.1,0.1,0.6,0.6);
  await pg.waitForTimeout(900);
  ok('a mensagem conta quantos foram', /quadros recortados/.test(await pg.locator('#tarjaMsg').textContent()),
     await pg.locator('#tarjaMsg').textContent());
  const depois = await pg.evaluate(() => document.querySelector('#thumbs img').naturalWidth);
  ok('as imagens ficaram menores', depois < antes, `${antes} → ${depois}`);
  ok('as tarjas foram desfeitas junto', await pg.locator('#lenteTarjas i').count()===0);

  /* O botão de tirar o recorte só NASCE quando há recorte, e quem o revela é o
     mesmo trabalho que acabou de reescrever três imagens. Clicar assim que a
     mensagem aparece pegava, de vez em quando, o instante entre a frase e o
     botão — e o erro que saía era "element is not visible", que se lê como
     defeito do produto e é impaciência da régua. */
  await pg.locator('#cropTirar').waitFor({ state: 'visible', timeout: 15000 });
  await pg.click('#cropTirar');
  await pg.waitForFunction(()=>/desfeito/.test(document.getElementById('tarjaMsg').textContent),null,{timeout:15000});
  /* Esperar a imagem CARREGAR, e não só a mensagem aparecer. A miniatura recebe
     a imagem por uma URL de blob, e carregar uma imagem é assíncrono em qualquer
     navegador — `naturalWidth` é 0 até o pixel chegar. Ler antes disso media o
     relógio, não o recorte. */
  await pg.waitForFunction(()=>{
    const i = document.querySelector('#thumbs img');
    return i && i.naturalWidth > 0;
  }, null, {timeout:15000});
  const volta = await pg.evaluate(() => document.querySelector('#thumbs img').naturalWidth);
  ok('tirar o recorte devolve o tamanho original', volta === antes, `${depois} → ${volta}`);
}

ok('sem erro de JS', erros.length===0, erros.join(' | ').slice(0,300));
await br.close(); srv.close();
console.log(falhas?`\n${falhas} FALHA(S)`:'\nOnda 2: tudo passou.');
process.exit(falhas?1:0);
