/* A BARRA DA CONTA DENTRO DA FERRAMENTA.
 *
 * O pedido: o app junto no menu lateral da conta. Sem iframe (já descartado) e
 * sem uma segunda cópia da ferramenta gerada pelo build — duas cópias do mesmo
 * app é o defeito que este projeto já pagou caro.
 *
 * A saída: a própria ferramenta desenha a barra, perguntando ao `/api/menu`
 * quem está logado e quais itens essa pessoa vê. É a MESMA função que monta a
 * barra do painel (`menuDe`), servida como JSON — um menu só, uma fonte só, em
 * dois lugares.
 *
 * O que este teste prova, e por que cada coisa:
 *
 *   1. logado, a barra nasce, com os itens do painel e nenhum a mais;
 *   2. a lista é IGUAL à do painel, item a item — que é a razão de o endereço
 *      existir em vez de a lista ser reescrita dentro do app;
 *   3. deslogado e no `file://`, ela não nasce, e a ferramenta é o que sempre
 *      foi. Esta é a que importa: a conta aqui dentro é aditiva, nunca
 *      requisito;
 *   4. o endereço não devolve nada além do que a pessoa já vê na conta dela;
 *   5. trocar de idioma repinta a barra.
 */
import { chromium } from 'playwright';
import { spawn, execSync } from 'child_process';
import http from 'http';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const P = 8829, B = 8830;
const BASE = `http://localhost:${P}`;
const DONO = 'dono@barra.example';

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

let QUEM = 'ana@barra.example';
let TEM_TIME = true;

const conta = () => ({
  email: QUEM, plano: 'time', assentos: 3, dias: 90, cliente: 'Cliente',
  motivo: 'conta', papel: 'admin', vence_em: '2026-11-13', emissoes: 2, assinante: true,
  perfil: { cliente: null, config: null, modelos: [] },
  faturas: [], chamados: [], resposta: null,
  time: TEM_TIME ? { cliente: 'Cliente', assentos: 3, usados: 1, pessoas: [] } : null,
});

const banco = http.createServer((q, r) => {
  const p = []; q.on('data', (d) => p.push(d));
  q.on('end', () => {
    const j = (o) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(o)); };
    if (q.url.startsWith('/auth/v1/user')) {
      if (!QUEM) { r.writeHead(401); return r.end('{}'); }
      return j({ id: 'u', aud: 'authenticated', email: QUEM });
    }
    const fn = q.url.replace('/rest/v1/rpc/', '');
    if (fn === 'walkstamp_conta_do_usuario') return j(conta());
    j({});
  });
});
await new Promise((r) => banco.listen(B, r));
try { execSync(`fuser -k ${P}/tcp 2>/dev/null`); } catch {}
await new Promise((r) => setTimeout(r, 500));

