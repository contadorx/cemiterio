import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT=`${RAIZ_WS}/public`;
const puro=fs.readFileSync(ROOT+'/app.html','utf8');
/* O build publicado passou a sair COM as credenciais do Drive, então o teste
   inverteu: a variante "desligado" é produzida esvaziando as constantes, e a
   "configurado" é o arquivo como ele sai. Antes era o contrário, e no dia em
   que as chaves entraram no build o teste passou a medir o mesmo caso duas
   vezes — sem falhar, que é o pior jeito de um teste morrer. */
const semGoogle = txt => txt
  .replace(/const GOOGLE_CLIENT_ID = '[^']*'/, "const GOOGLE_CLIENT_ID = ''")
  .replace(/const GOOGLE_API_KEY   = '[^']*'/, "const GOOGLE_API_KEY   = ''")
  .replace(/const GOOGLE_APP_ID    = '[^']*'/, "const GOOGLE_APP_ID    = ''");
const desligado = semGoogle(puro);
const cfg = puro;
let atual=desligado;
const srv=http.createServer((q,r)=>{
  if (q.url.startsWith('/_vercel/')) { r.writeHead(200, {'Content-Type':'text/javascript'}); return r.end('') }
  // o service worker precisa chegar como JavaScript
  if (q.url.split('?')[0] === '/sw.js') {
    r.writeHead(200, {'Content-Type':'text/javascript'});
    return r.end(fs.readFileSync(`${RAIZ_WS}/public/sw.js`));
  }
  r.writeHead(200,{'Content-Type':'text/html'});r.end(atual)});
await new Promise(r=>srv.listen(8896,r));
const br=await chromium.launch({executablePath:CHROME_WS});
let falhas=0;
const ok=(nome,cond)=>{ console.log((cond?'  ok   ':'  FALHA')+'  '+nome); if(!cond) falhas++; };

async function pagina(){
  const ctx=await br.newContext(); const pg=await ctx.newPage();
  const erros=[], google=[];
  pg.on('pageerror',e=>erros.push(e.message));
  pg.on('console',m=>{ if(m.type()==='error'&&!/ERR_TUNNEL|ERR_NAME|Failed to load resource/.test(m.text())) erros.push(m.text()); });
  pg.on('request',r=>{ if(/google|gstatic/.test(new URL(r.url()).hostname)) google.push(r.url()); });
  return {pg,erros,google,ctx};
}

console.log('\n[1] sem configuracao');
atual=desligado;
let {pg,erros,google,ctx}=await pagina();
await pg.goto('http://localhost:8896/app.html?lang=pt'); await pg.waitForTimeout(700);
// o cenário de uso passou a ser obrigatório: sem ele o botão Gravar cobra a escolha
await pg.selectOption('#modelo', 'ia').catch(() => {});
ok('sem as três constantes, a linha do Drive não existe',
   await pg.locator('#driveRow').isHidden());
ok('e o teste realmente desligou alguma coisa — o arquivo publicado vem ligado',
   /GOOGLE_CLIENT_ID = '[^']+'/.test(puro), 'build sem credenciais?');
ok('zero requisicoes ao Google', google.length===0);
ok('sem erro de JS', erros.length===0 || (console.log('   ',erros),false));
await ctx.close();

console.log('\n[2] configurado');
atual=cfg;
({pg,erros,google,ctx}=await pagina());
await pg.goto('http://localhost:8896/app.html?lang=pt'); await pg.waitForTimeout(700);
// o cenário de uso passou a ser obrigatório: sem ele o botão Gravar cobra a escolha
await pg.selectOption('#modelo', 'ia').catch(() => {});
ok('linha do Drive visivel', await pg.locator('#driveRow').isVisible());
ok('botao parar escondido', await pg.locator('#driveStop').isHidden());
ok('nada do Google carregado antes do clique', google.length===0);
for(const [L,esp] of [['pt','Abrir do Google Drive'],['en','Open from Google Drive'],['es','Abrir desde Google Drive']]){
  await pg.click('#idiomas a[data-l="'+L+'"]'); await pg.waitForTimeout(150);
  ok(`rotulo ${L}`, (await pg.locator('#drive').textContent()).trim()===esp);
}
await pg.click('#idiomas a[data-l="es"]'); await pg.waitForTimeout(150);
ok('es: gravacao traduzida (bug corrigido)', (await pg.locator('#rec').textContent()).trim()==='Grabar la pantalla');
ok('es: dica do Drive traduzida', (await pg.locator('#driveMsg').textContent()).includes('navegador'));
ok('sem erro de JS', erros.length===0 || (console.log('   ',erros),false));

console.log('\n[3] clique carrega o SDK do Google sob demanda');
await pg.click('#idiomas a[data-l="pt"]'); await pg.waitForTimeout(150);
await pg.locator('#drive').click();
await pg.waitForTimeout(2500);
ok('scripts do Google requisitados apos o clique', google.some(u=>/accounts\.google\.com\/gsi|apis\.google\.com/.test(u)));
ok('mensagem de estado mudou', (await pg.locator('#driveMsg').textContent()).length>0);
console.log('    urls:', [...new Set(google.map(u=>new URL(u).origin))].join(', ') || '(nenhuma)');
console.log('    mensagem:', JSON.stringify((await pg.locator('#driveMsg').textContent()).trim().slice(0,90)));
await ctx.close();
await br.close(); srv.close();
console.log(falhas? `\n${falhas} FALHA(S)`:'\nTodas as verificacoes passaram.');
process.exit(falhas?1:0);
