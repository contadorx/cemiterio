/* ROSTO E NOME NUMA GRAVAÇÃO DE REUNIÃO.
 *
 * DE ONDE ISTO VEIO: um documento real de 68 páginas, gerado de uma reunião de
 * 14:50 com onze participantes. Em quase todas as 119 telas está a fita de
 * quadradinhos de vídeo — rosto, nome completo e cargo de onze pessoas. O
 * arquivo depois circula por e-mail.
 *
 * A varredura de dado sensível que já existia não viu nada disso, e está
 * certa: ela lê o OCR, e rosto não é texto. O que faltava era um segundo
 * aviso, de outra natureza.
 *
 * O QUE ESTE TESTE COBRA, e é a parte que pode dar errado sem ninguém notar:
 *
 *   1. O aviso aparece quando a PESSOA declarou que havia gente — cenário de
 *      reunião, de sessão com participante, ou a voz do outro lado na
 *      transcrição.
 *   2. Ele NÃO aparece numa evidência de teste solo. Um aviso que aparece
 *      sempre é um aviso que ninguém lê, e o custo dele é o resto dos avisos
 *      da tela perderem o crédito junto.
 *   3. Ele não tarja nada sozinho. A tarja é queimada na imagem e não tem
 *      desfazer; cobrir a fita de participantes automaticamente apagaria, em
 *      algumas gravações, a prova de quem estava presente.
 *
 *   node testes/pessoas.mjs
 */
import { chromium } from './_navegador.mjs';
import http from 'http';
import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const RAIZ = `${RAIZ_WS}`;
const html = fs.readFileSync(RAIZ + '/public/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) {
    r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end('');
  }
  r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(html);
});
await new Promise(r => srv.listen(8951, r));

let falhas = 0;
const ok = (n, c, e) => {
  console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : ''));
  if (!c) falhas++;
};

const br = await chromium.launch({
  executablePath: CHROME_WS,
});
const pg = await (await br.newContext({ viewport: { width: 1250, height: 980 } })).newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));
await pg.goto('http://localhost:8951/app.html?lang=pt');

const visivel = () => pg.locator('#pessoasAviso').isVisible();
const texto = () => pg.locator('#pessoasAviso').textContent();

// ---------------------------------------------------------------------------
console.log('[1] sem quadro nenhum, o aviso não existe');
{
  await pg.selectOption('#modelo', 'ata');
  await pg.waitForTimeout(200);
  /* Avisar antes de haver documento é avisar sobre nada. O aviso fala de telas
     guardadas; sem telas, ele não tem sujeito. */
  ok('escolher "ata" com a tela vazia não acende aviso nenhum', !(await visivel()));
}

// ---------------------------------------------------------------------------
console.log('\n[2] com telas guardadas e cenário de reunião, ele acende');
await pg.selectOption('#modelo', 'evidencia');
await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForTimeout(2600);
await pg.selectOption('#mode', 'count');
await pg.fill('#count', '3');
await pg.locator('#extract').click();
await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length >= 3,
                         null, { timeout: 40000 });
await pg.waitForTimeout(400);
{
  /* O NÚMERO QUE IMPORTA está aqui, e são dois estados, não um: numa evidência
     de teste solo o aviso tem que estar APAGADO. Se ele acendesse nos dois, o
     teste passaria sem provar coisa alguma sobre a regra. */
  ok('numa evidência de teste solo ele fica apagado', !(await visivel()),
     (await texto()).slice(0, 40));

  await pg.selectOption('#modelo', 'ata');
  await pg.waitForTimeout(400);
  ok('trocando o cenário para "ata de reunião", ele acende', await visivel());
  const tx = await texto();
  console.log('     ' + tx.replace(/\s+/g, ' ').slice(0, 120));
  ok('e ele diz POR QUE apareceu', /Ata de reuni/.test(tx), tx.slice(0, 60));
  ok('sem prometer que enxergou rosto', !/detect|reconhec/i.test(tx));

  await pg.selectOption('#modelo', 'usabilidade');
  await pg.waitForTimeout(400);
  ok('sessão com participante também acende', await visivel());

  await pg.selectOption('#modelo', 'evidencia');
  await pg.waitForTimeout(400);
  ok('e voltando para a evidência solo ele apaga de novo', !(await visivel()));
}

// ---------------------------------------------------------------------------
console.log('\n[3] a voz do outro lado da chamada acende em qualquer cenário');
{
  /* O canal do computador é, numa chamada, a voz de quem não está gravando.
     Se ela chegou à transcrição, havia gente do outro lado — e isso vale
     mesmo quando o cenário escolhido é "evidência de teste". */
  await pg.fill('#spkSysNome', 'Convidados');
  await pg.fill('#tr', '00:01 Convidados: bom dia a todos\n00:06 tudo certo por aqui');
  await pg.evaluate(() => document.getElementById('tr').dispatchEvent(new Event('input', { bubbles: true })));
  await pg.waitForTimeout(200);
  await pg.evaluate(() => window.__quadros() && document.getElementById('modelo')
    .dispatchEvent(new Event('change', { bubbles: true })));
  await pg.waitForTimeout(400);
  ok('com o nome do canal do computador na transcrição, acende', await visivel(),
     (await texto()).replace(/\s+/g, ' ').slice(0, 80));

  await pg.fill('#spkSysNome', '');
  await pg.evaluate(() => document.getElementById('modelo')
    .dispatchEvent(new Event('change', { bubbles: true })));
  await pg.waitForTimeout(400);
  ok('e sem esse canal ele apaga', !(await visivel()));
}

// ---------------------------------------------------------------------------
console.log('\n[4] o botão abre a lente, e não tarja nada sozinho');
{
  await pg.selectOption('#modelo', 'ata');
  await pg.waitForTimeout(400);
  const antes = await pg.evaluate(() =>
    (window.__quadros() || []).reduce((s, f) => s + ((f.tarjas || []).length), 0));
  await pg.locator('#pessoasTarjar').click();
  await pg.waitForTimeout(600);
  ok('a lente abriu', await pg.locator('#lente').isVisible());
  ok('e já em modo de tarja', /Terminar/.test(await pg.locator('#tarjaModo').textContent()),
     await pg.locator('#tarjaModo').textContent());
  const depois = await pg.evaluate(() =>
    (window.__quadros() || []).reduce((s, f) => s + ((f.tarjas || []).length), 0));
  /* NENHUMA tarja foi aplicada. Este é o ponto em que a tentação seria cobrir
     a fita de participantes sozinho — e a tarja é queimada, sem desfazer. */
  ok('nenhuma tarja foi aplicada sozinha', depois === antes, antes + ' → ' + depois);
}

ok('sem erro de JavaScript', erros.length === 0, erros.join(' | ').slice(0, 200));

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nAviso de rosto e nome: tudo passou.');
process.exit(falhas ? 1 : 0);
