/* Por que não saiu fala: a mensagem tem que dizer a verdade, e os medidores
   têm que funcionar mesmo quando a transcrição não funciona. */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT=`${RAIZ_WS}/public`;
const T={'.html':'text/html','.css':'text/css','.js':'text/javascript','.webm':'video/webm','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
const srv=http.createServer((q,r)=>{
  if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')}
  const u=q.url.split('?')[0]; const f=path.join(ROOT,u==='/'?'index.html':u);
  if(!fs.existsSync(f)){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8876,r));
const br=await chromium.launch({executablePath:CHROME_WS,
  args:['--autoplay-policy=no-user-gesture-required']});
let falhas=0; const ok=(n,c,e)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e?'  → '+e:''));if(!c)falhas++};
const FAKE=`export const env={allowLocalModels:true,allowRemoteModels:true,backends:{onnx:{wasm:{}}}};
export async function pipeline(){let n=0;return async d=>({chunks:[{timestamp:[0,2],text:'x '+(++n)}]})}`;

async function cenario({superficie='monitor', comSomTela=true, modeloQuebra=false}={}) {
  const pg=await br.newPage();
  const erros=[]; pg.on('pageerror',e=>erros.push(e.message));
  await pg.route('**/rpc/*stamp_*', r=>r.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:'null'}));
  await pg.route('**/@huggingface/transformers**', r=> modeloQuebra
    ? r.fulfill({status:500, body:'nao'})
    : r.fulfill({status:200,headers:{'content-type':'text/javascript','access-control-allow-origin':'*'},body:FAKE}));
  await pg.addInitScript(({superficie, comSomTela}) => {
    function tela(){const c=document.createElement('canvas');c.width=480;c.height=270;const x=c.getContext('2d');
      const cor=['#e02020','#1060e0','#10a040'];let n=0;x.fillStyle=cor[0];x.fillRect(0,0,480,270);
      setInterval(()=>{n++;x.fillStyle=cor[Math.floor(n/12)%3];x.fillRect(0,0,480,270)},100);return c.captureStream(12)}
    function tom(hz){const ac=new AudioContext();const o=ac.createOscillator();o.frequency.value=hz;const g=ac.createGain();
      g.gain.value=.35;const d=ac.createMediaStreamDestination();o.connect(g);g.connect(d);o.start();return d.stream}
    navigator.mediaDevices.getUserMedia=async()=>tom(440);
    navigator.mediaDevices.getDisplayMedia=async()=>{
      const v = tela().getVideoTracks()[0];
      const orig = v.getSettings.bind(v);
      v.getSettings = () => Object.assign({}, orig(), { displaySurface: superficie });
      return new MediaStream(comSomTela ? [v, ...tom(220).getAudioTracks()] : [v]);
    };
  }, {superficie, comSomTela});
  await pg.goto('http://localhost:8876/app.html?lang=pt'); await pg.waitForTimeout(400);
  // o cenário virou obrigatório antes de o vídeo entrar ou de a gravação começar
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  /* A contagem regressiva de 3 é opção do produto e vem ligada; num teste
     que mede a gravação ela só adiciona três segundos de espera por rodada. */
  await pg.evaluate(() => window.__contagem(1));
  await pg.click('#rec');
  await pg.waitForFunction(()=>document.getElementById('recStop').offsetParent!==null,null,{timeout:25000});
  await pg.waitForTimeout(2200);
  const durante = await pg.evaluate(()=>({
    msg: document.getElementById('recMsg').textContent,
    mic: parseFloat(document.getElementById('vuMic').style.width)||0,
    sys: parseFloat(document.getElementById('vuSys').style.width)||0 }));
  await pg.click('#recStop');
  await pg.waitForFunction(()=>document.getElementById('rec').offsetParent!==null,null,{timeout:30000});
  await pg.waitForTimeout(600);
  const fim = await pg.locator('#recMsg').textContent();
  await pg.close();
  return {durante, fim, erros};
}

console.log('\n[S1] compartilhou uma JANELA (o Chrome não dá som de janela)');
{
  const r = await cenario({superficie:'window', comSomTela:false});
  console.log('     durante:', JSON.stringify(r.durante.msg.slice(0,140)));
  ok('avisa durante a gravação, e diz o gesto que resolve',
     /JANELA/.test(r.durante.msg) && /ABA/.test(r.durante.msg), r.durante.msg.slice(0,90));
  ok('o medidor do microfone funciona mesmo assim', r.durante.mic > 0, r.durante.mic + '%');
  ok('e o do computador fica zerado (é o fato)', r.durante.sys === 0);
  ok('a mensagem final repete o motivo certo', /JANELA/.test(r.fim), r.fim.slice(-140));
  ok('e NÃO diz mais "não havia áudio"', !/não havia áudio nenhum/.test(r.fim));
  ok('sem erro de JS', r.erros.length===0, r.erros.join(' | ').slice(0,140));
}

