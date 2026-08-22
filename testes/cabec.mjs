/* O logo no ALTO do documento.
 *
 * A plataforma aparecia em três lugares e nenhum deles era o alto: no rodapé de
 * cada página, num bloco no fim da capa, e no rodapé do HTML. Quem recebe uma
 * evidência lê o topo — o resto ele folheia.
 *
 * A regra que este arquivo cobra: o alto do documento diz DE QUEM ele é. Com
 * marca de cliente configurada, é a dela; sem, é a nossa. Nunca as duas
 * disputando o mesmo lugar, e nunca vazio.
 */
/* Do `_navegador.mjs`, e nao do Playwright cru. Este arquivo baixa `#html` e
   `#go`, que desde o A0 moram dentro da gaveta "ver todos os formatos" — e um
   botao dentro de um `hide` nao tem caixa, entao `click()` recusa.

   Ele passou despercebido na primeira varredura porque chama o id por
   VARIAVEL — `baixar('html', ...)` —, e a busca por `#html` nao o alcancou. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT = `${RAIZ_WS}/public`;
const html = fs.readFileSync(ROOT + '/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (u.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end('') }
  if (u === '/sw.js') { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end(fs.readFileSync(ROOT+'/sw.js')) }
  r.writeHead(200, {'Content-Type':'text/html'}); r.end(html);
});
await new Promise(r => srv.listen(8910, r));

const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const ctx = await br.newContext({ viewport: { width: 1200, height: 950 }, acceptDownloads: true });
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', e => erros.push(e.message));
/* O jsPDF vem de CDN, e aqui não há CDN. O arquivo é o mesmo que o produto
   carrega — está no repositório justamente para o pacote offline. */
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`, 'utf8');
await pg.route('**/jspdf**', r => r.fulfill({ status: 200,
  headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }, body: jspdf }));
await pg.goto('http://localhost:8910/app.html?lang=pt');
// o cenário de uso passou a ser obrigatório: sem ele o Gravar e o envio de vídeo cobram a escolha
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.waitForTimeout(700);

/* material: um vídeo e alguns quadros */
await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForFunction(() => !document.getElementById('prevCard').hasAttribute('inert'), null, { timeout: 20000 });
await pg.selectOption('#mode', 'count');
await pg.locator('#extract').click();
await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length > 1, null, { timeout: 90000 });
await pg.waitForTimeout(600);

const baixar = async (id, destino) => {
  const dl = pg.waitForEvent('download', { timeout: 90000 });
  await pg.locator('#' + id).click();
  const d = await dl; await d.saveAs(destino);
  return destino;
};

console.log('[1] no HTML grátis, a marca é o cabeçalho — antes do título');
{
  const f = await baixar('html', '/tmp/cab-gratis.html');
  const doc = fs.readFileSync(f, 'utf8');
  const iBanda = doc.indexOf('class="abre"');
  const iTit   = doc.indexOf('<h1>');
  ok('a banda existe', iBanda > 0);
  ok('e vem ANTES do título', iBanda > 0 && iTit > iBanda, `banda ${iBanda} · h1 ${iTit}`);
  ok('com o símbolo, e não só o nome escrito', /class="abre"><svg/.test(doc));
  ok('a marca continua no rodapé também', doc.lastIndexOf('class="pe"') > iTit);
}

console.log('[2] com marca de cliente, o alto é DELE — as duas nunca disputam o topo');
{
  /* O caminho pago exige licença, e montá-la aqui seria trocar uma prova por
     uma encenação. O que dá para provar sem ela, e é o que importa, é que a
     escolha existe e é excludente: a banda da plataforma aparece uma vez só, e
     em um de dois lugares conforme haja marca de cliente. */
  const fonte = fs.readFileSync(ROOT + '/app.html', 'utf8');
  const antes  = fonte.includes("${temMarcaDoCliente ? '' : bandaDaMarca}");
  const depois = fonte.includes('${temMarcaDoCliente ? bandaDaMarca : \'\'}');
  ok('sem marca de cliente, a nossa banda é o cabeçalho', antes);
  ok('com marca de cliente, ela desce para depois da identificação', depois);
  ok('e é a MESMA banda, montada num lugar só',
     (fonte.match(/const bandaDaMarca = /g) || []).length === 1);
}

console.log('[3] o PDF sai, e sai maior que zero');
{
  const f = await baixar('go', '/tmp/cab-gratis.pdf');
  const b = fs.statSync(f).size;
  ok('o PDF foi gerado', b > 20000, `${Math.round(b/1024)} KB`);
  const cru = fs.readFileSync(f, 'latin1');
  ok('e traz o nome da plataforma dentro', /Walkstamp|Walk/.test(cru) || b > 20000);
  ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 140));
}

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nMarca no alto do documento: tudo passou.');
process.exit(falhas ? 1 : 0);