const next = spawn('npx', ['next', 'start', '-p', String(P)], {
  cwd: `${RAIZ_WS}`, stdio: 'ignore',
  env: { ...process.env, SUPABASE_URL: `http://localhost:${B}`,
         SUPABASE_SERVICE_ROLE_KEY: 'x', WALKSTAMP_SUPA_TESTE: `http://localhost:${B}`,
         WALKSTAMP_DONO: DONO },
});
process.on('exit', () => { try { next.kill('SIGKILL'); } catch {} banco.close(); });
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`${BASE}/conta`); if (r.ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

const br = await chromium.launch({ executablePath: CHROME_WS });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

async function comoSendo(email) {
  const ctx = await br.newContext({ viewport: { width: 1400, height: 1000 } });
  if (email) {
    const jwt = [b64({ alg: 'HS256', typ: 'JWT' }),
      b64({ role: 'authenticated', email, exp: Math.floor(Date.now() / 1000) + 3600 }), 'x'].join('.');
    await ctx.addCookies([{ name: 'sb-localhost-auth-token',
      value: 'base64-' + Buffer.from(JSON.stringify({ access_token: jwt, token_type: 'bearer',
        expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'r', user: { id: 'u', email } })).toString('base64'),
      domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' }]);
  }
  return ctx;
}

const itensDaBarra = (pg, sel) => pg.locator(sel).evaluateAll(
  (as) => as.map((a) => ({ href: a.getAttribute('href'), txt: a.innerText.trim() })));

const erros = [];

console.log('[1] logado, a ferramenta ganha a barra');
{
  QUEM = 'ana@barra.example'; TEM_TIME = true;
  const ctx = await comoSendo(QUEM);
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => erros.push(e.message));
  await pg.goto(`${BASE}/app?lang=pt`, { waitUntil: 'networkidle' });
  await pg.waitForSelector('#barraConta:not(.hide)', { timeout: 10000 });
  ok('a barra apareceu', await pg.locator('#barraConta').isVisible());
  ok('com o e-mail de quem está logado',
     (await pg.locator('#barraConta .quem').innerText()).includes(QUEM));
  ok('o corpo virou grade de duas colunas',
     await pg.evaluate(() => document.body.classList.contains('comBarra')));
  /* Se a barra empurrasse o trabalho para fora da tela, ela seria um problema
     novo em vez de um caminho. O cartão 1 tem que continuar visível. */
  ok('e o passo 1 continua na tela', await pg.locator('#cardVideo').isVisible());
  ok('a própria ferramenta está na lista, marcada como onde você está',
     await pg.locator('#barraConta a.on[aria-current="page"]').count() === 1);
  await ctx.close();
}

{
  const ctx = await comoSendo(QUEM);
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/app?lang=pt`, { waitUntil: 'networkidle' });
  await pg.waitForSelector('#barraConta:not(.hide)');
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: '/tmp/app-barra.png' });
  const ctx2 = await comoSendo(QUEM);
  const pg2 = await ctx2.newPage();
  await pg2.setViewportSize({ width: 430, height: 900 });
  await pg2.goto(`${BASE}/app?lang=pt`, { waitUntil: 'networkidle' });
  await pg2.waitForSelector('#barraConta:not(.hide)');
  await pg2.waitForTimeout(400);
  await pg2.screenshot({ path: '/tmp/app-barra-fone.png' });
  await ctx.close(); await ctx2.close();
}

console.log('\n[2] a lista é a MESMA do painel — item a item');
{
  const ctx = await comoSendo(QUEM);
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/conta`, { waitUntil: 'networkidle' });
  const noPainel = (await itensDaBarra(pg, '.painelMenu ul a')).map((i) => i.href + ' | ' + i.txt);
  await pg.goto(`${BASE}/app?lang=pt`, { waitUntil: 'networkidle' });
  await pg.waitForSelector('#barraConta:not(.hide)');
  const noApp = (await itensDaBarra(pg, '#barraConta ul li a:not(.on)')).map((i) => i.href + ' | ' + i.txt);
  ok('mesma quantidade de itens', noPainel.length === noApp.length,
     `painel ${noPainel.length} × app ${noApp.length}`);
  ok('mesmos endereços e mesmos rótulos, na mesma ordem',
     JSON.stringify(noPainel) === JSON.stringify(noApp),
     `\n      painel: ${noPainel.join(' / ')}\n      app:    ${noApp.join(' / ')}`);
  await ctx.close();
}

console.log('\n[3] quem nao tem time VE o item, com cadeado — e nao ve o negocio');
{
  /* Isto mudou de proposito, e a mudanca e a estrategia: o item pago APARECE
     para quem nao tem, marcado. Escondido, ninguem o deseja — quem nunca leu
     "Time" no menu nao tem por que querer o plano que o libera.
     
     O `negocio` continua escondido, e e o contrario: uma aba de administracao
     com cadeado anuncia a cada visitante que ela existe. */
  TEM_TIME = false;
  const ctx = await comoSendo(QUEM);
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/app?lang=pt`, { waitUntil: 'networkidle' });
  await pg.waitForSelector('#barraConta:not(.hide)');
  const t = await pg.locator('#barraConta').innerText();
  ok('"Time" aparece na barra da ferramenta', /\bTime\b/.test(t), t.replace(/\n/g, ' | '));
  ok('e vem marcado como pago',
     await pg.locator('#barraConta a.trancado').count() >= 1);
  ok('e sem "Negócio", que é só do dono', !/Neg[óo]cio/i.test(t));
  await ctx.close();
  TEM_TIME = true;
}

console.log('\n[4] o dono vê a aba de negócio aqui também');
{
  QUEM = DONO;
  const ctx = await comoSendo(DONO);
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/app?lang=pt`, { waitUntil: 'networkidle' });
  await pg.waitForSelector('#barraConta:not(.hide)');
  ok('“Negócio” está na barra da ferramenta',
     /Neg[óo]cio/i.test(await pg.locator('#barraConta').innerText()));
  await ctx.close();
  QUEM = 'ana@barra.example';
}

console.log('\n[5] deslogado, a barra CONTINUA — e convida a entrar');
{
  /* Isto mudou, e a mudanca e a estrategia. Antes o endereco respondia 204 sem
     sessao e a ferramenta ficava sem barra: alinhado com "a conta e opcional",
     desalinhado com o que se quer mostrar. O menu e a unica peca da tela que
     diz O QUE EXISTE alem da ferramenta gratuita — e quem usa de graca, que e
     quase todo mundo, nunca via que ha roteiro de casos, time, faturas. */
  QUEM = null;
  const ctx = await comoSendo(null);
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => erros.push(e.message));
  await pg.goto(`${BASE}/app?lang=pt`, { waitUntil: 'networkidle' });
  await pg.waitForSelector('#barraConta:not(.hide)', { timeout: 10000 });
  ok('a barra aparece mesmo sem conta', await pg.locator('#barraConta').isVisible());
  ok('a primeira linha convida a entrar, em vez de dizer quem é você',
     await pg.locator('#barraConta .quem a[href="/conta"]').count() === 1,
     await pg.locator('#barraConta .quem').innerText());
  ok('os itens pagos vêm marcados',
     await pg.locator('#barraConta a.trancado').count() >= 2);
  ok('e “Negócio” não aparece para quem não é dono',
     !/Neg[óo]cio/i.test(await pg.locator('#barraConta').innerText()));
  ok('a ferramenta continua inteira', await pg.locator('#cardVideo').isVisible());
  const r = await fetch(`${BASE}/api/menu?lang=pt`);
  ok('o endereço responde 200 e devolve o menu público', r.status === 200, String(r.status));
  const j = await r.json();
  ok('sem e-mail nenhum, porque não há sessão', j.email === null, JSON.stringify(j.email));
  await ctx.close();
  QUEM = 'ana@barra.example';
}

