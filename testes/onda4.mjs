/* Onda 4: as saídas novas, o papel, o perfil em arquivo e o PWA. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT=`${RAIZ_WS}/public`;
const T={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png','.webm':'video/webm','.webmanifest':'application/manifest+json','.jpg':'image/jpeg'};
const jspdf=fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
const srv=http.createServer((q,r)=>{
  if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')}
  const u=decodeURIComponent(q.url.split('?')[0]);
  let f=path.join(ROOT,u==='/'?'index.html':u);
  if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
  if(!fs.existsSync(f)&&fs.existsSync(f+'.html'))f=f+'.html';
  if(!fs.existsSync(f)){r.writeHead(404);return r.end()}
  r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});r.end(fs.readFileSync(f));
});
await new Promise(r=>srv.listen(8922,r));
const br=await chromium.launch({executablePath:CHROME_WS});
let falhas=0; const ok=(n,c,e)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e?'  → '+e:''));if(!c)falhas++};
const ctx=await br.newContext({acceptDownloads:true});
const pg=await ctx.newPage();
const erros=[]; pg.on('pageerror',e=>erros.push(e.message));
await pg.route('**/jspdf**',r=>r.fulfill({status:200,headers:{'content-type':'text/javascript','access-control-allow-origin':'*'},body:jspdf}));
await pg.goto('http://localhost:8922/app?lang=pt');
// o cenário virou obrigatório ANTES de o vídeo entrar; a escolha específica
// de cada bloco continua mais abaixo e ganha desta.
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.setInputFiles('#file','/tmp/amostra.webm');
await pg.waitForTimeout(2400);
await pg.fill('#tr','WEBVTT\n\n00:00:00.000 --> 00:00:04.000\nAbri a transacao ME21N\n\n00:00:04.100 --> 00:00:08.000\nSalvei sem centro de custo');
await pg.dispatchEvent('#tr','input');
await pg.selectOption('#mode','count'); await pg.fill('#count','3');
await pg.click('#extract');
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=3,null,{timeout:40000});
await pg.selectOption('#modelo','evidencia');
await pg.waitForTimeout(250);
await pg.locator('#evBox').evaluate(el=>el.open=true);
await pg.fill('#evCaso','UAT-77');
await pg.fill('#evQuem','Leandro B.');
await pg.locator('#thumbs input.nota').first().fill('Espera: o sistema recusa');
await pg.waitForTimeout(250);

const baixar = async (sel, destino) => {
  const d=pg.waitForEvent('download',{timeout:60000});
  await pg.click(sel);
  const dl=await d; await dl.saveAs(destino);
  return dl.suggestedFilename();
};

console.log('\n[1] HTML autocontido');
{
  const nome = await baixar('#html','/tmp/o4.html');
  ok('nome do arquivo pelo caso de teste', nome==='evidencia-UAT-77.html', nome);
  const h = fs.readFileSync('/tmp/o4.html','utf8');
  ok('é um documento inteiro', /^<!DOCTYPE html>/.test(h));
  ok('as imagens vão embutidas', (h.match(/src="data:image\/jpeg/g)||[]).length===3);
  ok('traz o caso de teste no título', /<title>UAT-77<\/title>/.test(h));
  ok('numera os passos', /Passo 1 de 3/.test(h));
  ok('traz a anotação', /Espera: o sistema recusa/.test(h));
  ok('traz a fala do trecho', /ME21N/.test(h));
  ok('e não depende de nada externo', !/<script|<link rel="stylesheet"/.test(h));
}

console.log('\n[2] Markdown');
{
  await baixar('#md','/tmp/o4.md');
  const m = fs.readFileSync('/tmp/o4.md','utf8');
  ok('título em markdown', /^# UAT-77/m.test(m));
  ok('um cabeçalho por passo', (m.match(/^## /gm)||[]).length===3);
  ok('imagem embutida em base64', /!\[.*\]\(data:image\/jpeg/.test(m));
  ok('a fala vai como citação', /^> .*ME21N/m.test(m));
}

console.log('\n[3] CSV');
{
  await baixar('#csv','/tmp/o4.csv');
  const c = fs.readFileSync('/tmp/o4.csv','utf8');
  ok('tem BOM para o Excel abrir certo', c.charCodeAt(0)===0xFEFF);
  ok('separa por ponto e vírgula', c.split('\n')[0].split(';').length===7, c.split('\n')[0]);
  ok('uma linha por passo mais o cabeçalho', c.trim().split(/\r?\n/).length===4);
  ok('a anotação está lá', /Espera: o sistema recusa/.test(c));
}

console.log('\n[4] papel Carta');
{
  await pg.selectOption('#papel','letter');
  await pg.waitForTimeout(150);
  await baixar('#go','/tmp/o4-carta.pdf');
  const b = fs.readFileSync('/tmp/o4-carta.pdf').toString('latin1');
  // 215.9 x 279.4 mm = 612 x 792 pt
  ok('o PDF sai em Carta', /\/MediaBox\s*\[\s*0\s+0\s+612\.?\d*\s+792\.?\d*\s*\]/.test(b),
     (b.match(/\/MediaBox[^\]]*\]/)||[''])[0]);
  await pg.selectOption('#papel','a4');
  await pg.waitForTimeout(150);
  await baixar('#go','/tmp/o4-a4.pdf');
  const a = fs.readFileSync('/tmp/o4-a4.pdf').toString('latin1');
  ok('e A4 continua A4', /\/MediaBox\s*\[\s*0\s+0\s+595(\.\d+)?\s+841(\.\d+)?\s*\]/.test(a),
     (a.match(/\/MediaBox[^\]]*\]/)||[''])[0]);
}

console.log('\n[5] perfil em arquivo');
{
  const nome = await baixar('#evSalvar','/tmp/o4-perfil.json');
  ok('o perfil baixa', /perfil-walkstamp\.json/.test(nome), nome);
  const p = JSON.parse(fs.readFileSync('/tmp/o4-perfil.json','utf8'));
  ok('leva quem executou', p.evQuem==='Leandro B.');
  ok('e não leva o caso de teste', !('evCaso' in p));
  await pg.fill('#evQuem','');
  await pg.waitForTimeout(200);
  await pg.setInputFiles('#evArq','/tmp/o4-perfil.json');
  await pg.waitForTimeout(500);
  ok('e volta ao ser aberto', (await pg.locator('#evQuem').inputValue())==='Leandro B.');
}

console.log('\n[6] PWA');
{
  const r = await pg.request.get('http://localhost:8922/manifest.webmanifest');
  ok('o manifesto existe', r.status()===200);
  const m = JSON.parse(await r.text());
  ok('abre direto na ferramenta', m.start_url.startsWith('/app'), m.start_url);
  ok('tem ícone', (m.icons||[]).length>=1);
  const sw = await pg.request.get('http://localhost:8922/sw.js');
  ok('o service worker existe', sw.status()===200);
  const t = await sw.text();
  ok('é rede-primeiro', /fetch\(req\)\.then/.test(t));
  ok('e não toca em origem de fora', /url\.origin !== self\.location\.origin/.test(t));
  ok('a ferramenta declara o manifesto',
     await pg.locator('link[rel=manifest]').count()===1);
}

ok('sem erro de JS', erros.length===0, erros.join(' | ').slice(0,250));
await br.close(); srv.close();
console.log(falhas?`\n${falhas} FALHA(S)`:'\nOnda 4: tudo passou.');
process.exit(falhas?1:0);
