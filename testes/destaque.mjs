import { chromium } from './_navegador.mjs';   // abre os painéis e a gaveta das saídas
import http from 'http'; import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT = `${RAIZ_WS}/public`;
const html = fs.readFileSync(ROOT + '/app.html', 'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`, 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end('') }
  r.writeHead(200, {'Content-Type':'text/html'}); r.end(html);
});
await new Promise(r => srv.listen(8910, r));

const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, extra) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (extra ? '  → ' + extra : '')); if (!c) falhas++; };

const ctx = await br.newContext({ viewport: { width: 1200, height: 950 }, acceptDownloads: true });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));
await pg.route('**/jspdf**', r => r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
await pg.goto('http://localhost:8910/app.html?lang=pt');
// o cenário de uso passou a ser obrigatório: sem ele o Gravar e o envio de vídeo cobram a escolha
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.waitForTimeout(400);
await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForTimeout(2500);
await pg.selectOption('#mode', 'count');
await pg.fill('#count', '3');
await pg.locator('#extract').click();
await pg.waitForSelector('#prevCard:not(.hide)', { timeout: 40000 });
await pg.waitForTimeout(600);

console.log('[1] abrir a lente e as ferramentas de destaque');
await pg.locator('#thumbs figure').first().locator('.editar').click();
await pg.waitForSelector('#lente:not(.hide)', { timeout: 10000 });
ok('a barra de destaque começa escondida', !(await pg.locator('#mkBox').isVisible()));
await pg.locator('#mkModo').click();
await pg.waitForTimeout(200);
ok('as três ferramentas aparecem',
   (await pg.locator('#mkRet').isVisible()) && (await pg.locator('#mkSeta').isVisible()) &&
   (await pg.locator('#mkCaneta').isVisible()));
ok('há três cores', (await pg.locator('#mkCores button').count()) === 3);
ok('o retângulo já vem escolhido', !(await pg.locator('#mkRet').getAttribute('class')).includes('ghost'));

const cx = pg.locator('#lenteImgCx');
const arrastar = async (x1, y1, x2, y2, passos = 8) => {
  const b = await cx.boundingBox();
  await pg.mouse.move(b.x + b.width * x1, b.y + b.height * y1);
  await pg.mouse.down();
  for (let i = 1; i <= passos; i++) {
    await pg.mouse.move(b.x + b.width * (x1 + (x2 - x1) * i / passos),
                        b.y + b.height * (y1 + (y2 - y1) * i / passos));
  }
  await pg.mouse.up();
  await pg.waitForTimeout(250);
};

console.log('\n[2] desenhar os três tipos');
await arrastar(0.15, 0.20, 0.45, 0.45);
ok('o retângulo entrou', (await pg.locator('#lenteMarcas rect').count()) === 1);

await pg.locator('#mkSeta').click();
await arrastar(0.55, 0.25, 0.80, 0.55);
ok('a seta entrou (linha + ponta)',
   (await pg.locator('#lenteMarcas line').count()) === 1 &&
   (await pg.locator('#lenteMarcas polygon').count()) === 1);

await pg.locator('#mkCaneta').click();
await pg.locator('#mkCores button').nth(1).click();     // troca a cor
await arrastar(0.20, 0.70, 0.70, 0.80, 14);
ok('a caneta entrou', (await pg.locator('#lenteMarcas polyline').count()) === 1);

const cores = await pg.locator('#lenteMarcas polyline').getAttribute('stroke');
ok('a caneta usou a cor escolhida', cores === '#ffcc00', cores);

console.log('\n[3] o destaque é queimado na imagem, não é camada');
const dados = await pg.evaluate(() => {
  const f = window.__frames ? window.__frames[0] : null;
  return null;   // frames é interno; a prova vem dos pixels, abaixo
});
{
  // a imagem da lente já é a queimada: procuramos o vermelho do retângulo nela
  const achou = await pg.evaluate(async () => {
    const img = document.getElementById('lenteImg');
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let vermelho = 0, amarelo = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i+1], b = d[i+2];
      if (r > 170 && g < 90 && b < 90) vermelho++;
      if (r > 200 && g > 170 && b < 90) amarelo++;
    }
    return { vermelho, amarelo, w: c.width, h: c.height };
  });
  ok('o vermelho do retângulo/seta está nos pixels', achou.vermelho > 40, JSON.stringify(achou));
  ok('o amarelo da caneta está nos pixels', achou.amarelo > 20, JSON.stringify(achou));
}

