/* A página /time: pedir o link por e-mail, e a volta do link mágico.
   O envio e a emissão são falsificados aqui — o que se testa é a página. */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs';
import { criarProxy, exigirNext } from './proxy.mjs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
await exigirNext();

const ROOT = `${RAIZ_WS}/public`;
const tipos = { '.css':'text/css', '.svg':'image/svg+xml', '.js':'text/javascript', '.ico':'image/x-icon' };
/* O site virou Next.js: as páginas não existem mais como arquivo em public/.
   O servidorzinho estático daqui virou um encaminhador para o Next — mesma
   porta, mesmas URLs no teste, e quem responde é o produto de verdade. */
const srv = criarProxy();
await new Promise(r => srv.listen(8919, r));

const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, extra) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (extra ? '  → ' + extra : '')); if (!c) falhas++; };
const ctx = await br.newContext({ permissions: ['clipboard-read','clipboard-write'] });

console.log('[1] a página existe nos três idiomas e está no mapa');
{
  const pg = await ctx.newPage();
  for (const [u, marca] of [['/time','Time'], ['/en/team','Team'], ['/es/equipo','Equipo']]) {
    await pg.goto('http://localhost:8919' + u);
    await pg.waitForTimeout(200);
    ok(u + ' abre', (await pg.locator('h1').textContent()).includes(marca),
       (await pg.locator('h1').textContent()).slice(0, 45));
  }
  const sm = fs.readFileSync(ROOT + '/sitemap-paginas.xml', 'utf8');
  ok('as três versões estão no sitemap',
     sm.includes('/time<') && sm.includes('/en/team<') && sm.includes('/es/equipo<'));
  await pg.close();
}

console.log('\n[2] a página de preços leva para onde se começa');
{
  /* O Personal ganhou caminho de compra: ele vai para a área do cliente, que é
     de onde sai a degustação E a assinatura. O Team continua indo para o link
     por e-mail — venda de cinco assentos com nota fiscal não começa num botão. */
  const pg = await ctx.newPage();
  await pg.goto('http://localhost:8919/precos');
  await pg.waitForTimeout(200);
  const personal = await pg.locator('.plan').nth(1).innerHTML();
  const equipe = await pg.locator('.plan').nth(2).innerHTML();
  ok('o cartão Personal leva para a conta', /href="\/conta"/.test(personal));
  ok('e o mailto continua como saída', /mailto:/.test(personal));
  ok('o cartão Team continua chamando o link por e-mail', /href="\/time"/.test(equipe));
  await pg.close();
}

console.log('\n[3] e-mail malformado não sai do lugar');
{
  const pg = await ctx.newPage();
  let pedidos = 0;
  await pg.route('**/auth/v1/otp**', r => { pedidos++; r.fulfill({status:200, body:'{}'}); });
  await pg.goto('http://localhost:8919/time');
  await pg.waitForTimeout(250);
  await pg.fill('#tmEmail', 'leandro@');
  await pg.locator('#tmEnviar').click();
  await pg.waitForTimeout(250);
  ok('nada foi enviado', pedidos === 0);
  ok('e a página diz o porquê', /não parece completo/.test(await pg.locator('#tmMsg').textContent()),
     (await pg.locator('#tmMsg').textContent()).slice(0, 50));
  await pg.close();
}

console.log('\n[4] pedir o link');
{
  const pg = await ctx.newPage();
  let corpo = null, destino = null;
  await pg.route('**/auth/v1/otp**', r => {
    corpo = JSON.parse(r.request().postData() || '{}');
    destino = new URL(r.request().url()).searchParams.get('redirect_to');
    r.fulfill({ status: 200, headers: {'content-type':'application/json'}, body: '{}' });
  });
  await pg.goto('http://localhost:8919/time');
  await pg.waitForTimeout(250);
  await pg.fill('#tmEmail', '  Leandro@Empresa.COM.br ');
  await pg.locator('#tmEnviar').click();
  await pg.waitForTimeout(400);
  ok('o e-mail vai limpo e em minúsculas', corpo && corpo.email === 'leandro@empresa.com.br',
     corpo && corpo.email);
  ok('a volta aponta para esta mesma página', /\/time$/.test(destino || ''), destino);
  ok('a página manda olhar a caixa',
     /Abra a mensagem/.test(await pg.locator('#tmMsg').textContent()),
     (await pg.locator('#tmMsg').textContent()).slice(0, 50));
  ok('e o botão trava para não mandar dez vezes', await pg.locator('#tmEnviar').isDisabled());
  await pg.close();
}

