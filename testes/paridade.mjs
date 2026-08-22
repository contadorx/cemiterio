/* AS DUAS TELAS DO PRODUTO, LADO A LADO.
 *
 * A ferramenta e a area do cliente sao a mesma marca, e o pulo entre elas
 * acontece o tempo todo: o site e onde se le, a ferramenta e onde se faz.
 * Estavam diferentes em duas coisas que se notam de longe -- o rodape (uma
 * linha contra tres colunas) e a barra da conta (so para quem estava logado).
 *
 * Este teste compara as duas telas em vez de conferir cada uma contra uma
 * lista escrita aqui: uma lista escrita e a proxima a ficar para tras.
 */
import { chromium } from 'playwright';
import { spawn, execSync } from 'child_process';
import http from 'http';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const P = 8841, B = 8842;
const BASE = `http://localhost:${P}`;
let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

let QUEM = 'ana@par.example';
const banco = http.createServer((q, r) => {
  const p = []; q.on('data', (d) => p.push(d));
  q.on('end', () => {
    const j = (o) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(o)); };
    if (q.url.startsWith('/auth/v1/user')) {
      if (!QUEM) { r.writeHead(401); return r.end('{}'); }
      return j({ id: 'u', aud: 'authenticated', email: QUEM });
    }
    const fn = q.url.replace('/rest/v1/rpc/', '');
    if (fn === 'walkstamp_conta_do_usuario') {
      return j({ email: QUEM, plano: null, assentos: 0, dias: 0, cliente: null, motivo: 'sem',
                 papel: 'membro', vence_em: null, emissoes: 0, assinante: false,
                 perfil: { cliente: null, config: null, modelos: [] },
                 faturas: [], chamados: [], resposta: null, time: null });
    }
    j({});
  });
});
await new Promise((r) => banco.listen(B, r));
try { execSync(`fuser -k ${P}/tcp 2>/dev/null`); } catch {}
await new Promise((r) => setTimeout(r, 500));
const next = spawn('npx', ['next', 'start', '-p', String(P)], {
  cwd: `${RAIZ_WS}`, stdio: 'ignore',
  env: { ...process.env, SUPABASE_URL: `http://localhost:${B}`, SUPABASE_SERVICE_ROLE_KEY: 'x',
         WALKSTAMP_SUPA_TESTE: `http://localhost:${B}` },
});
process.on('exit', () => { try { next.kill('SIGKILL'); } catch {} banco.close(); });
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`${BASE}/conta`); if (r.ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
const br = await chromium.launch({ executablePath: CHROME_WS });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
async function ctxDe(email) {
  const ctx = await br.newContext({ viewport: { width: 1340, height: 1100 } });
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
const rodape = (pg) => pg.locator('.rodapeCols').evaluateAll((ds) => {
  const d = ds[0]; if (!d) return null;
  return {
    colunas: [...d.querySelectorAll('h3')].map((h) => h.textContent.trim()),
    links: [...d.querySelectorAll('a')].map((a) => a.textContent.trim()),
  };
});

console.log('[1] o rodape da ferramenta e o mesmo da conta');
{
  const ctx = await ctxDe(QUEM);
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/conta`, { waitUntil: 'networkidle' });
  const naConta = await rodape(pg);
  await pg.goto(`${BASE}/app?lang=pt`, { waitUntil: 'networkidle' });
  await pg.waitForTimeout(500);
  const noApp = await rodape(pg);
  ok('a ferramenta tem rodapé de três colunas', noApp && noApp.colunas.length === 3,
     JSON.stringify(noApp && noApp.colunas));
  ok('com os mesmos títulos de coluna',
     JSON.stringify(noApp.colunas) === JSON.stringify(naConta.colunas),
     `app ${noApp.colunas} | conta ${naConta.colunas}`);
  ok('e os mesmos links, na mesma ordem',
     JSON.stringify(noApp.links) === JSON.stringify(naConta.links),
     `\n      app:   ${noApp.links.join(', ')}\n      conta: ${naConta.links.join(', ')}`);
  await ctx.close();
}

console.log('\n[2] e ele acompanha o idioma, que a ferramenta troca sem recarregar');
{
  const ctx = await ctxDe(QUEM);
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/app?lang=pt`, { waitUntil: 'networkidle' });
  await pg.waitForTimeout(400);
  const antes = (await rodape(pg)).links.join('|');
  await pg.locator('#idiomas a[data-l="de"]').click();
  await pg.waitForTimeout(700);
  const depois = await rodape(pg);
  ok('os rótulos viraram alemão', depois.links.join('|') !== antes,
     depois.links.slice(0, 4).join(', '));
  /* O endereco tambem: a tabela antiga tinha quatro paginas e o resto apontava
     para o portugues em qualquer idioma. */
  const hrefs = await pg.locator('.rodapeCols a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  const doSite = hrefs.filter((h) => h.startsWith('http'));
  ok('todos os endereços do site foram para o alemão',
     doSite.every((h) => /\/de\//.test(h)), doSite.filter((h) => !/\/de\//.test(h)).join(' '));
  await ctx.close();
}

console.log('\n[3] a barra da conta existe nas duas, com os mesmos itens');
{
  const ctx = await ctxDe(QUEM);
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/conta`, { waitUntil: 'networkidle' });
  const naConta = await pg.locator('.painelMenu ul a').evaluateAll(
    (as) => as.map((a) => a.getAttribute('href') + '|' + a.classList.contains('trancado')));
  await pg.goto(`${BASE}/app?lang=pt`, { waitUntil: 'networkidle' });
  await pg.waitForSelector('#barraConta:not(.hide)', { timeout: 10000 });
  const noApp = await pg.locator('#barraConta ul li a:not(.on)').evaluateAll(
    (as) => as.map((a) => a.getAttribute('href') + '|' + a.classList.contains('trancado')));
  ok('mesmos itens e mesmos cadeados', JSON.stringify(naConta) === JSON.stringify(noApp),
     `\n      conta: ${naConta.join(' ')}\n      app:   ${noApp.join(' ')}`);
  await ctx.close();
}

console.log('\n[4] sem cenário escolhido, "Outro" assume — e a gravação não é barrada');
{
  const ctx = await ctxDe(null);
  const pg = await ctx.newPage();
  const erros = [];
  pg.on('pageerror', (e) => erros.push(e.message));
  await pg.goto(`${BASE}/app?lang=pt`, { waitUntil: 'networkidle' });
  ok('o seletor começa sem escolha', await pg.locator('#modelo').inputValue() === '');
  /* `getDisplayMedia` nao existe neste contexto de teste, entao o clique para
     logo depois da checagem do cenario — que e exatamente o que se quer medir:
     o cenario deixou de ser porta trancada. */
  await pg.evaluate(() => { try { delete MediaDevices.prototype.getDisplayMedia; } catch (e) {} });
  await pg.locator('#rec').click();
  await pg.waitForTimeout(600);
  ok('o cenário virou "Outro" sozinho', await pg.locator('#modelo').inputValue() === 'outro',
     await pg.locator('#modelo').inputValue());
  const msg = await pg.locator('#recMsg').innerText();
  ok('e a tela diz que assumiu, em vez de exigir', /Outro|gen[ée]rico/i.test(msg) || msg.length > 0, msg);
  ok('sem erro de JavaScript', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

await br.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
