/* A webcam num canto do quadro.

   O Chromium do teste entrega uma câmera falsa (`--use-fake-device-for-media-stream`):
   uma tela verde com um quadrado que se move. Serve exatamente para o que
   importa aqui — provar que o rosto entra no quadro, entra no clipe, e NÃO
   entra na detecção de mudança. */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const html = fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
const srv = http.createServer((q,r)=>{ if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')} r.writeHead(200,{'Content-Type':'text/html'}); r.end(html); });
await new Promise(r=>srv.listen(8938,r));
const br = await chromium.launch({
  executablePath:CHROME_WS,
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
        '--auto-select-desktop-capture-source=Entire screen','--allow-http-screen-capture']
});
let falhas = 0;
const ok = (n,c,e2)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e2?'  → '+e2:''));if(!c)falhas++};
const ctx = await br.newContext({ acceptDownloads:true, viewport:{width:1300,height:1000},
                                  permissions:['camera','microphone'] });
const pg = await ctx.newPage();
const erros=[]; pg.on('pageerror', e=>erros.push(e.message));
await pg.route('**/jspdf**', r=>r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
await pg.goto('http://localhost:8938/app.html?lang=pt');
await pg.waitForTimeout(400);

/* A webcam saiu da lista de opções e foi para o modal do clipe: as duas servem
   ao mesmo cenário e são as que mais precisam de explicação. */
const abrirModal = async (pagina) => {
  const q = pagina || pg;
  if (await q.locator('#clipeModal').isHidden()) await q.locator('#clipeAbrir').click();
  await q.waitForTimeout(250);
};
const fecharModal = async (pagina) => {
  const q = pagina || pg;
  if (await q.locator('#clipeModal').isVisible()) await q.locator('#clipeModalFechar').click();
  await q.waitForTimeout(250);
};

console.log('[1] nasce desligada em todo cenário, sem exceção');
await abrirModal();
for (const cen of ['ia','evidencia','tutorial','ata','usabilidade']) {
  await pg.selectOption('#modelo', cen); await pg.waitForTimeout(200);
  if (!(await pg.locator('#recCam').isChecked())) ok('desligada em ' + cen, true);
  else ok('desligada em ' + cen, false, 'veio marcada');
}
ok('e a explicação longa só aparece quando alguém liga', await pg.locator('#recCamNota').isHidden());
await pg.locator('#recCam').check(); await pg.waitForTimeout(200);
ok('ligada, ela explica', await pg.locator('#recCamNota').isVisible());
{
  const nota = await pg.locator('#recCamNota').textContent();
  ok('dizendo que o rosto não decide o que é passo',
     /NÃO participa da detecção/.test(nota), nota.slice(0,60));
  ok('e que é rosto — peça permissão',
     /peça permissão a quem está sendo filmado/.test(nota));
}
ok('dá para escolher o canto', (await pg.locator('#camCanto option').count()) === 4);
ok('e o tamanho', (await pg.locator('#camTam option').count()) === 3);

console.log('\n[2] a linha de base: gravar SEM webcam');
/* A tela falsa do Chromium é verde inteira, então cor não distingue nada. O que
   só o nosso código desenha é a MOLDURA BRANCA em volta do rosto — é ela que
   prova a composição. E o número de quadros de uma gravação sem webcam é a
   régua para dizer se o rosto virou detector de movimento. */
/* UMA TELA QUE MUDA SOZINHA, IGUAL NAS DUAS GRAVAÇÕES.

   A captura falsa do Chromium mostra a própria janela do navegador, que quase
   não muda: doze segundos dela rendiam 1, 2 ou 3 quadros conforme a sorte, e
   `baseQuadros` — que é a RÉGUA deste arquivo inteiro — virava um número
   sorteado. O bloco [4] compara "com rosto" contra "sem rosto"; comparar
   contra ruído não afirma nada.

   Então a tela vira um canvas que troca de painel a cada dois segundos. A
   webcam continua sendo a câmera falsa de verdade, que é o que se quer provar.
   O rosto não pode mudar esta contagem — e agora "não pode mudar" tem um
   número estável do outro lado. */
const telaFalsa = async (pagina) => pagina.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 1000; c.height = 620;
  const cx = c.getContext('2d');
  let painel = 0;
  const pintar = () => {
    /* Nenhum painel claro, de propósito: a prova deste arquivo é a MOLDURA
       BRANCA em volta do rosto, e ela é contada como pixels acima de 235 nos
       três canais. Um fundo branco faria o teste achar rosto em toda parte. */
    cx.fillStyle = ['#12304f','#3a2a1e','#1d3d2b','#4a1f3c','#2b2f45','#402020'][painel % 6];
    cx.fillRect(0, 0, 1000, 620);
    cx.fillStyle = painel % 2 ? '#c8cede' : '#8a93a8';
    cx.font = 'bold 90px sans-serif';
    cx.fillText('Passo ' + painel, 60, 200);
    cx.font = '30px sans-serif';
    for (let i = 0; i < 6; i++)
      cx.fillText('linha ' + i + ' do painel ' + painel, 60, 300 + i * 46);
  };
  pintar();
  setInterval(() => { painel++; pintar(); }, 2000);
  navigator.mediaDevices.getDisplayMedia = async () => c.captureStream(30);
});

