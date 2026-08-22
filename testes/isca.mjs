/* A ESTRATÉGIA DO MENU: mostrar o que é pago, em vez de esconder.
 *
 * A área do cliente escondia o que era de plano: quem não tinha, não via. Isso
 * é limpo e não vende nada. Um recurso que nunca apareceu não é desejado — quem
 * nunca leu "Casos de teste" no menu não tem por que querer o plano que o
 * libera, e a página de preços fica tentando descrever de fora um recurso que a
 * pessoa poderia ter visto de dentro.
 *
 * Agora o item aparece marcado, e clicar leva a uma tela que explica o que ele
 * faz e oferece os preços. Porta, não muro.
 *
 * A EXCEÇÃO, e é o contrário: `negocio` continua escondido. Uma aba de
 * administração com cadeado anuncia a cada visitante que ela existe. Ali
 * esconder não é desenho de venda, é a trava — e é por isso que este teste
 * pergunta as duas coisas separadamente.
 */
import { chromium } from 'playwright';
import { spawn, execSync } from 'child_process';
import http from 'http';
import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const P = 8833, B = 8834;
const BASE = `http://localhost:${P}`;
const DONO = 'dono@isca.example';

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const rotas = JSON.parse(fs.readFileSync(`${RAIZ_WS}/src/rotas.json`, 'utf8'));
const SUB = rotas.subConta;
const PRECOS = rotas.slugs.precos;

let QUEM = null, PLANO = null, TIME = false;

const conta = () => ({
  email: QUEM, plano: PLANO, assentos: 3, dias: 90, cliente: 'Cliente',
  motivo: PLANO ? 'conta' : 'sem', papel: 'admin', vence_em: '2026-11-13',
  emissoes: 0, assinante: Boolean(PLANO),
  perfil: { cliente: null, config: null, modelos: [] },
  faturas: [], chamados: [], resposta: null,
  time: TIME ? { cliente: 'Cliente', assentos: 3, usados: 1, pessoas: [], config: {} } : null,
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
    if (fn === 'walkstamp_roteiro_meus') return j({ roteiros: [] });
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
async function ctxDe(email) {
  const ctx = await br.newContext({ viewport: { width: 1300, height: 1100 } });
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
const menu = (pg) => pg.locator('.painelMenu ul a').evaluateAll(
  (as) => as.map((a) => ({ href: a.getAttribute('href'), txt: a.innerText.replace(/\n/g, ' ').trim(),
                           trancado: a.classList.contains('trancado') })));

const erros = [];

console.log('[1] deslogado: o menu existe, e diz o que há do outro lado');
{
  QUEM = null;
  const ctx = await ctxDe(null);
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => erros.push(e.message));
  await pg.goto(`${BASE}/conta`, { waitUntil: 'networkidle' });
  ok('a caixa de e-mail continua lá', await pg.locator('input[type=email]').count() === 1);
  const m = await menu(pg);
  ok('e o menu também — não é mais uma página nua', m.length >= 4, JSON.stringify(m.map((i) => i.txt)));
  ok('“Casos de teste” aparece, marcado como pago',
     m.some((i) => /Casos de teste/.test(i.txt) && i.trancado), JSON.stringify(m));
  ok('“Time” também', m.some((i) => /Time/.test(i.txt) && i.trancado));
  /* A que importa mais: uma aba de administração com cadeado anuncia que ela
     existe. Aqui esconder não é desenho de venda, é a trava. */
  ok('“Negócio” NÃO aparece — nem com cadeado', !m.some((i) => /Neg[óo]cio/i.test(i.txt)),
     JSON.stringify(m.map((i) => i.txt)));
  await ctx.close();
}

console.log('\n[2] deslogado, clicar no item pago explica o recurso e leva aos preços');
{
  const ctx = await ctxDe(null);
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/conta/${SUB.roteiro.pt}`, { waitUntil: 'networkidle' });
  ok('não foi jogado para a raiz', new URL(pg.url()).pathname.endsWith(SUB.roteiro.pt), pg.url());
  const txt = await pg.locator('.painelCorpo').innerText();
  ok('a tela diz o que o recurso faz', /planilha/i.test(txt), txt.slice(0, 160).replace(/\n/g, ' '));
  ok('oferece entrar', await pg.locator('.painelCorpo a[href="/conta"]').count() > 0);
  ok('e oferece os preços', await pg.locator(`.painelCorpo a[href="/${PRECOS.pt}"]`).count() > 0);
  ok('com o menu ainda ao lado', await pg.locator('.painelMenu').count() === 1);
  await ctx.close();
}

console.log('\n[3] logado no grátis: o item continua visível, e a porta vende');
{
  QUEM = 'gratis@isca.example'; PLANO = null; TIME = false;
  const ctx = await ctxDe(QUEM);
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/conta`, { waitUntil: 'networkidle' });
  const m = await menu(pg);
  ok('“Casos de teste” trancado', m.some((i) => /Casos de teste/.test(i.txt) && i.trancado));
  ok('“Faturas” e “Chamados” NÃO estão trancados — são da conta, não do plano',
     m.filter((i) => /Faturas|Chamados/.test(i.txt)).every((i) => !i.trancado), JSON.stringify(m));
  await pg.goto(`${BASE}/conta/${SUB.time.pt}`, { waitUntil: 'networkidle' });
  const txt = await pg.locator('.painelCorpo').innerText();
  ok('a porta do Time fala do plano Time', /Time|Equipe/i.test(txt), txt.slice(0, 120).replace(/\n/g, ' '));
  /* A porta tem que dizer o que NÃO muda. Sem isso ela lê como "a ferramenta é
     paga", que é falso e é o contrário do argumento do produto. */
  ok('e diz que a ferramenta continua inteira e de graça',
     /de gra[çc]a|gr[áa]tis/i.test(txt) && /ferramenta continua/i.test(txt),
     txt.slice(0, 220).replace(/\n/g, ' '));
  ok('com botão para os preços',
     await pg.locator(`.painelCorpo a[href="/${PRECOS.pt}"]`).count() > 0);
  await ctx.close();
}

console.log('\n[4] pagante: nada de cadeado, e a tela é a de verdade');
{
  QUEM = 'pago@isca.example'; PLANO = 'time'; TIME = true;
  const ctx = await ctxDe(QUEM);
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/conta`, { waitUntil: 'networkidle' });
  const m = await menu(pg);
  ok('nenhum item trancado', m.every((i) => !i.trancado), JSON.stringify(m));
  await pg.goto(`${BASE}/conta/${SUB.roteiro.pt}`, { waitUntil: 'networkidle' });
  const txt = await pg.locator('.painelCorpo').innerText();
  ok('o roteiro abre de verdade, não a porta',
     !/Ver os planos/.test(txt), txt.slice(0, 140).replace(/\n/g, ' '));
  await ctx.close();
}

console.log('\n[5] o dono vê a aba de negócio; mais ninguém sabe que ela existe');
{
  QUEM = DONO; PLANO = 'time'; TIME = true;
  const ctx = await ctxDe(DONO);
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/conta`, { waitUntil: 'networkidle' });
  ok('para o dono, “Negócio” está no menu',
     (await menu(pg)).some((i) => /Neg[óo]cio/i.test(i.txt)));
  await ctx.close();

  QUEM = 'pago@isca.example';
  const c2 = await ctxDe(QUEM);
  const p2 = await c2.newPage();
  await p2.goto(`${BASE}/conta/${SUB.negocio.pt}`, { waitUntil: 'networkidle' });
  ok('quem não é dono é mandado embora, sem tela de venda',
     new URL(p2.url()).pathname === '/conta', p2.url());
  await c2.close();
}

