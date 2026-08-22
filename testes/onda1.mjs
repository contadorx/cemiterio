/* Onda 1: perfil na aba, fuso no documento, e a lente de um passo. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs'; import zlib from 'zlib';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT=`${RAIZ_WS}/public`;
const html=fs.readFileSync(ROOT+'/app.html','utf8');
const jspdf=fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`,'utf8');
const srv=http.createServer((q,r)=>{if(q.url.startsWith('/_vercel/')){r.writeHead(200,{'Content-Type':'text/javascript'});return r.end('')}r.writeHead(200,{'Content-Type':'text/html'});r.end(html)});
await new Promise(r=>srv.listen(8908,r));
const br=await chromium.launch({executablePath:CHROME_WS});
let falhas=0; const ok=(n,c,e)=>{console.log((c?'  ok   ':'  FALHA')+'  '+n+(e?'  → '+e:''));if(!c)falhas++};
function textoDoPdf(caminho){
  const buf=fs.readFileSync(caminho); let out=''; let i=0;
  while((i=buf.indexOf('stream',i))!==-1){
    let a=i+6; if(buf[a]===13)a++; if(buf[a]===10)a++;
    const fim=buf.indexOf('endstream',a); if(fim===-1)break;
    try{out+=zlib.inflateSync(buf.subarray(a,fim)).toString('latin1')}catch(e){}
    i=fim+9;
  }
  return out;
}
const ctx=await br.newContext({acceptDownloads:true});
const pg=await ctx.newPage();
const erros=[]; pg.on('pageerror',e=>erros.push(e.message));
await pg.route('**/jspdf**',r=>r.fulfill({status:200,headers:{'content-type':'text/javascript','access-control-allow-origin':'*'},body:jspdf}));

const prep = async () => {
  // o cenário virou obrigatório ANTES de o vídeo entrar, e este teste recarrega
  // a página no meio: por isso a escolha mora AQUI, e não só depois do goto.
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  await pg.setInputFiles('#file','/tmp/amostra.webm');
  await pg.waitForTimeout(2400);
  await pg.fill('#tr','WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nAbri a transacao eme vinte e um ene\n\n00:00:03.100 --> 00:00:07.000\nSalvei sem centro de custo e o sistema recusou');
  await pg.dispatchEvent('#tr','input');
  await pg.selectOption('#mode','count'); await pg.fill('#count','3');
  await pg.click('#extract');
  /* Espera a VARREDURA ACABAR, e não "haver três miniaturas". Desde que as telas
     começam a sair sozinhas quando o vídeo entra, contar miniaturas encontra as
     da varredura automática — que estão na tela quando esta, com `count=3`, mal
     começou. O teste então media a grade errada e a lente dizia "1 de 5". */
  await pg.waitForFunction(()=>!document.getElementById('extract').disabled,null,{timeout:60000});
  await pg.waitForTimeout(300);
  await pg.selectOption('#modelo','evidencia');
  await pg.waitForTimeout(250);
};

await pg.goto('http://localhost:8908/app.html?lang=pt');
// o cenário virou obrigatório ANTES de o vídeo entrar; a escolha específica
// de cada bloco continua mais abaixo e ganha desta.
await pg.selectOption('#modelo', 'ia').catch(() => {});
await prep();

console.log('\n[1] perfil da aba');
{
  ok('o botão Esquecer começa escondido', await pg.locator('#evLimpar').isHidden());
  await pg.fill('#evQuem','Leandro B. de Oliveira');
  await pg.fill('#evSis','S4P / 100');
  await pg.fill('#evCaso','UAT-9 caso do momento');
  await pg.waitForTimeout(250);
  ok('o botão Esquecer aparece quando há perfil', await pg.locator('#evLimpar').isVisible());
  const guardado = await pg.evaluate(() => sessionStorage.getItem('Walkstamp.perfil'));
  ok('sistema e executado por foram para a sessionStorage', /Leandro/.test(guardado||'') && /S4P/.test(guardado||''), guardado);
  ok('o caso de teste NÃO foi guardado', !/UAT-9/.test(guardado||''));
  /* A localStorage guarda preferências de interface (o tamanho da lente, o
     motor de voz lembrado) — nunca dado de evidência. */
  ok('nada da evidência foi para a localStorage',
     await pg.evaluate(() => Object.keys(localStorage).every(k => !/perfil/.test(k)) &&
       !JSON.stringify(Object.values(localStorage)).match(/UAT-9|Leandro|S4P/)));

  await pg.reload();
  await pg.waitForTimeout(600);
  ok('o perfil sobrevive ao F5', (await pg.locator('#evQuem').inputValue()) === 'Leandro B. de Oliveira');
  ok('o caso de teste não volta', (await pg.locator('#evCaso').inputValue()) === '');

  await pg.locator('#evBox').evaluate(el => el.open = true);
  await pg.locator('#evLimpar').evaluate(el => el.click());
  await pg.waitForTimeout(200);
  ok('Esquecer limpa os campos', (await pg.locator('#evQuem').inputValue()) === '');
  ok('e limpa a sessionStorage', await pg.evaluate(() => sessionStorage.getItem('Walkstamp.perfil')) === null);
}

