/* Evidência de teste: hora de relógio, cabeçalho de identificação, numeração de
   passo, anotação por frame e a impressão digital opcional. O que se verifica
   aqui é o que um auditor abriria: o PDF, o .docx, o .zip e o .json. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs'; import zlib from 'zlib';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT = `${RAIZ_WS}/public`;
const html = fs.readFileSync(ROOT + '/app.html', 'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`, 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end('') }
  r.writeHead(200, {'Content-Type':'text/html'}); r.end(html); });
await new Promise(r => srv.listen(8891, r));

const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, extra) => { console.log((c?'  ok   ':'  FALHA') + '  ' + n + (extra?'  → '+extra:'')); if(!c) falhas++; };

/* O texto do PDF sai comprimido com deflate: ler os bytes crus dá falso
   negativo. Aqui cada stream é inflado antes da busca. */
function textoDoPdf(caminho){
  const buf = fs.readFileSync(caminho);
  let out = '';
  let i = 0;
  while ((i = buf.indexOf('stream', i)) !== -1) {
    let a = i + 6;
    if (buf[a] === 13) a++;
    if (buf[a] === 10) a++;
    const fim = buf.indexOf('endstream', a);
    if (fim === -1) break;
    try { out += zlib.inflateSync(buf.subarray(a, fim)).toString('latin1'); } catch (e) {}
    i = fim + 9;
  }
  return out + buf.toString('latin1');
}
// jsPDF escreve o texto em octal escapado dentro de (...); basta procurar os
// pedaços sem acento, que saem literais
const contem = (txt, s) => txt.includes(s);

function lerZip(caminho){
  const b = fs.readFileSync(caminho);
  const saida = {};
  let i = 0;
  while ((i = b.indexOf('PK\x03\x04', i)) !== -1) {
    const nl = b.readUInt16LE(i+26), el = b.readUInt16LE(i+28), n = b.readUInt32LE(i+18);
    const nome = b.subarray(i+30, i+30+nl).toString('utf8');
    const dados = b.subarray(i+30+nl+el, i+30+nl+el+n);
    saida[nome] = dados;
    i = i+30+nl+el+n;
  }
  return saida;
}

const ctx = await br.newContext({ acceptDownloads: true });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));
await pg.route('**/jspdf**', r => r.fulfill({status:200,headers:{'content-type':'text/javascript','access-control-allow-origin':'*'},body:jspdf}));
await pg.goto('http://localhost:8891/app.html?lang=pt');
// o cenário virou obrigatório ANTES de o vídeo entrar; a escolha específica
// de cada bloco continua mais abaixo e ganha desta.
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.waitForTimeout(400);

// o bloco de evidência agora só existe no modelo de saída de evidência
await pg.selectOption('#modelo', 'evidencia');
await pg.waitForTimeout(150);
await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForTimeout(2500);
await pg.selectOption('#mode', 'count');
await pg.fill('#count', '4');
await pg.locator('#extract').click();
await pg.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=4, null, {timeout:40000});
await pg.waitForTimeout(400);

console.log('\n[1] a miniatura ganhou passo, hora e anotação');
{
  const passo = (await pg.locator('#thumbs figure').first().locator('.passo').textContent()).trim();
  ok('numeração de passo na miniatura', passo === 'Passo 1', passo);
  const rel = (await pg.locator('#thumbs figure').first().locator('.rel').textContent()).trim();
  ok('hora de relógio ao lado do tempo decorrido', /\d\d:\d\d:\d\d/.test(rel), rel);
  ok('a hora de início veio estimada do arquivo',
     !(await pg.locator('#evEst').getAttribute('class')).includes('hide'));
}

console.log('\n[2] renumeração ao descartar');
{
  await pg.locator('#thumbs figure').nth(1).locator('button.toque').click();
  await pg.waitForTimeout(150);
  const terceiro = (await pg.locator('#thumbs figure').nth(2).locator('.passo').textContent()).trim();
  ok('descartar o passo 2 faz o seguinte virar passo 2', terceiro === 'Passo 2', terceiro);
  ok('o descartado perde o número, mas não a altura',
     (await pg.locator('#thumbs figure').nth(1).locator('.passo').textContent()).trim() === '—');
  await pg.locator('#thumbs figure').nth(1).locator('button.toque').click();
  await pg.waitForTimeout(150);
}

console.log('\n[3] preenchendo os dados da evidência');
await pg.locator('#evBox').evaluate(el => el.open = true);
await pg.fill('#evCaso', 'UAT-4711 Criacao de pedido de compra');
await pg.fill('#evSis', 'S4P / 100');
await pg.fill('#evQuem', 'Leandro B. de Oliveira');
await pg.fill('#evChamado', 'CHG0045231');
await pg.selectOption('#evRes', 'ok');
await pg.fill('#evInicio', '2026-08-14T12:58:45');
await pg.dispatchEvent('#evInicio', 'input');
await pg.check('#evHash');
await pg.waitForTimeout(300);
{
  const rel = (await pg.locator('#thumbs figure').first().locator('.rel').textContent()).trim();
  ok('a hora informada manda na miniatura', /12:58:4\d/.test(rel), rel);
  ok('o aviso de estimativa some quando a pessoa digita',
     (await pg.locator('#evEst').getAttribute('class')).includes('hide'));
}

