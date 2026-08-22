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
await new Promise(r => srv.listen(8912, r));

const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, extra) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (extra ? '  → ' + extra : '')); if (!c) falhas++; };

const ctx = await br.newContext({ acceptDownloads: true, permissions: ['clipboard-read','clipboard-write'] });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));
await pg.route('**/jspdf**', r => r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));

console.log('[1] o link já chega preenchido');
const url = 'http://localhost:8912/app.html?lang=pt&modelo=evidencia' +
  '&caso=CT-014%20Criar%20pedido&chamado=NAT-1234&sistema=S4P%2F100&quem=Leandro&resultado=ok';
await pg.goto(url);
await pg.waitForTimeout(600);
ok('o modelo de saída veio do link', (await pg.locator('#modelo').inputValue()) === 'evidencia');
ok('o caso de teste veio', (await pg.locator('#evCaso').inputValue()) === 'CT-014 Criar pedido');
ok('o chamado veio', (await pg.locator('#evChamado').inputValue()) === 'NAT-1234');
ok('o sistema veio', (await pg.locator('#evSis').inputValue()) === 'S4P/100');
ok('quem executou veio', (await pg.locator('#evQuem').inputValue()) === 'Leandro');
ok('o resultado veio', (await pg.locator('#evRes').inputValue()) === 'ok');
ok('a tela avisa que veio do link',
   /vieram preenchidos pelo link/.test(await pg.locator('#evDica').textContent()),
   (await pg.locator('#evDica').textContent()).slice(0, 60));

console.log('\n[2] um link com bobagem não quebra nada');
{
  const pg2 = await ctx.newPage();
  const e2 = []; pg2.on('pageerror', e => e2.push(e.message));
  await pg2.goto('http://localhost:8912/app.html?lang=pt&modelo=inventado&resultado=xyz&caso=');
  // o cenário de uso passou a ser obrigatório: sem ele o Gravar e o envio de vídeo cobram a escolha
  await pg2.selectOption('#modelo', 'ia').catch(() => {});
  await pg2.waitForTimeout(500);
  ok('modelo inválido é ignorado', (await pg2.locator('#modelo').inputValue()) !== 'inventado');
  ok('resultado inválido é ignorado', (await pg2.locator('#evRes').inputValue()) !== 'xyz');
  ok('sem erro de JS', e2.length === 0, e2.join(' | ').slice(0, 150));
  await pg2.close();
}

console.log('\n[3] o resumo para o Jira');
await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForTimeout(2500);
await pg.selectOption('#mode', 'count');
await pg.fill('#count', '3');
await pg.locator('#extract').click();
await pg.waitForSelector('#prevCard:not(.hide)', { timeout: 40000 });
await pg.waitForTimeout(600);

const nomes = await pg.locator('#thumbs figure input').all();
await nomes[0].fill('Abrir a ME21N');
await pg.waitForTimeout(200);

await pg.locator('#jira').click();
await pg.waitForTimeout(500);
const txt = await pg.evaluate(() => navigator.clipboard.readText());
console.log(txt.split('\n').map(l => '      ' + l).join('\n'));

ok('a mensagem confirma', /Resumo copiado/.test(await pg.locator('#pdfStatus').textContent()));
ok('título em marcação do Jira', /^h3\. CT-014 Criar pedido/m.test(txt));
ok('os dados da evidência viram lista', /^\* \*.*:\* S4P\/100/m.test(txt), 'sistema');
ok('a tabela usa a sintaxe do Jira', /^\|\|.*\|\|.*\|\|/m.test(txt));
ok('cada passo é uma linha da tabela', (txt.match(/^\|\d+\|/gm) || []).length === 3);
ok('a anotação do passo entrou', /Abrir a ME21N/.test(txt));
ok('o rodapé cita o nome do anexo', /evidencia-CT-014-Criar-pedido-NAT-1234/.test(txt),
   (txt.match(/anexada como [^.]+/) || [''])[0]);

console.log('\n[4] o nome do arquivo carrega a chave do chamado');
{
  const dl = pg.waitForEvent('download', { timeout: 40000 });
  await pg.locator('#docx').click();
  const d = await dl;
  ok('o .docx sai com caso e chamado no nome',
     /^evidencia-CT-014-Criar-pedido-NAT-1234\.docx$/.test(d.suggestedFilename()),
     d.suggestedFilename());
}

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 200));
await br.close(); srv.close();
console.log(falhas ? '\n' + falhas + ' falha(s)' : '\nJira sem integração: tudo passou.');
process.exit(falhas ? 1 : 0);
