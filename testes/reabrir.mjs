/* Reabrir um documento: o .json e o .zip que a própria ferramenta gerou. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT = `${RAIZ_WS}/public`;
const html = fs.readFileSync(ROOT + '/app.html', 'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`, 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end('') }
  r.writeHead(200, {'Content-Type':'text/html'}); r.end(html);
});
await new Promise(r => srv.listen(8922, r));
const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, extra) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (extra ? '  → ' + extra : '')); if (!c) falhas++; };
const ctx = await br.newContext({ acceptDownloads: true, viewport: { width: 1250, height: 950 } });

async function pagina(){
  const pg = await ctx.newPage();
  const erros = []; pg.on('pageerror', e => erros.push(e.message));
  await pg.route('**/jspdf**', r => r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
  await pg.goto('http://localhost:8922/app.html?lang=pt');
  await pg.waitForTimeout(400);
  return { pg, erros };
}

console.log('[1] gerar um documento completo e guardar o .json e o .zip');
{
  const { pg, erros } = await pagina();
  await pg.selectOption('#modelo', 'evidencia');
  await pg.setInputFiles('#file', '/tmp/amostra.webm');
  await pg.waitForTimeout(2500);
  await pg.selectOption('#mode', 'count'); await pg.fill('#count', '3');
  await pg.locator('#extract').click();
  await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length >= 3, null, { timeout: 40000 });
  await pg.waitForTimeout(400);
  await pg.fill('#tr', 'WEBVTT\n\n00:00:00.000 --> 00:00:09.000\nAbri a transacao e informei o fornecedor');
  await pg.dispatchEvent('#tr', 'input');
  await pg.locator('#evBox').evaluate(e => e.open = true);
  await pg.fill('#evCaso', 'UAT-4711 Criar pedido');
  await pg.fill('#evSis', 'S4P / 100');
  await pg.fill('#evChamado', 'CHG0045231');
  await pg.fill('#unNome', 'Evidência');
  await pg.waitForTimeout(250);
  await pg.locator('#thumbs figure').nth(0).locator('input.nota').fill('espera: exigir centro de custo');
  await pg.waitForTimeout(200);
  for (const [botao, arq] of [['#json','/tmp/re.json'], ['#zip','/tmp/re.zip']]) {
    const dl = pg.waitForEvent('download', { timeout: 40000 });
    await pg.locator(botao).click();
    const d = await dl; await d.saveAs(arq);
  }
  const j = JSON.parse(fs.readFileSync('/tmp/re.json','utf8'));
  ok('o JSON guarda o cenário', j.cenario === 'evidencia', j.cenario);
  ok('e o rótulo do quadro', j.rotuloDoQuadro === 'Evidência', j.rotuloDoQuadro);
  ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0,150));
  await pg.close();
}

console.log('\n[2] reabrir o .json numa aba limpa');
{
  const { pg, erros } = await pagina();
  ok('o botão está no passo 1', (await pg.locator('#cardVideo #reabrir').count()) === 1);
  await pg.setInputFiles('#reabrirArq', '/tmp/re.json');
  await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length >= 3, null, { timeout: 30000 });
  await pg.waitForTimeout(500);
  ok('os três quadros voltaram', (await pg.locator('#thumbs figure').count()) === 3);
  ok('o cenário voltou', (await pg.locator('#modelo').inputValue()) === 'evidencia');
  ok('o rótulo voltou', /Evidência 1/.test(await pg.locator('#thumbs figcaption .passo').first().textContent()),
     await pg.locator('#thumbs figcaption .passo').first().textContent());
  ok('a anotação voltou',
     (await pg.locator('#thumbs figure').nth(0).locator('input.nota').inputValue()) === 'espera: exigir centro de custo');
  ok('o caso de teste voltou', (await pg.locator('#evCaso').inputValue()) === 'UAT-4711 Criar pedido');
  ok('o sistema voltou', (await pg.locator('#evSis').inputValue()) === 'S4P / 100');
  ok('a transcrição voltou', /informei o fornecedor/.test(await pg.locator('#tr').inputValue()));
  ok('e a revisão está aberta', !(await pg.locator('#prevCard').getAttribute('class')).includes('fechado'));
  ok('a mensagem avisa da tarja queimada',
     /queimadas/.test(await pg.locator('#reabrirMsg').textContent()),
     (await pg.locator('#reabrirMsg').textContent()).slice(0, 60));

  /* O ponto do recurso: corrigir e gerar de novo. */
  await pg.locator('#thumbs figure').nth(1).locator('input.nota').fill('passo corrigido depois');
  await pg.waitForTimeout(200);
  const dl = pg.waitForEvent('download', { timeout: 40000 });
  await pg.locator('#md').click();
  const d = await dl; await d.saveAs('/tmp/re2.md');
  const md = fs.readFileSync('/tmp/re2.md','utf8');
  ok('o documento novo sai com a correção', /passo corrigido depois/.test(md));
  ok('e mantém o que já estava lá', /espera: exigir centro de custo/.test(md));
  ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0,150));
  await pg.close();
}

console.log('\n[3] reabrir o .zip');
{
  const { pg, erros } = await pagina();
  await pg.setInputFiles('#reabrirArq', '/tmp/re.zip');
  await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length >= 3, null, { timeout: 30000 });
  await pg.waitForTimeout(400);
  ok('os quadros voltaram do zip', (await pg.locator('#thumbs figure').count()) === 3);
  ok('a anotação do índice voltou junto',
     (await pg.locator('#thumbs figure').nth(0).locator('input.nota').inputValue()).includes('centro de custo'),
     await pg.locator('#thumbs figure').nth(0).locator('input.nota').inputValue());
  ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0,150));
  await pg.close();
}

console.log('\n[4] arquivo que não serve é recusado com motivo');
{
  const { pg } = await pagina();
  fs.writeFileSync('/tmp/re-ruim.json', '{"gerador":"outra coisa"}');
  await pg.setInputFiles('#reabrirArq', '/tmp/re-ruim.json');
  await pg.waitForTimeout(700);
  ok('não abriu', (await pg.locator('#thumbs figure').count()) === 0);
  ok('e disse por quê', /não tem quadros/.test(await pg.locator('#reabrirMsg').textContent()),
     (await pg.locator('#reabrirMsg').textContent()).slice(0, 60));
  await pg.close();
}

await br.close(); srv.close();
console.log(falhas ? '\n' + falhas + ' falha(s)' : '\nReabrir um documento: tudo passou.');
process.exit(falhas ? 1 : 0);
