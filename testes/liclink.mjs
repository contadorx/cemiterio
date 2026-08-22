/* O plano Time entra por LINK, e não por chave digitada. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';
import { execSync } from 'child_process';
import { criarProxy, exigirNext } from './proxy.mjs';
await exigirNext();

const ROOT = `${RAIZ_WS}/public`;
const tipos = { '.css':'text/css', '.svg':'image/svg+xml', '.js':'text/javascript', '.ico':'image/x-icon' };
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`, 'utf8');
/* O site virou Next.js: as páginas não existem mais como arquivo em public/.
   O servidorzinho estático daqui virou um encaminhador para o Next — mesma
   porta, mesmas URLs no teste, e quem responde é o produto de verdade. */
const srv = criarProxy();
await new Promise(r => srv.listen(8918, r));

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

/* Emitida na hora pelo mesmo programa que o Leandro usa — se ele quebrar, este
   teste quebra junto, que é exatamente o que se quer. */
const saida = execSync(`python3 ${RAIZ_WS}/emitir-licenca.py "Cliente Exemplo — QA" 5 2030-01-01`,
                       { encoding: 'utf8' });
const VALIDA = saida.split('\n').find(l => l.trim().startsWith('WS1.')).trim();
const LINK_EMITIDO = (saida.match(/https?:\/\/\S+/) || [''])[0];

const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, extra) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (extra ? '  → ' + extra : '')); if (!c) falhas++; };
const pagina = async () => {
  const ctx = await br.newContext({ acceptDownloads: true, permissions: ['clipboard-read','clipboard-write'] });
  const pg = await ctx.newPage();
  const erros = []; pg.on('pageerror', e => erros.push(e.message));
  await pg.route('**/jspdf**', r => r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
  return { ctx, pg, erros };
};

console.log('[1] o emissor entrega um link, não só uma chave');
{
  ok('saiu um link para o app', /\/app\?lic=WS1\./.test(LINK_EMITIDO), LINK_EMITIDO.slice(0, 60) + '…');
  ok('e a chave crua continua disponível', VALIDA.startsWith('WS1.'));
  ok('o aviso de onde não colar está lá', /não cole este link/i.test(saida));
}

console.log('\n[2] abrir o link ativa o plano — sem ninguém colar nada');
{
  const { ctx, pg, erros } = await pagina();
  await pg.goto(`http://localhost:8918/app.html?lang=pt&lic=${encodeURIComponent(VALIDA)}&marca=${encodeURIComponent('Cliente Exemplo S.A.')}`);
  await pg.waitForTimeout(700);
  ok('o plano está ativo', /Plano Time/.test(await pg.locator('#licTag').textContent()),
     await pg.locator('#licTag').textContent());
  ok('a marca do cliente apareceu', await pg.locator('#marcaBox').isVisible());
  ok('e já com o nome preenchido', (await pg.locator('#mcNome').inputValue()) === 'Cliente Exemplo S.A.',
     await pg.locator('#mcNome').inputValue());
  ok('a mensagem diz que veio do link',
     /ativado pelo link/i.test(await pg.locator('#licMsg').textContent()),
     (await pg.locator('#licMsg').textContent()).slice(0, 60));

  /* Um endereço com a licença dentro vai parar em print de tela e em histórico
     compartilhado. Ele não fica. */
  const url = await pg.evaluate(() => location.href);
  ok('a chave saiu do endereço', !/lic=/.test(url), url.slice(url.indexOf('?')));
  ok('mas o resto do link continua lá', /marca=/.test(url) && /lang=pt/.test(url));
  ok('a chave ficou guardada no navegador',
     (await pg.evaluate(() => localStorage.getItem('Walkstamp.licenca'))) === VALIDA);
  ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 150));
  await ctx.close();
}

console.log('\n[3] o F5 mantém: a chave ficou no navegador, não no endereço');
{
  const { ctx, pg } = await pagina();
  await pg.goto(`http://localhost:8918/app.html?lang=pt&lic=${encodeURIComponent(VALIDA)}`);
  await pg.waitForTimeout(600);
  await pg.goto('http://localhost:8918/app.html?lang=pt');
  await pg.waitForTimeout(700);
  ok('continua no plano Time depois de abrir sem o link',
     /Plano Time/.test(await pg.locator('#licTag').textContent()));
  await ctx.close();
}

console.log('\n[4] link com chave ruim não engole o erro');
{
  const { ctx, pg } = await pagina();
  await pg.goto(`http://localhost:8918/app.html?lang=pt&lic=${encodeURIComponent(VALIDA.slice(0, -4) + 'AAAA')}`);
  await pg.waitForTimeout(700);
  ok('não ativou', !/Plano Time/.test(await pg.locator('#licTag').textContent()));
  ok('a caixa abriu sozinha para mostrar o motivo', await pg.locator('#licBox').isVisible());
  ok('e o motivo está escrito', /não confere/i.test(await pg.locator('#licMsg').textContent()),
     (await pg.locator('#licMsg').textContent()).slice(0, 70));
  ok('a chave ruim também sai do endereço',
     !/lic=/.test(await pg.evaluate(() => location.href)));
  await ctx.close();
}

