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
await new Promise(r => srv.listen(8914, r));

const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, extra) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (extra ? '  → ' + extra : '')); if (!c) falhas++; };

const ctx = await br.newContext({ acceptDownloads: true });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));
await pg.route('**/jspdf**', r => r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
await pg.goto('http://localhost:8914/app.html?lang=pt');
// o cenário de uso passou a ser obrigatório: sem ele o Gravar e o envio de vídeo cobram a escolha
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.waitForTimeout(500);

const VTT = `WEBVTT

00:00:00.000 --> 00:00:05.000
Microfone: bom dia, vamos abrir a eme vinte e um ene para criar o pedido

00:00:05.000 --> 00:00:10.000
Microfone: agora o centro de custo cá i duzentos e trinta e cinco

00:00:10.000 --> 00:00:15.000
Microfone: e conferimos no fióri do esse barra quatro rana

00:00:15.000 --> 00:00:20.000
Microfone: a ME21N ja estava certa nesta linha`;

/* O cartão 2 fica travado sem vídeo no passo 1 — é o desenho, e o vocabulário
   só faz sentido quando existe transcrição. Então a gravação vem primeiro,
   como no uso real. */
await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForTimeout(2500);

console.log('[1] a transcrição chega errada, como o Whisper devolve');
await pg.fill('#tr', VTT);
await pg.dispatchEvent('#tr', 'input');
await pg.waitForTimeout(300);
ok('o código veio por extenso', /eme vinte e um ene/.test(await pg.locator('#tr').inputValue()));

console.log('\n[2] listar os termos e corrigir');
/* Sem chave e sem plano: aplicar os termos é de todo mundo. O que o Personal e
   o Team vendem é a lista ficar GRAVADA entre visitas — não o acesso. */
ok('a linha está à mão sem plano nenhum', await pg.locator('#vocRow').isVisible());
await pg.locator('#vocModo').click();
await pg.waitForTimeout(150);
ok('a caixa abriu', await pg.locator('#vocLista').isVisible());
await pg.fill('#vocLista', 'ME21N\nKI235\nFiori');
await pg.locator('#vocAplicar').click();
await pg.waitForTimeout(400);

const txt = await pg.locator('#tr').inputValue();
console.log(txt.split('\n').filter(l => /Microfone/.test(l)).map(l => '      ' + l).join('\n'));

ok('a mensagem conta as trocas', /corre[çc]/i.test(await pg.locator('#vocMsg').textContent()),
   (await pg.locator('#vocMsg').textContent()).slice(0, 50));
ok('ME21N foi restaurado', /abrir a ME21N para criar/.test(txt));
ok('não sobrou a forma falada de ME21N', !/eme vinte e um ene/.test(txt));
ok('KI235 foi restaurado', /custo KI235/.test(txt), (txt.match(/custo \S+/) || [''])[0]);
ok('Fiori foi restaurado', /no Fiori do/.test(txt), (txt.match(/no \S+ do/) || [''])[0]);
ok('o que já estava certo não foi mexido', /a ME21N ja estava certa/.test(txt));

console.log('\n[3] desfazer');
await pg.locator('#vocDesfazer').click();
await pg.waitForTimeout(300);
ok('a transcrição voltou', (await pg.locator('#tr').inputValue()) === VTT);
ok('o botão de desfazer sumiu', !(await pg.locator('#vocDesfazer').isVisible()));

console.log('\n[4] sem termos e sem texto');
{
  await pg.fill('#vocLista', '');
  await pg.locator('#vocAplicar').click();
  await pg.waitForTimeout(200);
  ok('pede os termos', /pelo menos um termo/.test(await pg.locator('#vocMsg').textContent()));
  await pg.fill('#vocLista', 'XYZ99');
  await pg.locator('#vocAplicar').click();
  await pg.waitForTimeout(300);
  ok('termo que não aparece não muda nada',
     /Nenhum desses termos/.test(await pg.locator('#vocMsg').textContent()),
     (await pg.locator('#vocMsg').textContent()).slice(0, 45));
}

console.log('\n[5] corrige também as anotações dos passos');
await pg.selectOption('#mode', 'count');
await pg.fill('#count', '2');
await pg.locator('#extract').click();
await pg.waitForSelector('#prevCard:not(.hide)', { timeout: 40000 });
await pg.waitForTimeout(600);
await pg.fill('#tr', VTT);
await pg.dispatchEvent('#tr', 'input');
const notas = await pg.locator('#thumbs figure input').all();
await notas[0].fill('abrir a eme vinte e um ene');
await pg.waitForTimeout(200);
await pg.fill('#vocLista', 'ME21N');
await pg.locator('#vocAplicar').click();
await pg.waitForTimeout(500);
ok('a anotação do passo foi corrigida',
   (await pg.locator('#thumbs figure input').first().inputValue()) === 'abrir a ME21N',
   await pg.locator('#thumbs figure input').first().inputValue());

console.log('\n[6] a lista sobrevive ao F5, e morre com a aba');
await pg.reload();
await pg.waitForTimeout(600);
ok('a lista voltou', (await pg.locator('#vocLista').inputValue()) === 'ME21N');
{
  const ctx2 = await br.newContext();
  const pg2 = await ctx2.newPage();
  await pg2.goto('http://localhost:8914/app.html?lang=pt');
  // o cenário de uso passou a ser obrigatório: sem ele o Gravar e o envio de vídeo cobram a escolha
  await pg2.selectOption('#modelo', 'ia').catch(() => {});
  await pg2.waitForTimeout(400);
  ok('e não vaza para outra aba', (await pg2.locator('#vocLista').inputValue()) === '');
  await ctx2.close();
}

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 200));
await br.close(); srv.close();
console.log(falhas ? '\n' + falhas + ' falha(s)' : '\nVocabulário do domínio: tudo passou.');
process.exit(falhas ? 1 : 0);