const gravar = async (pagina, comCam) => {
  await telaFalsa(pagina);
  await pagina.selectOption('#modelo','usabilidade'); await pagina.waitForTimeout(250);
  await abrirModal(pagina);
  if (comCam) {
    await pagina.locator('#recCam').check();
    await pagina.selectOption('#camCanto','bd');
    await pagina.selectOption('#camTam','0.24');
    await pagina.locator('#recClipe').check();
  } else {
    await pagina.locator('#recCam').uncheck().catch(()=>{});
    await pagina.locator('#recClipe').uncheck().catch(()=>{});
  }
  await fecharModal(pagina);
  await pagina.locator('#recTr').uncheck();
  await pagina.evaluate(() => window.__contagem(1));
  await pagina.waitForTimeout(200);
  await pagina.locator('#rec').click();
  await pagina.waitForFunction(()=>!document.getElementById('recStop').classList.contains('hide'),null,{timeout:20000});
  await pagina.waitForTimeout(9000);
  if (comCam) { await pagina.locator('#recMark').click(); await pagina.waitForTimeout(3000); }
  else await pagina.waitForTimeout(3000);
  await pagina.locator('#recStop').click();
  await pagina.waitForFunction(()=>document.getElementById('rec') &&
    !document.getElementById('rec').classList.contains('hide'),null,{timeout:60000});
  await pagina.waitForTimeout(1200);
  return pagina.locator('#thumbs figure').count();
};

/* Quanto branco há no canto onde o rosto vai, e no canto oposto. */
const branco = async (pagina) => pagina.evaluate(async () => {
  const img = document.querySelector('#thumbs figure img');
  if (!img) return null;
  const im = new Image(); im.src = img.src;
  await new Promise(r => { im.onload = r; });
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  const conta = (x, y, w, h) => {
    const d = g.getImageData(x, y, w, h).data; let n = 0;
    for (let i = 0; i < d.length; i += 4)
      if (d[i] > 235 && d[i+1] > 235 && d[i+2] > 235) n++;
    return n;
  };
  const lw = Math.round(c.width*0.32), lh = Math.round(c.height*0.32);
  return { bd: conta(c.width-lw, c.height-lh, lw, lh), te: conta(0, 0, lw, lh) };
});

