/* Passo a passo, ordem das permissões e a janelinha de controle. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT=`${RAIZ_WS}/public`;
const T={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png','.webm':'video/webm','.vtt':'text/vtt','.jpg':'image/jpeg','.mp4':'video/mp4'};
const srv=http.createServer((q,r)=>{
  if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')}
  const u=decodeURIComponent(q.url.split('?')[0]); let f=path.join(ROOT,u==='/'?'index.html':u);
  if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
  if(!fs.existsSync(f)){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});r.end(fs.readFileSync(f));
});
await new Promise(r=>srv.listen(8889,r));
const br=await chromium.launch({executablePath:CHROME_WS,
  args:['--autoplay-policy=no-user-gesture-required','--auto-accept-this-tab-capture']});
let falhas=0; const ok=(n,c,e)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e?'  → '+e:''));if(!c)falhas++};

const FAKE=`export const env={allowLocalModels:true,allowRemoteModels:true,backends:{onnx:{wasm:{}}}};
export async function pipeline(){let n=0;return async d=>{n++;return {chunks:[{timestamp:[0,2],text:'fala '+n}]}}}`;

async function pagina(opts={}){
  const ctx=await br.newContext(); const pg=await ctx.newPage();
  const erros=[]; pg.on('pageerror',e=>erros.push(e.message));
  await pg.route('**/rpc/*stamp_*', r=>r.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:'null'}));
  await pg.route('**/@huggingface/transformers**', r=>r.fulfill({status:200,
    headers:{'content-type':'text/javascript','access-control-allow-origin':'*'},body:FAKE}));
  await pg.route('**/onnxruntime-web**', r=>r.fulfill({status:200,
    headers:{'content-type':'application/wasm','access-control-allow-origin':'*'},body:'x'}));
  if (opts.midia) await pg.addInitScript(() => {
    window.__ordem = [];
    function tela(){ const c=document.createElement('canvas');c.width=480;c.height=270;
      const x=c.getContext('2d');const cor=['#e02020','#1060e0','#10a040','#f0f0f0'];let n=0;
      x.fillStyle=cor[0];x.fillRect(0,0,480,270);
      setInterval(()=>{n++;x.fillStyle=cor[Math.floor(n/25)%4];x.fillRect(0,0,480,270);},100);
      return c.captureStream(12); }
    function tom(hz){ const ac=new AudioContext();const o=ac.createOscillator();o.frequency.value=hz;
      const g=ac.createGain();g.gain.value=.3;const d=ac.createMediaStreamDestination();
      o.connect(g);g.connect(d);o.start();return d.stream; }
    navigator.mediaDevices.getDisplayMedia = async () => {
      window.__ordem.push('tela');
      await new Promise(r=>setTimeout(r,50));
      return new MediaStream([...tela().getVideoTracks(), ...tom(220).getAudioTracks()]);
    };
    navigator.mediaDevices.getUserMedia = async () => { window.__ordem.push('mic'); return tom(440); };
  });
  await pg.goto('http://localhost:8889/app.html?lang=pt');
  // o cenário de uso passou a ser obrigatório: sem ele o botão Gravar cobra a escolha
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  await pg.waitForTimeout(400);
  return {pg,ctx,erros};
}

