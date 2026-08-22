/* Gravar e parar quase imediatamente — o relato: some o vídeo e não sobra nada. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT=`${RAIZ_WS}/public`;
const T={'.html':'text/html','.css':'text/css','.js':'text/javascript','.webm':'video/webm','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
const srv=http.createServer((q,r)=>{
  if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')}
  const u=q.url.split('?')[0]; const f=path.join(ROOT,u==='/'?'index.html':u);
  if(!fs.existsSync(f)){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8880,r));
const br=await chromium.launch({executablePath:CHROME_WS,
  args:['--autoplay-policy=no-user-gesture-required']});
let falhas=0; const ok=(n,c,e)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e?'  → '+e:''));if(!c)falhas++};
const FAKE=`export const env={allowLocalModels:true,allowRemoteModels:true,backends:{onnx:{wasm:{}}}};
export async function pipeline(){let n=0;return async d=>({chunks:[{timestamp:[0,2],text:'x '+(++n)}]})}`;

for (const [rot, espera, semTr, semImagem] of [['parar em 200 ms', 200, false, false],
                                     ['parar em 600 ms', 600, false, false],
                                     ['parar em 200 ms, SEM transcrição', 200, true, false],
                                     ['tela sem imagem nenhuma', 300, true, true]]) {
  const pg=await br.newPage();
  const erros=[]; pg.on('pageerror',e=>erros.push(e.message));
  await pg.route('**/rpc/*stamp_*', r=>r.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:'null'}));
  await pg.route('**/@huggingface/transformers**', r=>r.fulfill({status:200,headers:{'content-type':'text/javascript','access-control-allow-origin':'*'},body:FAKE}));
  await pg.addInitScript((semImagem) => {
    function tela(){const c=document.createElement('canvas');c.width=480;c.height=270;const x=c.getContext('2d');
      x.fillStyle='#1060e0';x.fillRect(0,0,480,270);return c.captureStream(12)}
    function tom(hz){const ac=new AudioContext();const o=ac.createOscillator();o.frequency.value=hz;const g=ac.createGain();
      g.gain.value=.3;const d=ac.createMediaStreamDestination();o.connect(g);g.connect(d);o.start();return d.stream}
    navigator.mediaDevices.getUserMedia=async()=>tom(440);
    navigator.mediaDevices.getDisplayMedia=async()=> semImagem
      ? new MediaStream([...tom(220).getAudioTracks()])
      : new MediaStream([...tela().getVideoTracks(),...tom(220).getAudioTracks()]);
  }, semImagem);
  await pg.goto('http://localhost:8880/app.html?lang=pt'); await pg.waitForTimeout(400);
  // o cenário virou obrigatório antes de o vídeo entrar ou de a gravação começar
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  if (semTr) await pg.uncheck('#recTr');
  /* A contagem regressiva de 3 é opção do produto e vem ligada; num teste
     que mede a gravação ela só adiciona três segundos de espera por rodada. */
  await pg.evaluate(() => window.__contagem(1));
  await pg.click('#rec');
  const comecou = await pg.waitForFunction(()=>document.getElementById('recStop').offsetParent!==null,
                                           null,{timeout:20000}).then(()=>true).catch(()=>false);
  if (comecou) {
    /* `#recStop` aparece DURANTE a contagem, de propósito: três segundos depois
       de escolher a tela é exatamente quando a pessoa percebe que compartilhou
       a janela errada, e um botão que só aparece depois disso chega tarde. Mas
       o que este arquivo mede é "gravou e parou logo", não "desistiu antes de
       começar" — então a espera curta é contada a partir do zero da contagem, e
       não do clique. */
    await pg.waitForFunction(
      () => !/\d/.test(document.getElementById('recMsg').textContent || ''),
      null, { timeout: 20000 }).catch(() => {});
    await pg.waitForTimeout(espera);
    await pg.click('#recStop');
    await pg.waitForFunction(()=>document.getElementById('rec').offsetParent!==null,null,{timeout:25000});
  }
  await pg.waitForTimeout(700);
  const e = await pg.evaluate(()=>({
    frames: document.querySelectorAll('#thumbs figure').length,
    prevHide: document.querySelectorAll('#thumbs figure').length === 0,
    liveHide: document.getElementById('liveBox').classList.contains('hide'),
    playerHide: document.getElementById('playerBox').classList.contains('hide'),
    recMsg: document.getElementById('recMsg').textContent.slice(0,150),
    trAuto: document.getElementById('trAuto').hasAttribute('inert'),
    frCorpo: document.getElementById('framesCorpo').hasAttribute('inert'),
    hintTr: document.getElementById('hintTr').textContent.slice(0,60),
    tr: document.getElementById('tr').value.length,
    recOk: !document.getElementById('rec').disabled && document.getElementById('rec').offsetParent!==null,
  }));
  console.log('\n=== ' + rot);
  if (semImagem) {
    // caso teórico: getDisplayMedia sempre devolve trilha de vídeo. O que importa
    // é falhar sem deixar a pessoa presa.
    ok('falha sem travar: o botão Gravar continua disponível', e.recOk);
    ok('e a dica volta ao começo', /etapa 1/.test(e.hintTr), e.hintTr);
  } else {
    ok('sobra pelo menos um frame (era zero)', e.frames >= 1, e.frames + ' frames');
    ok('o cartão de revisão aparece', !e.prevHide);
    ok('a mensagem final é de conclusão', /Pronto:/.test(e.recMsg), e.recMsg.slice(0,60));
    ok('a dica do passo 2 combina com o que aconteceu',
       semTr ? /só de quadros/.test(e.hintTr) : /ao vivo/.test(e.hintTr), e.hintTr);
    ok('o botão Gravar continua disponível', e.recOk);
  }
  if (erros.length) ok('sem erro de JS', false, erros.join(' | ').slice(0,160));
  await pg.close();
}
await br.close(); srv.close();
console.log(falhas?`\n${falhas} FALHA(S)`:'\nGravação curta: tudo passou.');
process.exit(falhas?1:0);