console.log('\n[S2] modelo quebrado: a gravação segue, e os medidores vivem sem transcrição');
{
  // agora o modelo quebrado PARA antes de pedir a tela (ver linhas.mjs [L3]);
  // aqui o que interessa é o que acontece depois, gravando só os frames
  const pg = await br.newPage();
  const erros=[]; pg.on('pageerror',e=>erros.push(e.message));
  await pg.route('**/rpc/*stamp_*', r=>r.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:'null'}));
  await pg.route('**/@huggingface/transformers**', r=>r.fulfill({status:500, body:'nao'}));
  await pg.addInitScript(() => {
    function tela(){const c=document.createElement('canvas');c.width=480;c.height=270;const x=c.getContext('2d');
      const cor=['#e02020','#1060e0','#10a040'];let n=0;x.fillStyle=cor[0];x.fillRect(0,0,480,270);
      setInterval(()=>{n++;x.fillStyle=cor[Math.floor(n/12)%3];x.fillRect(0,0,480,270)},100);return c.captureStream(12)}
    function tom(hz){const ac=new AudioContext();const o=ac.createOscillator();o.frequency.value=hz;const g=ac.createGain();
      g.gain.value=.35;const d=ac.createMediaStreamDestination();o.connect(g);g.connect(d);o.start();return d.stream}
    navigator.mediaDevices.getUserMedia=async()=>tom(440);
    navigator.mediaDevices.getDisplayMedia=async()=>new MediaStream([...tela().getVideoTracks(),...tom(220).getAudioTracks()]);
  });
  await pg.goto('http://localhost:8876/app.html?lang=pt'); await pg.waitForTimeout(400);
  // o cenário virou obrigatório antes de o vídeo entrar ou de a gravação começar
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  await pg.evaluate(() => window.__contagem(1));
  await pg.click('#rec');
  /* A gravação não é mais barrada pelo modelo (ver linhas.mjs [L3]): ela começa
     sozinha, e o que este bloco cobra é o que vem DEPOIS — os medidores vivendo
     sem transcrição nenhuma. */
  await pg.waitForFunction(()=>document.getElementById('recStop').offsetParent!==null,
                           null,{timeout:30000});
  ok('começou a gravar mesmo sem modelo, sem gastar a reunião', true);
  await pg.waitForTimeout(2200);
  const vu = await pg.evaluate(()=>({
    mic: parseFloat(document.getElementById('vuMic').style.width)||0,
    sys: parseFloat(document.getElementById('vuSys').style.width)||0 }));
  ok('o medidor do computador funciona SEM transcrição nenhuma',
     vu.sys > 0, `sys ${vu.sys}%`);
  /* O microfone CONTINUA sendo pedido e continua medindo. Ele foi pedido para
     transcrever; o modelo é que não veio. Silenciar o medidor aqui esconderia
     da pessoa que o som está sendo gravado — e ele está: dá para transcrever
     depois, no passo 2, e o áudio precisa existir para isso. */
  ok('e o do microfone continua vivo, porque o som está sendo gravado',
     vu.mic > 0, `mic ${vu.mic}%`);
  await pg.click('#recStop');
  await pg.waitForFunction(()=>document.getElementById('rec').offsetParent!==null,null,{timeout:30000});
  ok('sem erro de JS', erros.length===0, erros.join(' | ').slice(0,140));
  await pg.close();
}

console.log('\n[S3] tela inteira com som: o caminho feliz continua feliz');
{
  const r = await cenario({superficie:'monitor', comSomTela:true});
  ok('os dois medidores acusam sinal',
     r.durante.mic > 0 && r.durante.sys > 0, `mic ${r.durante.mic}% sys ${r.durante.sys}%`);
  ok('sem aviso de janela', !/JANELA/.test(r.durante.msg));
  ok('e a transcrição sai', /falas/.test(r.fim) && !/0 falas/.test(r.fim), r.fim.slice(0,90));
  ok('sem erro de JS', r.erros.length===0, r.erros.join(' | ').slice(0,140));
}

await br.close(); srv.close();
console.log(falhas?`\n${falhas} FALHA(S)`:'\nDiagnóstico de áudio: tudo passou.');
process.exit(falhas?1:0);