console.log('\n[5] marca sem licença não passa (é feature paga)');
{
  const { ctx, pg } = await pagina();
  await pg.goto('http://localhost:8918/app.html?lang=pt&marca=Empresa%20Qualquer');
  await pg.waitForTimeout(600);
  ok('a marca do cliente continua escondida', !(await pg.locator('#marcaBox').isVisible()));
  ok('e o nome não foi para o campo', (await pg.locator('#mcNome').inputValue()) === '');
  await ctx.close();
}

console.log('\n[6] o construtor de /link monta o link do Time');
{
  const { ctx, pg, erros } = await pagina();
  await pg.goto('http://localhost:8918/link');
  await pg.waitForTimeout(400);
  ok('o bloco do Time existe e começa fechado',
     (await pg.locator('#lkTimeCx').count()) === 1 &&
     !(await pg.locator('#lkLic').isVisible()));
  await pg.locator('#lkTimeCx summary').click();
  await pg.waitForTimeout(150);
  await pg.fill('#lkCaso', 'CT-014 Criar pedido');
  await pg.fill('#lkLic', VALIDA);
  await pg.fill('#lkMarca', 'Cliente Exemplo S.A.');
  await pg.waitForTimeout(300);
  const url = await pg.locator('#lkUrl').textContent();
  ok('o link leva a licença', url.includes('lic=WS1.'));
  /* Lido como endereço, e não como texto.

     O nome do cliente vai codificado, e o `URLSearchParams` codifica espaço
     como `+` — que o `decodeURIComponent` NÃO desfaz. Procurar o texto cru
     passava por sorte enquanto o nome de exemplo era uma palavra só, e passou a
     falhar assim que o nome ganhou um espaço. Quem sabe desfazer o `+` é o
     próprio `URL`. */
  ok('o link leva a marca',
     new URL(url).searchParams.get('marca') === 'Cliente Exemplo S.A.',
     new URL(url).searchParams.get('marca'));
  ok('e continua levando o caso', /caso=CT-014/.test(url));
  ok('a chave é lembrada para o próximo link',
     (await pg.evaluate(() => localStorage.getItem('walkstamp.lic.construtor'))) === VALIDA);

  /* O link montado tem que funcionar de verdade, e não só parecer certo. */
  const pg2 = await ctx.newPage();
  await pg2.goto('http://localhost:8918' + url.replace(/^https?:\/\/[^/]+/, '').replace('/app?', '/app.html?'));
  await pg2.waitForTimeout(700);
  /* Sem ?lang= o app segue o idioma do navegador — então a prova é a feature
     paga estar na tela, e não a palavra "Plano Time". */
  ok('o link montado ativa o plano', await pg2.locator('#marcaBox').isVisible());
  ok('e traz o cliente', (await pg2.locator('#mcNome').inputValue()) === 'Cliente Exemplo S.A.');
  ok('e traz o caso de teste', (await pg2.locator('#evCaso').inputValue()) === 'CT-014 Criar pedido');
  await pg2.close();

  await pg.locator('#lkLicEsquecer').click();
  await pg.waitForTimeout(300);
  ok('esquecer limpa o campo e o navegador',
     (await pg.locator('#lkLic').inputValue()) === '' &&
     (await pg.evaluate(() => localStorage.getItem('walkstamp.lic.construtor'))) === null);
  ok('e o link volta a ser o gratuito', !(await pg.locator('#lkUrl').textContent()).includes('lic='));
  ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 150));
  await ctx.close();
}

console.log('\n[7] a chave à mão continua existindo, discreta');
{
  const { ctx, pg } = await pagina();
  await pg.goto('http://localhost:8918/app.html?lang=pt');
  await pg.waitForTimeout(400);
  // o botão de vender saiu do rodapé; a caixa abre pelo link do e-mail
  await pg.evaluate(() => document.getElementById('licBox').classList.remove('hide'));
  ok('o campo não aparece de cara', !(await pg.locator('#licChave').isVisible()));
  await pg.locator('#licManual').click();
  await pg.waitForTimeout(150);
  await pg.fill('#licChave', VALIDA);
  await pg.locator('#licAtivar').click();
  await pg.waitForTimeout(300);
  ok('colar a chave ainda ativa', await pg.locator('#marcaBox').isVisible());
  await ctx.close();
}

await br.close(); srv.close();
console.log(falhas ? '\n' + falhas + ' falha(s)' : '\nLink do plano Time: tudo passou.');
process.exit(falhas ? 1 : 0);