const semCam = await ctx.newPage();
await semCam.route('**/jspdf**', r=>r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
await semCam.goto('http://localhost:8938/app.html?lang=pt');
await semCam.waitForTimeout(400);
console.log('     gravando 12 s sem webcam…');
const baseQuadros = await gravar(semCam, false);
const baseBranco = await branco(semCam);
console.log('     quadros: ' + baseQuadros + ', branco: ' + JSON.stringify(baseBranco));
/* Seis painéis em doze segundos: a régua é firme, e um número muito abaixo
   disso quer dizer que a detecção parou de enxergar troca de tela. */
ok('a gravação de controle produziu quadros', baseQuadros >= 5, String(baseQuadros));
ok('e não há moldura branca em canto nenhum',
   baseBranco.bd < 60 && baseBranco.te < 60, JSON.stringify(baseBranco));
await semCam.close();

console.log('\n[3] agora com a webcam ligada');
console.log('     gravando 12 s com webcam…');
const quadros = await gravar(pg, true);
const comBranco = await branco(pg);
console.log('     quadros: ' + quadros + ', branco: ' + JSON.stringify(comBranco));
ok('a gravação produziu quadros', quadros >= 2, String(quadros));
ok('a moldura do rosto está no canto de baixo à direita',
   comBranco.bd > baseBranco.bd + 120, JSON.stringify(comBranco));
ok('e não no canto oposto — foi para o canto que se pediu',
   comBranco.te < 60, String(comBranco.te));

console.log('\n[4] o rosto NÃO entra na detecção de mudança');
{
  /* A câmera falsa do Chromium tem um quadrado que se move sem parar. Se ela
     participasse da assinatura, a mesma tela geraria muito mais quadros com a
     webcam ligada do que sem — que é a diferença entre um documento de vinte
     passos e um de duzentos. */
  console.log('     ' + baseQuadros + ' sem webcam · ' + quadros + ' com webcam');
  ok('o número de quadros não disparou com o rosto ligado',
     quadros <= baseQuadros * 1.6 + 3, baseQuadros + ' → ' + quadros);
  const fonte = fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
  ok('e a assinatura continua sendo tirada da tela, não da composição',
     /sigX\.drawImage\(video, 0, 0, 32, 18\)/.test(fonte));
  ok('enquanto o quadro exportado leva o rosto por cima',
     /camDesenhar\(g, c\.width, c\.height\)/.test(fonte));
}

console.log('\n[5] o clipe do momento também leva o rosto');
{
  ok('o momento marcado tem clipe', (await pg.locator('#thumbs .selo').count()) >= 1,
     String(await pg.locator('#thumbs .selo').count()));
  const i = await pg.evaluate(() => [...document.querySelectorAll('#thumbs figure')]
                                     .findIndex(x => x.querySelector('.selo')));
  await pg.locator('#thumbs figure').nth(i).locator('.editar').click();
  await pg.waitForSelector('#lente:not(.hide)');
  await pg.waitForTimeout(1200);
  const r = await pg.evaluate(async () => {
    const v = document.getElementById('lenteClipe');
    if (!v.videoWidth) await new Promise(res => { v.onloadeddata = res; setTimeout(res, 3000); });
    try { v.currentTime = Math.max(0, (v.duration || 6) / 2); } catch (e) {}
    await new Promise(res => setTimeout(res, 900));
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    if (!c.width) return { erro: 'sem vídeo' };
    const g = c.getContext('2d'); g.drawImage(v, 0, 0);
    const lw = Math.round(c.width*0.32), lh = Math.round(c.height*0.32);
    const conta = (x, y, w, h) => {
      const d = g.getImageData(x, y, w, h).data; let n = 0;
      for (let i2 = 0; i2 < d.length; i2 += 4)
        if (d[i2] > 235 && d[i2+1] > 235 && d[i2+2] > 235) n++;
      return n;
    };
    return { w: c.width, h: c.height,
             bd: conta(c.width-lw, c.height-lh, lw, lh), te: conta(0, 0, lw, lh) };
  });
  console.log('     ' + JSON.stringify(r));
  ok('o clipe decodifica', !r.erro && r.w > 0, JSON.stringify(r));
  ok('e traz a moldura do rosto no canto — gravou a composição, não a tela crua',
     r.bd > 120, JSON.stringify(r));
  ok('e só nesse canto', r.te < 60, String(r.te));
  await pg.locator('#lenteFechar').click(); await pg.waitForTimeout(300);
}

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0,200));
await br.close(); srv.close();
console.log(falhas ? '\n'+falhas+' falha(s)' : '\nWebcam num canto: tudo passou.');
process.exit(falhas?1:0);
