import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';
import { execSync } from 'child_process';

const ROOT = `${RAIZ_WS}/public`;
const html = fs.readFileSync(ROOT + '/app.html', 'utf8');
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`, 'utf8');
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (u.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end('') }
  r.writeHead(200, {'Content-Type':'text/html'}); r.end(html);
});
await new Promise(r => srv.listen(8909, r));

const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, extra) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (extra ? '  → ' + extra : '')); if (!c) falhas++; };

/* O EMISSOR NÃO VIAJA NO ZIP, e não pode viajar: `emitir-licenca.py` carrega as
   duas chaves privadas Ed25519, e um pacote entregue que as levasse junto
   entregaria o direito de assinar licença para qualquer um.
 *
 * Sem ele, este teste não tem como existir — e é isso que ele diz, em vez de
 * morrer com "Command failed" e mandar procurar defeito num produto que está
 * inteiro. Sai com 0: uma esteira vermelha por uma ausência esperada é uma
 * esteira que se aprende a ignorar. */
import { existsSync } from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
if (!existsSync(`${RAIZ_WS}/emitir-licenca.py`)) {
  console.log('  pulado  emitir-licenca.py não está neste pacote (ele guarda as chaves privadas).');
  console.log('          Rode este teste na máquina onde o emissor vive.');
  process.exit(0);
}

const emitir = (quem, n, ate) => execSync(
  `cd ${RAIZ_WS} && python3 emitir-licenca.py ${JSON.stringify(quem)} ${n} ${ate}`,
  { encoding: 'utf8' }).match(/^WS1\.[^\s]+$/m)[0];

const VALIDA  = emitir('Cliente Exemplo — QA', 5, '2099-01-01');
const VENCIDA = emitir('Cliente antigo', 3, '2020-01-01');

const ctx = await br.newContext({ acceptDownloads: true });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));
await pg.route('**/jspdf**', r => r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
await pg.goto('http://localhost:8909/app.html?lang=pt');
// o cenário virou obrigatório antes de o vídeo entrar ou de a gravação começar
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.waitForTimeout(500);

console.log('[1] sem licença, a feature paga não existe');
ok('a marca do cliente está escondida', !(await pg.locator('#marcaBox').isVisible()));
/* O convite sumiu de propósito: um botão de vender no rodapé de uma ferramenta
   grátis é a terceira coisa que a pessoa lê e a única que não a ajuda a gravar.
   Sem plano, o cabeçalho não mostra nada. */
ok('sem plano, o cabeçalho não anuncia nada',
   await pg.locator('#licTag').evaluate(e => e.classList.contains('hide')));

console.log('\n[2] chaves que não devem passar');
// o botão de vender saiu do rodapé; a caixa abre pelo link do e-mail
  await pg.evaluate(() => document.getElementById('licBox').classList.remove('hide'));
/* Colar chave é o caminho de exceção: fica atrás de "tenho uma chave". */
ok('o campo de chave começa escondido', !(await pg.locator('#licChave').isVisible()));
ok('e a caixa explica que o normal é o link',
   /link que você recebeu/.test(await pg.locator('#licComo').textContent()));
await pg.locator('#licManual').click();
await pg.waitForTimeout(150);
for (const [chave, esperado, nome] of [
  ['abacaxi',              /não parece uma chave/i, 'texto qualquer'],
  [VALIDA.slice(0, -4) + 'AAAA', /não confere/i,    'assinatura adulterada'],
  [VENCIDA,                /venceu em 2020-01-01/,  'licença vencida'],
]) {
  await pg.fill('#licChave', chave);
  await pg.locator('#licAtivar').click();
  await pg.waitForTimeout(250);
  const m = await pg.locator('#licMsg').textContent();
  ok(nome + ' é recusada', esperado.test(m), m.slice(0, 70));
}
ok('nenhuma delas liberou a feature', !(await pg.locator('#marcaBox').isVisible()));

console.log('\n[3] a chave boa');
await pg.fill('#licChave', VALIDA);
await pg.locator('#licAtivar').click();
await pg.waitForTimeout(300);
ok('diz para quem vale', /Cliente Exemplo/.test(await pg.locator('#licMsg').textContent()),
   (await pg.locator('#licMsg').textContent()).slice(0, 80));
ok('o botão mostra o plano ativo', /Plano Time/.test(await pg.locator('#licTag').textContent()));
ok('a marca do cliente apareceu', await pg.locator('#marcaBox').isVisible());

console.log('\n[4] sobrevive ao F5, e é reconferida');
await pg.reload();
await pg.waitForTimeout(700);
ok('continua ativa depois de recarregar', await pg.locator('#marcaBox').isVisible());
const guardado = await pg.evaluate(() => localStorage.getItem('Walkstamp.licenca'));
ok('guardada no navegador', !!guardado && guardado.startsWith('WS1.'));

// adulterar o que está guardado tem que derrubar a licença
await pg.evaluate(k => localStorage.setItem('Walkstamp.licenca', k.slice(0, -4) + 'BBBB'), VALIDA);
await pg.reload();
await pg.waitForTimeout(700);
ok('chave adulterada no localStorage não passa', !(await pg.locator('#marcaBox').isVisible()));

console.log('\n[5] a marca do cliente entra nos documentos');
await pg.evaluate(k => localStorage.setItem('Walkstamp.licenca', k), VALIDA);
await pg.reload();
await pg.waitForTimeout(700);
// o reload zera a escolha do cenário, e o vídeo só entra com um cenário escolhido
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForTimeout(2500);
await pg.selectOption('#mode', 'count');
await pg.fill('#count', '3');
await pg.locator('#extract').click();
await pg.waitForSelector('#prevCard:not(.hide)', { timeout: 40000 });
await pg.waitForTimeout(600);

await pg.fill('#mcNome', 'Cliente Exemplo S.A.');
await pg.setInputFiles('#mcFile', `${RAIZ_WS}/public/apple-touch-icon.png`);
await pg.waitForTimeout(500);
ok('a prévia do logotipo aparece', await pg.locator('#mcPrev').isVisible());

{
  const dl = pg.waitForEvent('download', { timeout: 40000 });
  await pg.locator('#html').click();
  const d = await dl; await d.saveAs('/tmp/lic.html');
  const h = fs.readFileSync('/tmp/lic.html', 'utf8');
  ok('o HTML traz o nome do cliente', /Cliente Exemplo S.A./.test(h));
  ok('o HTML traz o logotipo', /class="cliente"[\s\S]{0,200}<img src="data:image\/png/.test(h));
}
{
  const dl = pg.waitForEvent('download', { timeout: 40000 });
  await pg.locator('#docx').click();
  const d = await dl; await d.saveAs('/tmp/lic.docx');
  execSync('rm -rf /tmp/licdx && mkdir /tmp/licdx && cd /tmp/licdx && unzip -qo /tmp/lic.docx');
  const doc = fs.readFileSync('/tmp/licdx/word/document.xml', 'utf8');
  ok('o Word traz o nome do cliente', /Cliente Exemplo/.test(doc));
  ok('o Word embute o logotipo', fs.existsSync('/tmp/licdx/word/media/cliente.png'));
  const rels = fs.readFileSync('/tmp/licdx/word/_rels/document.xml.rels', 'utf8');
  ok('a relação do logotipo existe', /rIdCliente/.test(rels));
}
{
  const dl = pg.waitForEvent('download', { timeout: 40000 });
  await pg.locator('#go').click();
  const d = await dl; await d.saveAs('/tmp/lic.pdf');
  const txt = execSync('pdftotext -f 1 -l 1 /tmp/lic.pdf - 2>/dev/null', { encoding: 'utf8' });
  ok('o PDF traz o nome do cliente na capa', /Cliente Exemplo/.test(txt), txt.slice(0, 60).replace(/\n/g, ' '));
}

console.log('\n[6] tirar a licença tira a feature');
// o botão de vender saiu do rodapé; a caixa abre pelo link do e-mail
  await pg.evaluate(() => document.getElementById('licBox').classList.remove('hide'));
await pg.locator('#licTirar').click();
await pg.waitForTimeout(300);
ok('a marca do cliente sumiu', !(await pg.locator('#marcaBox').isVisible()));
ok('o navegador esqueceu a chave',
   !(await pg.evaluate(() => localStorage.getItem('Walkstamp.licenca'))));

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 200));
await br.close(); srv.close();
console.log(falhas ? '\n' + falhas + ' falha(s)' : '\nLicença do plano Time: tudo passou.');
process.exit(falhas ? 1 : 0);