console.log('\n[2] a lente de um passo');
await prep();
{
  await pg.locator('#thumbs .editar').first().click({force:true});
  await pg.waitForTimeout(300);
  ok('a lente abre', !(await pg.locator('#lente').getAttribute('class')).includes('hide'));
  ok('mostra a imagem grande', await pg.locator('#lenteImg').isVisible());
  ok('e a posição do quadro', /1 de 3/.test(await pg.locator('#lentePos').textContent()));
  ok('lista as falas do trecho', await pg.locator('#lenteFalas input').count() >= 1);

  const campo = pg.locator('#lenteFalas input').first();
  await campo.fill('Abri a transacao ME21N');
  await campo.blur();
  await pg.waitForTimeout(300);
  const tr = await pg.locator('#tr').inputValue();
  ok('corrigir a fala reescreve a transcrição de origem', tr.includes('ME21N') && !tr.includes('eme vinte'), tr.split('\n')[3]);

  await pg.fill('#lenteNota','Espera: o sistema recusa');
  await pg.waitForTimeout(200);
  await pg.click('#lenteProx');
  await pg.waitForTimeout(250);
  ok('navegar avança o quadro', /2 de 3/.test(await pg.locator('#lentePos').textContent()));
  await pg.click('#lentePrev');
  await pg.waitForTimeout(250);
  ok('e volta', /1 de 3/.test(await pg.locator('#lentePos').textContent()));
  ok('a anotação escrita na lente ficou', (await pg.locator('#lenteNota').inputValue()) === 'Espera: o sistema recusa');

  const alvo = '2026-08-14T15:00:00';
  await pg.locator('#lenteHora').evaluate((el,v)=>{el.value=v; el.dispatchEvent(new Event('change',{bubbles:true}))}, alvo);
  await pg.waitForTimeout(400);
  ok('corrigir a hora reancora e bate no segundo', (await pg.locator('#lenteTit').textContent()).includes('2026-08-14 15:00:00'),
     await pg.locator('#lenteTit').textContent());

  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(250);
  ok('Escape fecha', (await pg.locator('#lente').getAttribute('class')).includes('hide'));
  ok('a anotação chegou na miniatura', (await pg.locator('#thumbs input.nota').first().inputValue()) === 'Espera: o sistema recusa');
}

console.log('\n[3] o fuso entra no documento');
{
  await pg.fill('#evCaso','UAT-9');
  await pg.waitForTimeout(200);
  const dl=pg.waitForEvent('download',{timeout:60000});
  await pg.click('#go');
  const d=await dl; await d.saveAs('/tmp/onda1.pdf');
  const txt=textoDoPdf('/tmp/onda1.pdf');
  ok('a hora de início traz o deslocamento UTC', /UTC[+-]\d\d:\d\d/.test(txt), (txt.match(/UTC[+-]\d\d:\d\d/)||[''])[0]);
  ok('e a hora reancorada aparece nos passos', txt.includes('2026-08-14 15:00:00'));
}

console.log('\n[4] o JSON acompanha');
{
  const dl=pg.waitForEvent('download',{timeout:60000});
  await pg.click('#json');
  const d=await dl; await d.saveAs('/tmp/onda1.json');
  const j=JSON.parse(fs.readFileSync('/tmp/onda1.json','utf8'));
  ok('hora de relógio arredondada ao segundo', /:00\.000Z$|:00\.000/.test(j.frames[0].horaDeRelogio) || /T\d\d:\d\d:\d\d\.000Z/.test(j.frames[0].horaDeRelogio), j.frames[0].horaDeRelogio);
  ok('a anotação da lente está no JSON', j.frames[0].anotacao === 'Espera: o sistema recusa');
  ok('a fala corrigida está na transcrição do JSON', JSON.stringify(j.transcricao).includes('ME21N'));
}

ok('sem erro de JS', erros.length===0, erros.join(' | ').slice(0,300));
await br.close(); srv.close();
console.log(falhas?`\n${falhas} FALHA(S)`:'\nOnda 1: tudo passou.');
process.exit(falhas?1:0);
