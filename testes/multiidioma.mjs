/* O mesmo documento em vários idiomas, num pacote só.
   O tradutor embutido do navegador é falsificado — o Chromium do teste não traz
   o modelo — e o que se prova é a mecânica: traduzir, gerar, e DEVOLVER o
   estado original no fim. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';
import { execSync } from 'child_process';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const html = fs.readFileSync(`${RAIZ_WS}/public/app.html`,'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
const srv = http.createServer((q,r)=>{ if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')} r.writeHead(200,{'Content-Type':'text/html'}); r.end(html); });
await new Promise(r=>srv.listen(8930,r));
const br = await chromium.launch({ executablePath:CHROME_WS });
let falhas = 0;
const ok = (n,c,e2)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e2?'  → '+e2:''));if(!c)falhas++};
const ctx = await br.newContext({ acceptDownloads:true, viewport:{width:1300,height:1000} });
await ctx.addInitScript(() => {
  window.Translator = {
    async availability({ sourceLanguage, targetLanguage }) {
      return (targetLanguage === 'de') ? 'unavailable' : 'downloadable';
    },
    async create({ targetLanguage }) {
      return { translate: async txt => `[${targetLanguage}] ` + txt, destroy(){} };
    }
  };
});
const pg = await ctx.newPage();
const erros=[]; pg.on('pageerror', e=>erros.push(e.message));
await pg.route('**/jspdf**', r=>r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
await pg.goto('http://localhost:8930/app.html?lang=pt');
await pg.selectOption('#modelo','tutorial');
await pg.setInputFiles('#file','/tmp/amostra.webm'); await pg.waitForTimeout(2500);
await pg.selectOption('#mode','count'); await pg.fill('#count','2');
await pg.locator('#extract').click();
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=2,null,{timeout:40000});
await pg.waitForTimeout(400);
const ORIGINAL = 'WEBVTT\n\n00:00:00.000 --> 00:00:09.000\nAbri a transacao e informei o fornecedor';
await pg.fill('#tr', ORIGINAL);
await pg.dispatchEvent('#tr','input');
await pg.locator('#thumbs figure').nth(0).locator('input.nota').fill('acesse a transacao');
await pg.locator('#evBox').evaluate(e=>e.open=true);
await pg.fill('#evCaso','Lancar pedido');
await pg.waitForTimeout(300);

console.log('[1] a caixa dos idiomas');
ok('o botão existe ao lado da tradução', await pg.locator('#multiModo').isVisible());
await pg.locator('#multiModo').click(); await pg.waitForTimeout(200);
ok('a caixa abriu', await pg.locator('#multiBox').isVisible());
ok('com cinco idiomas', (await pg.locator('#multiLinguas input').count()) === 5);
ok('e diz por que PDF e Word não entram',
   /um idioma por vez/.test(await pg.locator('[data-i18n="multiComo"]').textContent()));
await pg.locator('#multiGerar').click(); await pg.waitForTimeout(300);
ok('sem marcar nada, ele pede', /pelo menos um idioma/.test(await pg.locator('#multiMsg').textContent()),
   await pg.locator('#multiMsg').textContent());

console.log('\n[2] gerar o pacote');
await pg.locator('#multiLinguas input[value="pt"]').check();
await pg.locator('#multiLinguas input[value="en"]').check();
await pg.locator('#multiLinguas input[value="es"]').check();
{
  const dl = pg.waitForEvent('download',{timeout:60000});
  await pg.locator('#multiGerar').click();
  const d = await dl; await d.saveAs('/tmp/idiomas.zip');
  ok('saiu um zip', fs.existsSync('/tmp/idiomas.zip'));
  const lista = execSync('unzip -Z1 /tmp/idiomas.zip',{encoding:'utf8'}).trim().split('\n');
  console.log('     ' + lista.join('  '));
  /* Um arquivo por idioma, e não dois. O Markdown saiu do pacote: ele embute
     as MESMAS imagens em base64 que o HTML, ou seja, dobrava o tamanho do zip
     para entregar o mesmo conteúdo num segundo formato. Quem precisa dele
     continua tendo pelo "Traduzir", um idioma por vez. */
  ok('três arquivos: um por idioma', lista.length === 3, lista.join(' '));
  ok('e nenhum Markdown no pacote', !lista.some(x=>/\.md$/.test(x)), lista.join(' '));
  ok('cada idioma no nome do arquivo',
     ['pt','en','es'].every(l => lista.some(x => new RegExp(`-${l}\\.html$`).test(x))),
     lista.join(' '));
}
{
  const en = execSync('unzip -p /tmp/idiomas.zip "*-en.html"',{encoding:'utf8'});
  const pt = execSync('unzip -p /tmp/idiomas.zip "*-pt.html"',{encoding:'utf8'});
  ok('o inglês foi traduzido', /\[en\] acesse a transacao/.test(en), (en.match(/\[en\][^<\n]*/)||[''])[0]);
  ok('o português saiu do texto original, sem tradução de ida e volta',
     /acesse a transacao/.test(pt) && !/\[[a-z]{2}\] acesse a transacao/.test(pt),
     (pt.match(/[^>\n]*acesse[^<\n]*/)||[''])[0]);
  ok('e a imagem está nos dois',
     /<img[^>]+src="data:image/.test(en) && /<img[^>]+src="data:image/.test(pt));
}

console.log('\n[3] o estado da tela volta como estava');
{
  /* Esta é a parte que quebra sozinha se ninguém olhar: gerar cinco idiomas e
     deixar a aba em alemão é perder o trabalho de quem estava revisando. */
  await pg.waitForTimeout(500);
  ok('a transcrição voltou ao original', (await pg.locator('#tr').inputValue()) === ORIGINAL,
     (await pg.locator('#tr').inputValue()).split('\n').pop());
  ok('e a anotação do passo também',
     (await pg.locator('#thumbs figure').nth(0).locator('input.nota').inputValue()) === 'acesse a transacao',
     await pg.locator('#thumbs figure').nth(0).locator('input.nota').inputValue());
  ok('a mensagem conta quantos idiomas', /3 idioma/.test(await pg.locator('#multiMsg').textContent()),
     await pg.locator('#multiMsg').textContent());
}

console.log('\n[4] par de idioma que não existe é dito, não engolido');
{
  await pg.locator('#multiLinguas input[value="pt"]').uncheck();
  await pg.locator('#multiLinguas input[value="en"]').uncheck();
  await pg.locator('#multiLinguas input[value="es"]').uncheck();
  await pg.locator('#multiLinguas input[value="de"]').check();
  await pg.locator('#multiGerar').click();
  await pg.waitForTimeout(900);
  ok('avisa que o par não existe', /par/i.test(await pg.locator('#multiMsg').textContent()),
     await pg.locator('#multiMsg').textContent());
  ok('e a tela continua no original', (await pg.locator('#tr').inputValue()) === ORIGINAL);
}

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0,180));
await br.close(); srv.close();
console.log(falhas ? '\n'+falhas+' falha(s)' : '\nVários idiomas: tudo passou.');
process.exit(falhas?1:0);
