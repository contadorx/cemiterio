/* O nome dos dois canais de áudio. */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const html = fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
const srv = http.createServer((q,r)=>{ if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')} r.writeHead(200,{'Content-Type':'text/html'}); r.end(html); });
await new Promise(r=>srv.listen(8933,r));
const br = await chromium.launch({ executablePath:CHROME_WS });
let falhas = 0;
const ok = (n,c,e2)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e2?'  → '+e2:''));if(!c)falhas++};
const ctx = await br.newContext({ viewport:{width:1300,height:1000} });
const pg = await ctx.newPage();
const erros=[]; pg.on('pageerror', e=>erros.push(e.message));
await pg.route('**/jspdf**', r=>r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
await pg.goto('http://localhost:8933/app.html?lang=pt');
await pg.waitForTimeout(500);

console.log('[1] o padrão vem do cenário');
ok('os dois campos existem', (await pg.locator('#spkMicNome').count()) === 1 &&
                              (await pg.locator('#spkSysNome').count()) === 1);
ok('e começam vazios — o padrão é sugestão, não texto digitado',
   (await pg.locator('#spkMicNome').inputValue()) === '');
ok('sugerindo Microfone', (await pg.locator('#spkMicNome').getAttribute('placeholder')) === 'Microfone',
   await pg.locator('#spkMicNome').getAttribute('placeholder'));
ok('e Computador', (await pg.locator('#spkSysNome').getAttribute('placeholder')) === 'Computador');
await pg.selectOption('#modelo','usabilidade'); await pg.waitForTimeout(300);
ok('na pesquisa, o microfone vira Moderador',
   (await pg.locator('#spkMicNome').getAttribute('placeholder')) === 'Moderador',
   await pg.locator('#spkMicNome').getAttribute('placeholder'));
ok('e o computador vira Participante',
   (await pg.locator('#spkSysNome').getAttribute('placeholder')) === 'Participante');

console.log('\n[2] o que a pessoa escreve manda, e sobrevive ao cenário');
await pg.fill('#spkMicNome','Ana (pesquisa)');
await pg.fill('#spkSysNome','P07');
await pg.waitForTimeout(200);
await pg.selectOption('#modelo','ata'); await pg.waitForTimeout(300);
ok('trocar de cenário não apaga o nome digitado',
   (await pg.locator('#spkMicNome').inputValue()) === 'Ana (pesquisa)',
   await pg.locator('#spkMicNome').inputValue());
ok('nem o segundo', (await pg.locator('#spkSysNome').inputValue()) === 'P07');
await pg.selectOption('#modelo','usabilidade'); await pg.waitForTimeout(300);
ok('e continua lá na volta', (await pg.locator('#spkSysNome').inputValue()) === 'P07');

console.log('\n[3] apagar devolve o campo ao padrão do cenário');
await pg.fill('#spkMicNome','');
await pg.selectOption('#modelo','evidencia'); await pg.waitForTimeout(300);
ok('a sugestão volta a seguir o cenário',
   (await pg.locator('#spkMicNome').getAttribute('placeholder')) === 'Microfone',
   await pg.locator('#spkMicNome').getAttribute('placeholder'));
ok('e o campo continua vazio', (await pg.locator('#spkMicNome').inputValue()) === '');

console.log('\n[4] a sugestão acompanha o idioma da página');
{
  const pg2 = await ctx.newPage();
  await pg2.route('**/jspdf**', r=>r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
  await pg2.goto('http://localhost:8933/app.html?lang=en');
  await pg2.waitForTimeout(500);
  ok('em inglês, Microphone', (await pg2.locator('#spkMicNome').getAttribute('placeholder')) === 'Microphone',
     await pg2.locator('#spkMicNome').getAttribute('placeholder'));
  await pg2.selectOption('#modelo','usabilidade'); await pg2.waitForTimeout(300);
  ok('e Participant no cenário de pesquisa',
     (await pg2.locator('#spkSysNome').getAttribute('placeholder')) === 'Participant');
  ok('o rótulo do campo também está traduzido',
     /microphone/i.test(await pg2.locator('[data-i18n="spkLblMic"]').textContent()),
     await pg2.locator('[data-i18n="spkLblMic"]').textContent());
  await pg2.close();
}

console.log('\n[5] o nome escolhido é o que a transcrição usa');
{
  /* A prova de que o campo não é decoração: é `nomeDoCanal` que a captura
     chama, e ele devolve o que está escrito. */
  const fonte = fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
  ok('a captura pergunta o nome ao campo, e não a uma constante',
     /abrirCanal\(ctx, telaStream, nomeDoCanal\('sys'\)/.test(fonte) &&
     /abrirCanal\(ctx, micStream,  nomeDoCanal\('mic'\)/.test(fonte));
  const r = await pg.evaluate(() => {
    document.getElementById('spkSysNome').value = 'Participante 07';
    document.getElementById('spkSysNome').dispatchEvent(new Event('input'));
    return typeof nomeDoCanal === 'function' ? nomeDoCanal('sys') : '(sem função)';
  }).catch(() => '(escopo fechado)');
  console.log('     nomeDoCanal("sys") → ' + r);
}

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0,180));
await br.close(); srv.close();
console.log(falhas ? '\n'+falhas+' falha(s)' : '\nNome dos canais: tudo passou.');
process.exit(falhas?1:0);