console.log('\n[5] o limite de envio é dito, não engolido');
{
  const pg = await ctx.newPage();
  await pg.route('**/auth/v1/otp**', r => r.fulfill({ status: 429, body: '{"msg":"rate limit exceeded"}' }));
  await pg.goto('http://localhost:8919/time');
  await pg.waitForTimeout(250);
  await pg.fill('#tmEmail', 'leandro@empresa.com.br');
  await pg.locator('#tmEnviar').click();
  await pg.waitForTimeout(400);
  ok('avisa que foram muitos pedidos',
     /Muitos pedidos/.test(await pg.locator('#tmMsg').textContent()),
     (await pg.locator('#tmMsg').textContent()).slice(0, 50));
  ok('e devolve o botão', !(await pg.locator('#tmEnviar').isDisabled()));
  await pg.close();
}

console.log('\n[6] a volta do link mágico entrega o link do plano');
{
  const pg = await ctx.newPage();
  let auth = null;
  await pg.route('**/functions/v1/walkstamp-licenca', r => {
    auth = r.request().headers()['authorization'];
    r.fulfill({ status: 200, headers: {'content-type':'application/json'}, body: JSON.stringify({
      link: 'https://walkstamp.com/app?lic=WS1.aaa.bbb&marca=Cliente Exemplo',
      email: 'leandro@empresa.com.br', vence: '2026-11-13', assentos: 5, origem: 'conta' }) });
  });
  await pg.goto('http://localhost:8919/time#access_token=tok123&refresh_token=r&type=magiclink');
  await pg.waitForTimeout(600);
  ok('o token foi no cabeçalho', auth === 'Bearer tok123', auth);
  ok('o formulário some', await pg.locator('#tmPedir').isHidden());
  ok('e o link aparece', /\/app\?lic=WS1\./.test(await pg.locator('#tmUrl').textContent()),
     await pg.locator('#tmUrl').textContent());
  ok('com o botão de abrir apontando para ele',
     (await pg.locator('#tmAbrir').getAttribute('href')) === 'https://walkstamp.com/app?lic=WS1.aaa.bbb&marca=Cliente Exemplo');
  ok('e a página diz de quem é e até quando',
     /leandro@empresa\.com\.br/.test(await pg.locator('#tmQuem').textContent()) &&
     /2026-11-13/.test(await pg.locator('#tmQuem').textContent()),
     await pg.locator('#tmQuem').textContent());
  /* O token não pode ficar na barra: quem olha por cima do ombro leva a sessão. */
  ok('o token sumiu do endereço', !/access_token/.test(await pg.evaluate(() => location.href)),
     await pg.evaluate(() => location.href));
  await pg.locator('#tmCopiar').click();
  await pg.waitForTimeout(250);
  ok('copiar funciona',
     (await pg.evaluate(() => navigator.clipboard.readText())) === 'https://walkstamp.com/app?lic=WS1.aaa.bbb&marca=Cliente Exemplo');
  await pg.close();
}

console.log('\n[7] teste já usado tem resposta escrita, não silêncio');
{
  const pg = await ctx.newPage();
  await pg.route('**/functions/v1/walkstamp-licenca', r =>
    r.fulfill({ status: 403, headers: {'content-type':'application/json'}, body: '{"erro":"teste_usado"}' }));
  await pg.goto('http://localhost:8919/time#access_token=tok&type=magiclink');
  await pg.waitForTimeout(600);
  ok('explica que o teste acabou',
     /já usou o teste/.test(await pg.locator('#tmMsg').textContent()),
     (await pg.locator('#tmMsg').textContent()).slice(0, 60));
  ok('e o formulário continua na tela', await pg.locator('#tmPedir').isVisible());
  await pg.close();
}

console.log('\n[8] link do e-mail vencido');
{
  const pg = await ctx.newPage();
  await pg.goto('http://localhost:8919/time#error=access_denied&error_description=Email+link+is+invalid+or+has+expired');
  await pg.waitForTimeout(400);
  ok('diz que não valeu e manda pedir outro',
     /não valeu/.test(await pg.locator('#tmMsg').textContent()),
     (await pg.locator('#tmMsg').textContent()).slice(0, 60));
  ok('e limpa o endereço', !/error=/.test(await pg.evaluate(() => location.href)));
  await pg.close();
}

console.log('\n[9] a ferramenta aponta para cá');
{
  const pg = await ctx.newPage();
  await pg.goto('http://localhost:8919/app.html?lang=pt');
  await pg.waitForTimeout(400);
  // o botão de vender saiu do rodapé; a caixa abre pelo link do e-mail
  await pg.evaluate(() => document.getElementById('licBox').classList.remove('hide'));
  await pg.waitForTimeout(150);
  ok('o botão de pedir o link está na caixa da licença',
     /\/time$/.test(await pg.locator('#licPedir').getAttribute('href')),
     await pg.locator('#licPedir').getAttribute('href'));
  ok('e ele é um link de verdade, não um botão com script',
     (await pg.locator('#licPedir').evaluate(e => e.tagName)) === 'A');
  await pg.close();
}

await br.close(); srv.close();
console.log(falhas ? '\n' + falhas + ' falha(s)' : '\nPágina do plano Time: tudo passou.');
process.exit(falhas ? 1 : 0);