console.log('\n[4] desfazer e limpar');
await pg.locator('#mkDesfazer').click();
await pg.waitForTimeout(350);
ok('desfazer tirou o último', (await pg.locator('#lenteMarcas polyline').count()) === 0);
ok('e manteve os outros', (await pg.locator('#lenteMarcas rect').count()) === 1);
await pg.locator('#mkLimpar').click();
await pg.waitForTimeout(350);
ok('limpar tirou todos', (await pg.locator('#lenteMarcas rect').count()) === 0);
ok('os botões de desfazer/limpar sumiram', !(await pg.locator('#mkLimpar').isVisible()));

console.log('\n[5] convive com a tarja, e a tarja continua por cima do que esconde');
await pg.locator('#mkRet').click();
await arrastar(0.15, 0.20, 0.45, 0.45);
/* A COR SAI DA PRÓPRIA MARCA, e não de uma constante escrita aqui.
 *
 * Esta afirmação procurava vermelho. Mas o passo [2] trocou a cor da caneta
 * para amarelo e a ferramenta lembra da escolha — corretamente —, então o
 * retângulo deste passo nasce amarelo. A afirmação passava assim mesmo, porque
 * contava vermelho em QUALQUER lugar da imagem e o vídeo de amostra tinha
 * vermelho. Ela media o vídeo, não a queima.
 *
 * Trocar o vídeo de amostra derrubou o teste — e derrubar foi o certo: era uma
 * lista escrita à mão ("a marca é vermelha") ao lado da lista de verdade, que é
 * a cor que a ferramenta está usando. Agora ela é lida do SVG. */
const corMarca = await pg.locator('#lenteMarcas rect').getAttribute('stroke');
await pg.locator('#tarjaModo').click();
await pg.waitForTimeout(200);
ok('entrar em tarjar desliga o destaque', !(await pg.locator('#lenteImgCx').getAttribute('class')).includes('marcando'));
await arrastar(0.50, 0.55, 0.75, 0.75);
ok('a tarja entrou', (await pg.locator('#lenteTarjas i').count()) >= 1);
{
  const px = await pg.evaluate(async (cor) => {
    const rgb = [1, 3, 5].map(i => parseInt(cor.slice(i, i + 2), 16));
    const img = document.getElementById('lenteImg');
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let preto = 0, daMarca = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 24 && d[i+1] < 24 && d[i+2] < 24) preto++;
      /* Tolerância de 40 por canal: a imagem passa por um codificador com perda
         e a borda do traço mistura com o fundo. O centro do traço sobrevive. */
      if (Math.abs(d[i] - rgb[0]) < 40 && Math.abs(d[i+1] - rgb[1]) < 40 &&
          Math.abs(d[i+2] - rgb[2]) < 40) daMarca++;
    }
    return { preto, daMarca, cor, rgb };
  }, corMarca);
  /* As duas condições juntas são o que a frase promete: a tarja (preto) e o
     destaque (a cor da marca) na MESMA imagem. Separadas, cada uma passaria
     numa imagem que não tem a outra. */
  ok('os dois estão na mesma imagem queimada', px.preto > 200 && px.daMarca > 40, JSON.stringify(px));
}

console.log('\n[6] chega no documento');
await pg.locator('#lenteFechar').click();
await pg.waitForTimeout(300);
{
  const dl = pg.waitForEvent('download', { timeout: 40000 });
  await pg.locator('#json').click();
  const d = await dl; await d.saveAs('/tmp/destaque.json');
  const j = JSON.parse(fs.readFileSync('/tmp/destaque.json', 'utf8'));
  const f0 = j.frames[0];
  ok('o JSON conta os destaques', f0.destaques === 1, 'destaques=' + f0.destaques);
  ok('o JSON conta as tarjas', f0.tarjas === 1, 'tarjas=' + f0.tarjas);
  ok('a imagem do JSON é a queimada', /^data:image\/jpeg/.test(f0.imagemBase64));
}

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 200));
await br.close(); srv.close();
console.log(falhas ? '\n' + falhas + ' falha(s)' : '\nDestaque: tudo passou.');
process.exit(falhas ? 1 : 0);