console.log('\n[P1] estado inicial: só o passo 1 está aberto');
{
  const {pg,ctx,erros}=await pagina();
  const inerte = async id => (await pg.locator('#'+id).getAttribute('inert')) !== null;
  /* O passo 2 nasce ABERTO e não travado. Fechado, ele era uma faixa cinza que
     não dizia o que fazia, e a pergunta que ele gerava era "isto só serve para
     vídeo enviado?" — não serve: o modelo de voz, o idioma e a placa valem para
     a gravação ao vivo também, e numa gravação nunca existe "vídeo carregado"
     antes de começar. O que fechou no lugar dele foi a GAVETA dos ajustes: eram
     eles, dezesseis controles, a parede. A trava que vale continua sendo a do
     botão de ação. */
  ok('passo 2 aberto e alcançável',
     !(await pg.locator('#cardTr').evaluate(e=>e.classList.contains('fechado'))));
  ok('e os ajustes dele nascem guardados na gaveta',
     !(await pg.locator('#ajustesCx').evaluate(e=>e.classList.contains('aberta'))));
  ok('e a AÇÃO do passo 2 continua desabilitada', await pg.locator('#auto').isDisabled());
  ok('as opções de frames nascem alcançáveis', !(await inerte('framesCorpo')));
  ok('passo 5 (prompt) travado',      await inerte('promptCard'));
  ok('mas Recomeçar continua ao alcance',
     await pg.evaluate(() => !document.getElementById('reset').closest('[inert]')));
  ok('e a dica explica o que destrava',
     /etapa 1/.test(await pg.locator('#cardTr .lockHint').textContent()),
     await pg.locator('#cardTr .lockHint').textContent());
  ok('o bloco travado fica cinza',
     parseFloat(await pg.locator('#promptCard').evaluate(e=>getComputedStyle(e).opacity)) < .6);
  // travado de verdade: não dá para tabular para dentro
  ok('controles travados saem da ordem de foco',
     await pg.evaluate(() => { const b=document.getElementById('auto'); b.focus();
                               return document.activeElement !== b; }));
  ok('sem erro de JS', erros.length===0, erros.join(' | ').slice(0,140));
  await ctx.close();
}

console.log('\n[P2] carregar um vídeo destrava e leva ao próximo passo');
{
  const {pg,ctx,erros}=await pagina();
  await pg.setInputFiles('#file','/tmp/cinco.webm');
  await pg.waitForFunction(()=>!document.getElementById('extract').disabled,null,{timeout:20000});
  await pg.waitForTimeout(500);
  ok('passo 2 aberto', !(await pg.locator('#cardTr').evaluate(e=>e.classList.contains('fechado'))));
  ok('as opções de frames destravaram', await pg.locator('#framesCorpo').getAttribute('inert') === null);
  /* A TRAVA DO PASSO 4 É SOBRE FRAMES, e não sobre tempo.
     Esta linha afirmava "continua travado" meio segundo depois de abrir o
     vídeo, com o argumento "ainda não há frames". Ela era uma CORRIDA contra a
     varredura automática — e a varredura automática é comportamento de
     projeto: as telas começam a sair sozinhas assim que o vídeo abre. Medido:
     o primeiro quadro chega antes dos 500 ms.
     Então o que se afirma agora é a REGRA, e não o instante: o passo 4 está
     destravado exatamente quando existe quadro. Assim ela vale no meio
     segundo, no quinto e depois de trocar a máquina. */
  {
    const est = await pg.evaluate(() => ({
      travado: document.getElementById('promptCard').getAttribute('inert') !== null,
      quadros: document.querySelectorAll('#thumbs figure').length,
    }));
    ok('o passo do prompt destrava exatamente quando existe quadro',
       est.travado === (est.quadros === 0), JSON.stringify(est));
  }
  ok('a página rolou até o passo 2',
     await pg.evaluate(() => window.scrollY > 40), 'scrollY=' + await pg.evaluate(()=>window.scrollY));

  await pg.click('#extract');
  await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>0,null,{timeout:60000});
  await pg.waitForTimeout(700);
  ok('a revisão apareceu', !(await pg.locator('#prevCard').evaluate(e=>e.classList.contains('hide'))));
  ok('o prompt destravou com os frames',
     await pg.locator('#promptCard').getAttribute('inert') === null);
  ok('sem erro de JS', erros.length===0, erros.join(' | ').slice(0,140));
  await ctx.close();
}