console.log('\n[6] a barra dentro da ferramenta carrega o mesmo cadeado');
{
  QUEM = 'gratis@isca.example'; PLANO = null; TIME = false;
  const ctx = await ctxDe(QUEM);
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => erros.push(e.message));
  await pg.goto(`${BASE}/app?lang=pt`, { waitUntil: 'networkidle' });
  await pg.waitForSelector('#barraConta:not(.hide)', { timeout: 10000 });
  const naApp = await pg.locator('#barraConta ul li a:not(.on)').evaluateAll(
    (as) => as.map((a) => ({ txt: a.innerText.replace(/\n/g, ' ').trim(),
                             trancado: a.classList.contains('trancado') })));
  ok('“Casos de teste” trancado também na ferramenta',
     naApp.some((i) => /Casos de teste/.test(i.txt) && i.trancado), JSON.stringify(naApp));
  /* O painel e a ferramenta discordarem sobre o que é pago é a pessoa
     descobrindo a diferença no clique. */
  await pg.goto(`${BASE}/conta`, { waitUntil: 'networkidle' });
  const noPainel = (await menu(pg)).map((i) => `${i.txt}|${i.trancado}`);
  ok('as duas barras concordam item a item',
     JSON.stringify(noPainel) === JSON.stringify(naApp.map((i) => `${i.txt}|${i.trancado}`)),
     `\n      painel: ${noPainel.join(' / ')}\n      app:    ${naApp.map((i) => `${i.txt}|${i.trancado}`).join(' / ')}`);
  await ctx.close();
}

ok('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
await br.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
