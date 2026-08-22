/* O verificador: um pacote íntegro passa, um pacote adulterado é pego. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { criarProxy, exigirNext } from './proxy.mjs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
await exigirNext();
const ROOT=`${RAIZ_WS}/public`;
const T={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png','.webm':'video/webm','.jpg':'image/jpeg','.vtt':'text/vtt','.mp4':'video/mp4'};
const jspdf=fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
/* O site virou Next.js: as páginas não existem mais como arquivo em public/.
   O servidorzinho estático daqui virou um encaminhador para o Next — mesma
   porta, mesmas URLs no teste, e quem responde é o produto de verdade. */
const srv = criarProxy();
await new Promise(r=>srv.listen(8921,r));
const br=await chromium.launch({executablePath:CHROME_WS});
let falhas=0; const ok=(n,c,e)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e?'  → '+e:''));if(!c)falhas++};
const ctx=await br.newContext({acceptDownloads:true});
const pg=await ctx.newPage();
const erros=[]; pg.on('pageerror',e=>erros.push(e.message));
await pg.route('**/jspdf**',r=>r.fulfill({status:200,headers:{'content-type':'text/javascript','access-control-allow-origin':'*'},body:jspdf}));

console.log('\n[1] gerar um pacote com impressão digital');
await pg.goto('http://localhost:8921/app?lang=pt');
// o cenário virou obrigatório ANTES de o vídeo entrar
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.setInputFiles('#file','/tmp/amostra.webm');
await pg.waitForTimeout(2400);
await pg.selectOption('#mode','count'); await pg.fill('#count','3');
await pg.click('#extract');
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=3,null,{timeout:40000});
await pg.selectOption('#modelo','evidencia');
await pg.waitForTimeout(250);
await pg.locator('#evBox').evaluate(el=>el.open=true);
await pg.check('#evHash');
await pg.waitForTimeout(200);
{
  const dz=pg.waitForEvent('download',{timeout:60000});
  await pg.click('#zip'); (await dz).saveAs('/tmp/ver-ok.zip');
  await new Promise(r=>setTimeout(r,800));
  const dj=pg.waitForEvent('download',{timeout:60000});
  await pg.click('#json'); (await dj).saveAs('/tmp/ver-ok.json');
  await new Promise(r=>setTimeout(r,800));
  ok('o zip saiu', fs.existsSync('/tmp/ver-ok.zip'));
  ok('o json saiu', fs.existsSync('/tmp/ver-ok.json'));
}

const verificar = async (arquivo) => {
  await pg.goto('http://localhost:8921/verificar');
  await pg.setInputFiles('#verArq', arquivo);
  await pg.waitForFunction(()=>{
    const t=document.getElementById('verSaida').textContent;
    return /conferem|NÃO conferem|não tem|reconheci/.test(t);
  }, null, {timeout:20000});
  return (await pg.locator('#verSaida').textContent()).trim();
};

console.log('\n[2] pacote íntegro passa');
{
  const zip = await verificar('/tmp/ver-ok.zip');
  ok('o zip íntegro confere', /3 de 3 imagens conferem/.test(zip), zip.slice(0,60));
  const js = await verificar('/tmp/ver-ok.json');
  ok('o json íntegro confere', /3 de 3 imagens conferem/.test(js), js.slice(0,60));
}

console.log('\n[3] pacote adulterado é pego');
{
  // troca um byte no meio de uma das imagens do zip, mantendo o tamanho
  const b = fs.readFileSync('/tmp/ver-ok.zip');
  const alvo = b.indexOf(Buffer.from([0xFF,0xD8,0xFF]));   // início de um JPEG
  b[alvo + 900] = b[alvo + 900] ^ 0xFF;
  fs.writeFileSync('/tmp/ver-ruim.zip', b);
  const r = await verificar('/tmp/ver-ruim.zip');
  ok('o zip adulterado é reprovado', /NÃO conferem/.test(r), r.slice(0,70));
  ok('e diz qual imagem', /não confere/.test(r));
}
{
  const j = JSON.parse(fs.readFileSync('/tmp/ver-ok.json','utf8'));
  j.frames[1].sha256 = 'f'.repeat(64);
  fs.writeFileSync('/tmp/ver-ruim.json', JSON.stringify(j));
  const r = await verificar('/tmp/ver-ruim.json');
  ok('o json com hash trocado é reprovado', /1 de 3 imagens NÃO conferem/.test(r), r.slice(0,70));
}

console.log('\n[4] pacote sem impressão digital diz o que fazer');
{
  await pg.goto('http://localhost:8921/app?lang=pt');
  // o cenário virou obrigatório ANTES de o vídeo entrar
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  await pg.setInputFiles('#file','/tmp/amostra.webm');
  await pg.waitForTimeout(2400);
  await pg.selectOption('#mode','count'); await pg.fill('#count','2');
  await pg.click('#extract');
  await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=2,null,{timeout:40000});
  const dz=pg.waitForEvent('download',{timeout:60000});
  await pg.click('#zip'); (await dz).saveAs('/tmp/ver-sem.zip');
  await new Promise(r=>setTimeout(r,700));
  const r = await verificar('/tmp/ver-sem.zip');
  ok('avisa que falta a impressão digital', /não tem impressões digitais|reconheci/.test(r), r.slice(0,70));
}

console.log('\n[5] a página existe nos três idiomas e está no rodapé');
for (const rota of ['/verificar','/en/verify','/es/verificar']) {
  const resp = await pg.goto('http://localhost:8921'+rota);
  ok(rota+' responde 200', resp.status()===200, String(resp.status()));
}
{
  await pg.goto('http://localhost:8921/?lang=pt');
  const links = await pg.locator('footer a').evaluateAll(as=>as.map(a=>a.getAttribute('href')));
  ok('o rodapé leva ao verificador', links.includes('/verificar'), links.join(' '));
}

ok('sem erro de JS', erros.length===0, erros.join(' | ').slice(0,250));
await br.close(); srv.close();
console.log(falhas?`\n${falhas} FALHA(S)`:'\nVerificador: tudo passou.');
process.exit(falhas?1:0);