console.log('\n[4] PDF');
{
  const dl = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#go').click();
  const d = await dl;
  ok('o caso de teste nomeia o arquivo',
     /UAT-4711.*CHG0045231/.test(d.suggestedFilename()), d.suggestedFilename());
  await d.saveAs('/tmp/ev.pdf');
  const txt = textoDoPdf('/tmp/ev.pdf');
  ok('o caso de teste vira o título', contem(txt, 'UAT-4711'));
  ok('quem executou entra no documento', contem(txt, 'Leandro'));
  ok('o chamado entra no documento', contem(txt, 'CHG0045231'));
  ok('o resultado entra no documento', contem(txt, 'Passou'));
  ok('a hora de relógio aparece', contem(txt, '2026-08-14 12:58:45'));
  ok('a numeração de passo aparece', contem(txt, 'Passo 1'));
  ok('o anexo de impressões digitais aparece', /[0-9a-f]{64}/.test(txt));
}

console.log('\n[5] anotação por frame no documento');
{
  await pg.locator('#thumbs figure').first().locator('input.nota')
        .fill('Espera: o sistema recusa o lancamento sem centro de custo');
  await pg.waitForTimeout(150);
  const dl = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#docx').click();
  const d = await dl;
  await d.saveAs('/tmp/ev.docx');
  const z = lerZip('/tmp/ev.docx');
  const doc = z['word/document.xml'].toString('utf8');
  ok('a anotação entra no .docx', doc.includes('Espera: o sistema recusa'));
  ok('o caso de teste entra no .docx', doc.includes('UAT-4711'));
  ok('a hora de relógio entra no .docx', doc.includes('2026-08-14 12:58:45'));
  ok('a numeração de passo entra no .docx', doc.includes('Passo 1 de 4'));
  ok('o SHA-256 entra no .docx', /[0-9a-f]{64}/.test(doc));
}

console.log('\n[6] zip com índice');
{
  const dl = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#zip').click();
  const d = await dl;
  await d.saveAs('/tmp/ev.zip');
  const z = lerZip('/tmp/ev.zip');
  ok('o zip traz um índice de texto', !!z['indice.txt']);
  const idx = (z['indice.txt'] || Buffer.from('')).toString('utf8');
  ok('o índice tem o caso de teste', idx.includes('UAT-4711'));
  ok('o índice tem passo, hora e anotação',
     idx.includes('Passo 1') && idx.includes('2026-08-14 12:58:45') && idx.includes('Espera:'));
}

console.log('\n[7] JSON');
{
  const dl = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#json').click();
  const d = await dl;
  await d.saveAs('/tmp/ev.json');
  const j = JSON.parse(fs.readFileSync('/tmp/ev.json','utf8'));
  ok('bloco de evidência no JSON', j.evidencia && j.evidencia.casoDeTeste.startsWith('UAT-4711'));
  ok('resultado no JSON', j.evidencia.resultado === 'ok');
  ok('passo por frame', j.frames[0].passo === 1);
  ok('hora de relógio ISO por frame', /^2026-08-14T/.test(j.frames[0].horaDeRelogio));
  ok('anotação por frame', j.frames[0].anotacao.startsWith('Espera:'));
  ok('sha256 por frame', /^[0-9a-f]{64}$/.test(j.frames[0].sha256 || ''));
}

console.log('\n[8] sem dados de evidência, nada muda');
{
  const pg2 = await ctx.newPage();
  await pg2.route('**/jspdf**', r => r.fulfill({status:200,headers:{'content-type':'text/javascript','access-control-allow-origin':'*'},body:jspdf}));
  await pg2.goto('http://localhost:8891/app.html?lang=en');
  // o cenário virou obrigatório ANTES de o vídeo entrar; a escolha específica
  // de cada bloco continua mais abaixo e ganha desta.
  await pg2.selectOption('#modelo', 'ia').catch(() => {});
  await pg2.waitForTimeout(400);
  await pg2.setInputFiles('#file', '/tmp/amostra.webm');
  await pg2.waitForTimeout(2500);
  await pg2.selectOption('#mode', 'count');
  await pg2.fill('#count', '3');
  await pg2.locator('#extract').click();
  await pg2.waitForFunction(()=>document.querySelectorAll('#thumbs figure').length>=3,null,{timeout:40000});
  await pg2.evaluate(() => { document.getElementById('evInicio').value=''; });
  await pg2.dispatchEvent('#evInicio','input');
  await pg2.waitForTimeout(200);
  const rel = (await pg2.locator('#thumbs figure').first().locator('.rel').textContent()).trim();
  ok('sem início informado, nenhuma hora é inventada', !/\d\d:\d\d:\d\d/.test(rel), rel);
  const dl = pg2.waitForEvent('download', { timeout: 60000 });
  await pg2.locator('#go').click();
  const d = await dl;
  await d.saveAs('/tmp/ev-sem.pdf');
  const txt = textoDoPdf('/tmp/ev-sem.pdf');
  /* O TÍTULO NUNCA É "Video analysis".
     Esta linha cobrava o contrário até a rodada de layout: ela afirmava o nome
     que a MÁQUINA dá ao processo. Num documento real de 68 páginas isso saía
     como "Análise de vídeo — captura de tela", e quem recebia por e-mail não
     sabia do que se tratava. A regra agora tem três degraus: o caso de teste,
     o nome do arquivo, e por último o nome do ARTEFATO mais a data. Sem dados
     de evidência e com `amostra.webm` na mão, o degrau que vale é o segundo. */
  ok('o título é o nome do arquivo, e não o nome do processo',
     contem(txt, 'amostra') && !contem(txt, 'Video analysis'),
     txt.slice(0, 120).replace(/\s+/g, ' '));
  ok('numeração do trecho em inglês', contem(txt, 'Segment 1'));
  ok('nenhuma impressão digital sem pedir', !/[0-9a-f]{64}/.test(txt));
  await pg2.close();
}

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0,300));
await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nEvidência de teste: tudo passou.');
process.exit(falhas ? 1 : 0);