console.log('\n[6] do arquivo local não há a quem perguntar — e nem tenta');
{
  const ctx = await br.newContext({ viewport: { width: 1400, height: 1000 } });
  const pg = await ctx.newPage();
  const pedidos = [];
  pg.on('request', (r) => pedidos.push(r.url()));
  pg.on('pageerror', (e) => erros.push(e.message));
  await pg.goto(`file://${RAIZ_WS}/public/app.html?lang=pt`, { waitUntil: 'load' });
  await pg.waitForTimeout(1200);
  ok('nenhuma barra no arquivo offline', await pg.locator('#barraConta.hide').count() === 1);
  ok('e nenhum pedido ao /api/menu', !pedidos.some((u) => u.includes('/api/menu')),
     pedidos.filter((u) => u.includes('api')).join(' '));
  ok('a ferramenta abre inteira', await pg.locator('#cardVideo').isVisible());
  await ctx.close();
}

console.log('\n[7] o endereço não conta nada além do que já está na conta');
{
  const ctx = await comoSendo(QUEM);
  const cookies = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
  const r = await fetch(`${BASE}/api/menu?lang=pt`, { headers: { cookie: cookies } });
  const j = await r.json();
  const cru = JSON.stringify(j);
  ok('devolve o e-mail da sessão e a lista', j.email === QUEM && Array.isArray(j.itens));
  /* A primeira versao desta prova procurava as palavras "fatura" e "chamado" no
     corpo da resposta -- e falhou, com razao: elas estao la, como ROTULOS do
     menu, que e exatamente o que a pessoa ja le na propria conta. Procurar
     palavra era a pergunta errada.

     A pergunta certa e sobre a FORMA: o que sai daqui tem estes campos e nenhum
     outro. Assim, no dia em que alguem acrescentar `conta` ou `faturas` ao
     payload para economizar um pedido, este teste cai. */
  const campos = Object.keys(j).sort().join(',');
  /* `plano` entrou na lista, e a lista existe justamente para que essa entrada
     seja uma DECISÃO e não um descuido. Ele é o nome do plano de quem está
     logado — "Plano Team" — já traduzido e pronto para a tela, e é da mesma
     classe do `email`: o que a pessoa já lê no primeiro parágrafo da própria
     conta. Não é o objeto da conta, não é fatura, não é assento. */
  ok('a resposta tem exatamente os campos previstos',
     campos === 'email,entrar,ferramenta,itens,plano,raiz', campos);
  /* E o que ele carrega é o RÓTULO, e não o estado da assinatura: nada de
     `motivo`, `vence_em` ou `assinante` viaja junto. */
  ok('o plano vem como rótulo pronto, e nada além',
     j.plano === null || (typeof j.plano === 'string' && j.plano.length < 40),
     JSON.stringify(j.plano));
  const campoItem = [...new Set(j.itens.flatMap((i) => Object.keys(i)))].sort().join(',');
  ok('e cada item, so o que a barra desenha',
     campoItem === 'bloqueado,href,icone,rotulo,selo,slug', campoItem);
  ok('nenhum numero de dinheiro, prazo ou contagem escapou',
     !/\d{3,}/.test(JSON.stringify({ e: j.email, i: j.itens.map((x) => [x.slug, x.rotulo, x.href]) })),
     cru.slice(0, 160));
  ok('sem cache em intermediário nenhum',
     /no-store/.test(r.headers.get('cache-control') || ''), r.headers.get('cache-control'));
  await ctx.close();
}

console.log('\n[8] trocar de idioma repinta a barra');
{
  const ctx = await comoSendo(QUEM);
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/app?lang=pt`, { waitUntil: 'networkidle' });
  await pg.waitForSelector('#barraConta:not(.hide)');
  const antes = await pg.locator('#barraConta ul').first().innerText();
  await pg.locator('#idiomas a[data-l="de"]').click();
  await pg.waitForTimeout(1200);
  const depois = await pg.locator('#barraConta ul').first().innerText();
  ok('os rótulos mudaram de idioma', antes !== depois, `${antes.replace(/\n/g, '/')} → ${depois.replace(/\n/g, '/')}`);
  ok('e os endereços foram para o alemão',
     (await itensDaBarra(pg, '#barraConta ul li a:not(.on)')).every((i) => i.href.startsWith('/de/konto')),
     JSON.stringify(await itensDaBarra(pg, '#barraConta ul li a:not(.on)')));
  await ctx.close();
}

ok('nenhum erro de JavaScript em nenhuma das telas', erros.length === 0, erros.join(' | '));

await br.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
