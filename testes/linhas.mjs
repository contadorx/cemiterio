/* O degrau de linhas do WASM e a parada antes de pedir a tela. */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT=`${RAIZ_WS}/public`;
const T={'.html':'text/html','.css':'text/css','.js':'text/javascript','.webm':'video/webm','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
let ISOLAR=true;
const srv=http.createServer((q,r)=>{
  if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')}
  const u=q.url.split('?')[0]; const f=path.join(ROOT,u==='/'?'index.html':u);
  const h = ISOLAR ? {'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'credentialless',
                      'Cross-Origin-Resource-Policy':'cross-origin'} : {};
  if(!fs.existsSync(f)){r.writeHead(404,h);return r.end()}
  h['Content-Type']=T[path.extname(f)]||'application/octet-stream';
  r.writeHead(200,h);r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8875,r));
const br=await chromium.launch({executablePath:CHROME_WS,
  args:['--autoplay-policy=no-user-gesture-required']});
let falhas=0; const ok=(n,c,e)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e?'  → '+e:''));if(!c)falhas++};

/* Modelo simulado que reproduz o defeito de produção: falha enquanto numThreads>1
   e funciona com uma linha só — que é o comportamento do runtime barrado por COEP. */
const FAKE = `
export const env={allowLocalModels:true,allowRemoteModels:true,backends:{onnx:{wasm:{numThreads:4}}}};
export async function pipeline(tarefa, modelo, opts){
  if (env.backends.onnx.wasm.numThreads > 1)
    throw new Error('failed to create worker: cross-origin script blocked by COEP');
  let n=0; return async d=>({chunks:[{timestamp:[0,2],text:'fala '+(++n)}]});
}`;
const FAKE_MORTO = `
export const env={allowLocalModels:true,allowRemoteModels:true,backends:{onnx:{wasm:{numThreads:4}}}};
export async function pipeline(){ throw new Error('Failed to fetch model.onnx'); }`;

async function pagina(corpo){
  const pg=await br.newPage();
  const erros=[]; pg.on('pageerror',e=>erros.push(e.message));
  await pg.route('**/rpc/*stamp_*', r=>r.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:'null'}));
  await pg.route('**/@huggingface/transformers**', r=>r.fulfill({status:200,
    headers:{'content-type':'text/javascript','access-control-allow-origin':'*'},body:corpo}));
  await pg.route('**/onnxruntime-web**', r=>r.fulfill({status:206,headers:{'access-control-allow-origin':'*'},body:'x'}));
  await pg.addInitScript(() => {
    function tela(){const c=document.createElement('canvas');c.width=480;c.height=270;const x=c.getContext('2d');
      const cor=['#e02020','#1060e0'];let n=0;x.fillStyle=cor[0];x.fillRect(0,0,480,270);
      setInterval(()=>{n++;x.fillStyle=cor[Math.floor(n/12)%2];x.fillRect(0,0,480,270)},100);return c.captureStream(12)}
    function tom(hz){const ac=new AudioContext();const o=ac.createOscillator();o.frequency.value=hz;const g=ac.createGain();
      g.gain.value=.35;const d=ac.createMediaStreamDestination();o.connect(g);g.connect(d);o.start();return d.stream}
    window.__pediuTela=0;
    navigator.mediaDevices.getUserMedia=async()=>tom(440);
    navigator.mediaDevices.getDisplayMedia=async()=>{window.__pediuTela++;
      return new MediaStream([...tela().getVideoTracks(),...tom(220).getAudioTracks()])};
  });
  await pg.goto('http://localhost:8875/app.html?lang=pt'); await pg.waitForTimeout(400);
  // o cenário virou obrigatório: sem ele o Gravar cobra a escolha em vez de gravar
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  return {pg, erros};
}

console.log('\n[L1] a página está isolada (é o que liga as linhas)');
{
  const {pg}=await pagina(FAKE);
  ok('crossOriginIsolated ligado', await pg.evaluate(()=>self.crossOriginIsolated===true));
  await pg.close();
}

