/* As duas chaves de assinatura, e o teto que o navegador impõe à automática.

   A regra que só existe no servidor não é regra, é intenção: se aquele projeto
   vazar, o que se pode fabricar com a chave dele tem que continuar limitado
   pelo que ESTE código aceita. É isso que se prova aqui. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';
import { execSync } from 'child_process';

const ROOT = `${RAIZ_WS}/public`;
const html = fs.readFileSync(ROOT + '/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end('') }
  r.writeHead(200, {'Content-Type':'text/html'}); r.end(html);
});
await new Promise(r => srv.listen(8920, r));

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

const emissor = `${RAIZ_WS}/emitir-licenca.py`;
const auto = (email, assentos, dias, cliente) =>
  execSync(`python3 ${emissor} --auto "${email}" ${assentos} ${dias}` + (cliente ? ` "${cliente}"` : ''),
           { encoding: 'utf8' }).trim();
const mestra = execSync(`python3 ${emissor} "Cliente Exemplo — QA" 40 2030-01-01`, { encoding: 'utf8' })
  .split('\n').find(l => l.trim().startsWith('WS1.')).trim();

const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, extra) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (extra ? '  → ' + extra : '')); if (!c) falhas++; };
/* Aba limpa a cada vez, de propósito: uma licença boa fica guardada no
   navegador, e reaproveitar a aba faria a chave RUIM do teste seguinte
   parecer aceita. */
async function abrir(chave){
  const ctx = await br.newContext();
  const pg = await ctx.newPage();
  const erros = []; pg.on('pageerror', e => erros.push(e.message));
  await pg.goto(`http://localhost:8920/app.html?lang=pt&lic=${encodeURIComponent(chave)}`);
  await pg.waitForTimeout(600);
  const ligou = await pg.locator('#marcaBox').isVisible();
  const msg = await pg.locator('#licMsg').textContent();
  const botao = await pg.locator('#licTag').textContent();
  await ctx.close();
  return { ligou, msg, botao, erros };
}

console.log('[1] a chave mestra continua sem teto');
{
  const r = await abrir(mestra);
  ok('40 assentos e cinco anos passam', r.ligou, r.msg.slice(0, 60));
  ok('sem erro de JS', r.erros.length === 0, r.erros.join(' | ').slice(0, 120));
}

console.log('\n[2] a chave automática vale, dentro do teto');
{
  const r = await abrir(auto('leandro@empresa.com.br', 5, 90, 'Cliente Exemplo S.A.'));
  ok('90 dias e 5 assentos passam', r.ligou, r.msg.slice(0, 70));
  ok('e a tela diz a quem a licença foi dada',
     /leandro@empresa\.com\.br/.test(r.msg), r.msg.slice(0, 110));
}

console.log('\n[3] o teste de 14 dias');
{
  const r = await abrir(auto('quem@quer.testar', 1, 14));
  ok('passa', r.ligou);
}

console.log('\n[4] fora do teto, a automática não vale — mesmo assinada de verdade');
{
  const longa = await abrir(auto('leandro@empresa.com.br', 5, 400));
  ok('400 dias é recusada', !longa.ligou, longa.msg.slice(0, 70));
  ok('e o motivo aparece na tela', /não confere|link trazia/i.test(longa.msg), longa.msg.slice(0, 60));

  const gorda = await abrir(auto('leandro@empresa.com.br', 25, 90));
  ok('25 assentos ainda passa (é o limite)', gorda.ligou);
}

console.log('\n[5] no limite exato de dias');
{
  const cem = await abrir(auto('leandro@empresa.com.br', 5, 99));
  ok('99 dias passa', cem.ligou);
  const cemUm = await abrir(auto('leandro@empresa.com.br', 5, 101));
  ok('101 dias não passa', !cemUm.ligou);
}

console.log('\n[6] assinatura mexida não passa por chave nenhuma');
{
  const boa = auto('leandro@empresa.com.br', 5, 90);
  const r = await abrir(boa.slice(0, -4) + 'AAAA');
  ok('adulterada é recusada', !r.ligou);
}

await br.close(); srv.close();
console.log(falhas ? '\n' + falhas + ' falha(s)' : '\nDuas chaves e o teto da automática: tudo passou.');
process.exit(falhas ? 1 : 0);