console.log('\n[P3] ordem das permissões: microfone ANTES da tela');
{
  const {pg,ctx,erros}=await pagina({midia:true});
  await pg.click('#rec');
  await pg.waitForFunction(()=>window.__ordem && window.__ordem.length>=2,null,{timeout:20000});
  const ordem = await pg.evaluate(()=>window.__ordem);
  console.log('     ordem observada:', ordem.join(' → '));
  ok('microfone é pedido primeiro', ordem[0]==='mic', ordem.join(' → '));
  ok('a tela é pedida por último',  ordem[ordem.length-1]==='tela');
  await pg.waitForTimeout(2500);
  ok('gravando (botão Parar visível)', await pg.locator('#recStop').isVisible());
  /* Passou a existir uma contagem de 3 antes do relógio zerar, e Parar durante
     ela CANCELA em vez de encerrar — é de propósito: três segundos depois de
     escolher a tela é quando se percebe que foi a janela errada. Aqui a gente
     quer a gravação de verdade, então espera a contagem passar. */
  await pg.waitForTimeout(2600);
  await pg.click('#recStop');
  await pg.waitForFunction(()=>document.getElementById('rec').offsetParent!==null,null,{timeout:25000});
  await pg.waitForTimeout(500);
  const msg = await pg.locator('#recMsg').textContent();
  /* A frase do fim encurtou de propósito: "nenhum vídeo foi guardado" saiu da
   mensagem porque ela é promessa do produto, dita na página e na política, e
   não informação de resultado. O que sobra é o que se faz alguma coisa com. */
ok('a mensagem final diz o que saiu, e só',
   /Pronto: \d\d:\d\d de captura, \d+ quadros e \d+ falas\./.test(msg) && !/tempo real/.test(msg), msg);
  ok('depois de gravar, "transcrever" fica travado (não morto)',
     await pg.locator('#trAuto').getAttribute('inert') !== null);
  ok('e a tela explica por quê', /ao vivo|só de quadros/.test(await pg.locator('#hintTr').textContent()),
     (await pg.locator('#hintTr').textContent()).slice(0,60));
  ok('o texto da transcrição continua editável',
     await pg.locator('#trManual').getAttribute('inert') === null);
  ok('o passo 2 sumiu de vez: virou um só com os frames',
     (await pg.locator('#cardFrames').count()) === 0);
  ok('e os ajustes de frames ficam travados: não há vídeo para varrer de novo',
     await pg.locator('#framesCorpo').getAttribute('inert') !== null);
  ok('sem erro de JS', erros.length===0, erros.join(' | ').slice(0,140));
  await ctx.close();
}

console.log('\n[P4] cancelar o seletor de tela não trava o botão (era bug)');
{
  const ctx=await br.newContext(); const pg=await ctx.newPage();
  const erros=[]; pg.on('pageerror',e=>erros.push(e.message));
  await pg.route('**/rpc/*stamp_*', r=>r.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:'null'}));
  await pg.route('**/@huggingface/transformers**', r=>r.fulfill({status:200,
    headers:{'content-type':'text/javascript','access-control-allow-origin':'*'},body:FAKE}));
  await pg.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new Error('sem mic'); };
    navigator.mediaDevices.getDisplayMedia = async () => { throw new DOMException('cancelou','NotAllowedError'); };
  });
  await pg.goto('http://localhost:8889/app.html?lang=pt'); await pg.waitForTimeout(400);
  // o cenário de uso passou a ser obrigatório: sem ele o botão Gravar cobra a escolha
  await pg.selectOption('#modelo', 'ia').catch(() => {});

  await pg.click('#rec');
  await pg.waitForFunction(()=>/cancelou|permiss/i.test(document.getElementById('recMsg').textContent),
                           null,{timeout:20000});
  ok('primeiro cancelamento vira recado', true, (await pg.locator('#recMsg').textContent()).slice(0,60));
  ok('o botão Gravar volta a ficar disponível', !(await pg.locator('#rec').isDisabled()));

  // e o segundo clique tem que tentar de novo — antes disto o botão morria
  const tentou = await pg.evaluate(async () => {
    let n = 0;
    navigator.mediaDevices.getDisplayMedia = async () => { n++; throw new DOMException('x','NotAllowedError'); };
    document.getElementById('rec').click();
    await new Promise(r => setTimeout(r, 3000));
    return n;
  });
  ok('o segundo clique realmente tenta de novo', tentou === 1, tentou + ' tentativa(s)');
  ok('sem erro de JS', erros.length===0, erros.join(' | ').slice(0,140));
  await ctx.close();
}

await br.close(); srv.close();
console.log(falhas?`\n${falhas} FALHA(S)`:'\nPassos e gravação: tudo passou.');
process.exit(falhas?1:0);