console.log('\n[L2] runtime barrado com várias linhas: cai para uma e FUNCIONA');
{
  const {pg,erros}=await pagina(FAKE);
  await pg.evaluate(() => window.__contagem(1));
  await pg.click('#rec');
  await pg.waitForFunction(()=>document.getElementById('recStop').offsetParent!==null,null,{timeout:30000});
  await pg.waitForTimeout(2500);
  await pg.click('#recStop');
  await pg.waitForFunction(()=>document.getElementById('rec').offsetParent!==null,null,{timeout:30000});
  await pg.waitForTimeout(600);
  const msg = await pg.locator('#recMsg').textContent();
  ok('a gravação aconteceu', /Pronto:/.test(msg), msg.slice(0,70));
  ok('e a transcrição saiu (era zero antes do degrau)', !/0 falas/.test(msg), msg.slice(0,80));
  ok('sem erro de JS', erros.length===0, erros.join(' | ').slice(0,140));
  await pg.close();
}

console.log('\n[L3] modelo irrecuperável: a gravação CONTINUA, e o recado aparece');
/* A promessa mudou duas vezes, e as duas valem registro.
 *
 * Era "paro antes de PEDIR A SUA TELA". Isso deixou de ser possível quando o
 * download do modelo passou a correr em paralelo com o seletor de tela — que é
 * o que economiza cinco a quinze segundos em toda gravação.
 *
 * Virou então "paro antes de gravar e desligo a captura", com o argumento de
 * que ninguém grava uma reunião de uma hora para descobrir no fim que não há
 * transcrição. Em uso real o argumento se virou contra ele: o modelo engasgava,
 * a gravação NEM COMEÇAVA, e a reunião era perdida por causa de um acessório.
 * O pedido veio curto — "não devemos bloquear a gravação".
 *
 * A promessa de hoje: a gravação começa e continua, os quadros são guardados, e
 * o recado diz o que faltou e o que ainda dá para fazer. É isto que este bloco
 * cobra — e cobra também que o recado NÃO prometa mais parar, porque a frase
 * antiga sobreviveu ao código dela por uma rodada inteira. */
{
  const {pg,erros}=await pagina(FAKE_MORTO);
  await pg.evaluate(() => window.__contagem(1));
  await pg.click('#rec');
  await pg.waitForFunction(()=>document.getElementById('recStop').offsetParent!==null,
                           null,{timeout:30000});
  ok('a gravação COMEÇOU, apesar do modelo morto', true);
  await pg.waitForFunction(()=>/modelo de voz|speech model/i.test(
                             document.getElementById('recMsg').textContent),
                           null,{timeout:30000});
  const msg = await pg.locator('#recMsg').textContent();
  ok('e o recado explica que só a transcrição não vem',
     /A gravação CONTINUA/.test(msg), msg.slice(0,120));
  ok('sem prometer mais que parou antes de gravar',
     !/parei antes de começar a gravar/.test(msg), msg.slice(0,120));
  ok('mostra o erro real do navegador', /Failed to fetch/.test(msg), msg.slice(0,180));
  ok('e oferece o diagnóstico', await pg.locator('#recDiag2').isVisible());
  /* A captura fica VIVA: é a gravação em curso. Desligá-la era o defeito. */
  ok('a captura de tela continua de pé',
     await pg.evaluate(()=>{
       const v = document.getElementById('preview') || document.querySelector('video');
       const s2 = v && v.srcObject;
       return !!s2 && s2.getTracks().some(t => t.readyState === 'live');
     }));
  await pg.waitForTimeout(4000);
  await pg.click('#recStop');
  await pg.waitForFunction(()=>document.getElementById('rec').offsetParent!==null,null,{timeout:60000});
  ok('e no fim há quadros guardados, que é o que a gravação salvou',
     (await pg.locator('#thumbs figure').count()) >= 1,
     String(await pg.locator('#thumbs figure').count()));
  ok('sem erro de JS', erros.length===0, erros.join(' | ').slice(0,140));
  await pg.close();
}

await br.close(); srv.close();
console.log(falhas?`\n${falhas} FALHA(S)`:'\nDegrau de linhas: tudo passou.');
process.exit(falhas?1:0);
