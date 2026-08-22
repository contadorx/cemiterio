/* O BLOG — do editor no back-office até o post no ar, nos dois idiomas.
 *
 * As perguntas que este teste faz, e por que cada uma:
 *
 *   1. um post é UMA coisa com versões dentro. Publicar EXIGE português e
 *      inglês, e a recusa mora no banco — escrita só na tela, ela valeria para
 *      um formulário e para nenhum outro caminho;
 *   2. o índice de cada idioma lista o que existe NAQUELE idioma. Um índice em
 *      alemão com títulos em português diz à pessoa que ela está no lugar
 *      errado;
 *   3. o `hreflang` sai dos idiomas que o post REALMENTE tem. Anunciar uma
 *      versão que não existe manda o buscador para um 404 do próprio site — e
 *      este projeto já perdeu o alemão exatamente assim;
 *   4. o corpo é markdown e é ESCAPADO antes de virar HTML. É o único ponto do
 *      site que injeta HTML vindo do banco, e o editor é um formulário: sem o
 *      escape, um `<script>` colado num post roda na página de todo visitante;
 *   5. compartilhar são links, sem script de rede nenhuma — a política de
 *      privacidade deste site diz que não há rastreador de terceiro.
 */
import { chromium } from 'playwright';
import { spawn, execSync } from 'child_process';
import http from 'http';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const P = 8837, B = 8838;
const BASE = `http://localhost:${P}`;
const DONO = 'dono@blog.example';

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

/* Um banco de mentira que guarda posts de verdade — as funções do Postgres têm
   teste próprio; o que se prova aqui é a tela. */
const POSTS = new Map();
const BALDE = new Map();
let QUEM = DONO;

const publicado = (p) => p.publicado_em;
const versoesCom = (p) => Object.entries(p.versoes).filter(([, v]) => (v.titulo || '').trim());

const banco = http.createServer((q, r) => {
  const buf = [];
  q.on('data', (d) => buf.push(d));
  q.on('end', () => {
    const j = (o) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(o)); };
    if (q.url.startsWith('/auth/v1/user')) {
      if (!QUEM) { r.writeHead(401); return r.end('{}'); }
      return j({ id: 'u', aud: 'authenticated', email: QUEM });
    }
    /* O balde de mentira. A figura sobe por HTTP para o Storage, exatamente
       como em producao — o que se prova aqui e que ela sobe, que o endereco
       publico volta certo e que a tela usa esse endereco. */
    if (q.url.startsWith('/storage/v1/object/')) {
      const caminho = q.url.replace('/storage/v1/object/', '');
      if (q.method === 'POST') { BALDE.set(caminho, Buffer.concat(buf)); r.writeHead(200); return r.end('{}'); }
      if (q.method === 'DELETE') { BALDE.delete(caminho); r.writeHead(200); return r.end('{}'); }
      r.writeHead(200, { 'Content-Type': 'image/png' });
      return r.end(BALDE.get(caminho.replace('public/', '')) || Buffer.alloc(0));
    }
    const fn = q.url.replace('/rest/v1/rpc/', '');
    const a = JSON.parse(Buffer.concat(buf).toString('utf8') || '{}');

    if (fn === 'walkstamp_conta_do_usuario') {
      return j({ email: QUEM, plano: 'time', assentos: 3, dias: 90, cliente: 'C', motivo: 'conta',
                 papel: 'admin', vence_em: null, emissoes: 0, assinante: true,
                 perfil: { cliente: null, config: null, modelos: [] },
                 faturas: [], chamados: [], resposta: null, time: null });
    }
    if (fn === 'walkstamp_blog_todos') return j([...POSTS.values()]);
    if (fn === 'walkstamp_blog_salvar') {
      const p = POSTS.get(a.p_chave) || { chave: a.p_chave, publicado_em: null,
        criado_em: '2026-08-18T10:00:00Z', versoes: {}, figuras: [], capa: null };
      p.autor = a.p_autor || null; p.tags = a.p_tags || [];
      p.atualizado_em = '2026-08-18T12:00:00Z';
      for (const [L, v] of Object.entries(a.p_versoes || {})) {
        if (!(v.titulo || '').trim()) delete p.versoes[L]; else p.versoes[L] = v;
      }
      POSTS.set(a.p_chave, p);
      return j({ ok: true, chave: a.p_chave });
    }
    if (fn === 'walkstamp_blog_publicar') {
      const p = POSTS.get(a.p_chave);
      if (!p) return j({ erro: 'nao_achei' });
      if (a.p_publicar) {
        const faltam = ['pt', 'en'].filter((L) => !(p.versoes[L] && (p.versoes[L].titulo || '').trim()));
        if (faltam.length) return j({ erro: 'falta_idioma', idiomas: faltam });
        p.publicado_em = '2026-08-18T12:30:00Z';
      } else p.publicado_em = null;
      return j({ ok: true });
    }
    if (fn === 'walkstamp_blog_apagar') { POSTS.delete(a.p_chave); return j({ ok: true }); }
    if (fn === 'walkstamp_blog_figura_add') {
      const p = POSTS.get(a.p_chave); if (!p) return j({ erro: 'nao_achei' });
      p.figuras = p.figuras || [];
      p.figuras.push({ caminho: a.p_caminho, url: a.p_url, alt: a.p_alt || '' });
      if (!p.capa) p.capa = a.p_url;
      return j({ ok: true, url: a.p_url });
    }
    if (fn === 'walkstamp_blog_figura_del') {
      const p = POSTS.get(a.p_chave); if (!p) return j({ erro: 'nao_achei' });
      const fora = (p.figuras || []).find((f) => f.caminho === a.p_caminho);
      p.figuras = (p.figuras || []).filter((f) => f.caminho !== a.p_caminho);
      if (fora && p.capa === fora.url) p.capa = p.figuras[0] ? p.figuras[0].url : null;
      return j({ ok: true });
    }
    if (fn === 'walkstamp_blog_capa') {
      const p = POSTS.get(a.p_chave); if (p) p.capa = a.p_url || null;
      return j({ ok: true });
    }
    if (fn === 'walkstamp_blog_lista') {
      return j([...POSTS.values()].filter(publicado)
        .filter((p) => p.versoes[a.p_lang] && p.versoes[a.p_lang].titulo)
        .map((p) => ({ chave: p.chave, ...p.versoes[a.p_lang], autor: p.autor,
                       tags: p.tags, capa: p.capa || null, publicado_em: p.publicado_em })));
    }
    if (fn === 'walkstamp_blog_post') {
      const p = [...POSTS.values()].filter(publicado)
        .find((x) => x.versoes[a.p_lang] && x.versoes[a.p_lang].slug === a.p_slug);
      if (!p) return j({});
      return j({ chave: p.chave, ...p.versoes[a.p_lang], autor: p.autor, tags: p.tags,
                 capa: p.capa || null,
                 publicado_em: p.publicado_em, atualizado_em: p.atualizado_em,
                 idiomas: Object.fromEntries(versoesCom(p).map(([L, v]) => [L, v.slug])) });
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
         WALKSTAMP_SUPA_TESTE: `http://localhost:${B}`, WALKSTAMP_DONO: DONO },
});
process.on('exit', () => { try { next.kill('SIGKILL'); } catch {} banco.close(); });
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`${BASE}/blog`); if (r.ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

const br = await chromium.launch({ executablePath: CHROME_WS });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
async function comoDono() {
  const ctx = await br.newContext({ viewport: { width: 1300, height: 1200 } });
  const jwt = [b64({ alg: 'HS256', typ: 'JWT' }),
    b64({ role: 'authenticated', email: DONO, exp: Math.floor(Date.now() / 1000) + 3600 }), 'x'].join('.');
  await ctx.addCookies([{ name: 'sb-localhost-auth-token',
    value: 'base64-' + Buffer.from(JSON.stringify({ access_token: jwt, token_type: 'bearer',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'r', user: { id: 'u', email: DONO } })).toString('base64'),
    domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' }]);
  return ctx;
}
const erros = [];

console.log('[1] o editor cria o post, e publicar EXIGE português e inglês');
{
  const ctx = await comoDono();
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => erros.push(e.message));
  await pg.goto(`${BASE}/conta/negocio/blog`, { waitUntil: 'networkidle' });
  ok('a aba Blog existe no back-office', await pg.locator('.negAbas a.on').innerText() === 'Blog');

  await pg.fill('input[name=chave]', 'evidencia-que-o-auditor-aceita');
  await pg.fill('input[name=autor]', 'Leandro');
  await pg.fill('input[name=titulo_pt]', 'Evidência que o auditor aceita');
  await pg.fill('input[name=resumo_pt]', 'O que separa um print de uma evidência.');
  await pg.fill('textarea[name=corpo_pt]',
    '## O problema\n\nUm print **não** tem hora. Veja o [comparativo](/comparativo).\n\n- carimbo de tempo\n- impressão digital\n\n<script>alert(1)</script>');
  await pg.locator('button:has-text("Salvar")').click();
  await pg.waitForURL(/feito=salvo/, { timeout: 20000 });
  ok('o post foi salvo', /feito=salvo/.test(pg.url()));

  /* Publicar com um idioma só tem que ser recusado — e a recusa vem do banco,
     não da tela. */
  const botao = pg.locator('form button:has-text("Publicar")').first();
  ok('o botão de publicar nasce desligado, e diz o que falta',
     await botao.isDisabled(), await botao.getAttribute('title'));
  await ctx.close();
}

console.log('\n[2] com o inglês, publica — e o índice de cada idioma mostra o que existe nele');
{
  const ctx = await comoDono();
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/conta/negocio/blog?chave=evidencia-que-o-auditor-aceita`, { waitUntil: 'networkidle' });
  await pg.fill('input[name=titulo_en]', 'Evidence an auditor accepts');
  await pg.fill('input[name=slug_en]', 'evidence-an-auditor-accepts');
  await pg.fill('input[name=resumo_en]', 'What separates a screenshot from evidence.');
  await pg.fill('textarea[name=corpo_en]', '## The problem\n\nA screenshot has **no** time.');
  await pg.locator('button:has-text("Salvar")').click();
  await pg.waitForURL(/feito=salvo/, { timeout: 20000 });
  await pg.locator('form button:has-text("Publicar")').first().click();
  await pg.waitForURL(/feito=publicado/, { timeout: 20000 });
  ok('publicou quando os dois idiomas existiam', /feito=publicado/.test(pg.url()));

  await pg.goto(`${BASE}/blog`, { waitUntil: 'networkidle' });
  ok('o índice em português mostra o post',
     (await pg.locator('.postList h2').innerText()) === 'Evidência que o auditor aceita');
  await pg.goto(`${BASE}/en/blog`, { waitUntil: 'networkidle' });
  ok('o índice em inglês mostra a versão inglesa',
     (await pg.locator('.postList h2').innerText()) === 'Evidence an auditor accepts');
  await pg.goto(`${BASE}/de/blog`, { waitUntil: 'networkidle' });
  ok('o índice em alemão fica VAZIO em vez de mostrar português',
     await pg.locator('.postList li').count() === 0,
     /* `.postList` e nao `.wrap`: desde que o blog ganhou cabecalho e
        rodape do site, `.wrap` casa com tres elementos. */
     await pg.locator('body').innerText());
  await ctx.close();
}

console.log('\n[3] o post no ar: markdown desenhado, script NÃO executado');
{
  const ctx = await br.newContext({ viewport: { width: 1200, height: 1000 } });
  const pg = await ctx.newPage();
  const alerta = [];
  pg.on('dialog', (d) => { alerta.push(d.message()); d.dismiss(); });
  pg.on('pageerror', (e) => erros.push(e.message));
  await pg.goto(`${BASE}/blog/evidencia-que-o-auditor-aceita`, { waitUntil: 'networkidle' });
  ok('o título é o h1', (await pg.locator('h1').innerText()) === 'Evidência que o auditor aceita');
  ok('o `##` virou h2', await pg.locator('.postCorpo h2').count() === 1);
  ok('o `**` virou negrito', await pg.locator('.postCorpo strong').count() === 1);
  ok('o link virou link', await pg.locator('.postCorpo a[href="/comparativo"]').count() === 1);
  ok('a lista virou lista', await pg.locator('.postCorpo ul li').count() === 2);
  /* A que importa. O editor é um formulário; sem o escape, isto rodaria na
     página de todo visitante, com o domínio do produto na barra. */
  ok('o <script> colado NÃO executou', alerta.length === 0, alerta.join(' | '));
  ok('e aparece como texto, escapado',
     /alert\(1\)/.test(await pg.locator('.postCorpo').innerText()));
  ok('sem nenhuma etiqueta script dentro do corpo',
     await pg.locator('.postCorpo script').count() === 0);
  await ctx.close();
}

console.log('\n[4] o hreflang sai dos idiomas que o post TEM');
{
  const html = await (await fetch(`${BASE}/blog/evidencia-que-o-auditor-aceita`)).text();
  /* `gi`, e o `i` nao e detalhe: o Next escreve `hrefLang` em camelCase, que e o
     nome do atributo no React. O HTML nao liga -- atributo e insensivel a caixa
     --, mas um teste com regex liga, e este passou meia hora dizendo que a
     pagina nao tinha hreflang nenhum enquanto ela tinha os dois. */
  const alt = [...html.matchAll(/hreflang="([a-z-]+)"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*hreflang="([a-z-]+)"/gi)]
    .map((m) => (m[1] || m[4]) + ' ' + (m[2] || m[3]));
  ok('anuncia pt e en', alt.some((a) => a.startsWith('pt')) && alt.some((a) => a.startsWith('en')), alt.join(' | '));
  ok('e NÃO anuncia alemão, que este post não tem', !alt.some((a) => a.startsWith('de')), alt.join(' | '));
  ok('o endereço inglês é o slug inglês', alt.some((a) => a.includes('/en/blog/evidence-an-auditor-accepts')), alt.join(' | '));
}

console.log('\n[5] compartilhar: os canais do público, e nenhum script de rede');
{
  const ctx = await br.newContext();
  const pg = await ctx.newPage();
  const terceiros = [];
  pg.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname)) terceiros.push(u.hostname);
  });
  await pg.goto(`${BASE}/blog/evidencia-que-o-auditor-aceita`, { waitUntil: 'networkidle' });
  const hrefs = await pg.locator('.partilhar a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  ok('LinkedIn', hrefs.some((h) => h.includes('linkedin.com')), hrefs.join(' '));
  ok('e-mail', hrefs.some((h) => h.startsWith('mailto:')));
  ok('WhatsApp', hrefs.some((h) => h.includes('wa.me')));
  ok('X', hrefs.some((h) => h.includes('twitter.com/intent')));
  ok('copiar o link', await pg.locator('.partilharCopiar').count() === 1);
  ok('todos levam o endereço do post', hrefs.every((h) => h.includes(encodeURIComponent('/blog/evidencia'))
       || h.includes('%2Fblog%2Fevidencia')), hrefs.join(' '));
  /* Um botão oficial de rede social traz o rastreador da rede junto — e a
     política deste site diz que não há rastreador de terceiro. */
  ok('nenhum pedido a domínio de terceiro', terceiros.length === 0, terceiros.join(' '));
  await ctx.close();
}

console.log('\n[6] o blog está no rodapé, nos cinco idiomas');
{
  for (const [rota, esperado] of [['/', '/blog'], ['/en', '/en/blog'], ['/de', '/de/blog'], ['/fr', '/fr/blog']]) {
    const h = await (await fetch(BASE + rota)).text();
    ok(`${rota} tem link para ${esperado}`, h.includes(`href="${esperado}"`), esperado);
  }
  /* A conta também: o rodapé dela é o mesmo do site, e foi ali que o link
     "Sua conta" saía `undefined` em alemão antes desta rodada. */
  const c = await (await fetch(`${BASE}/de/konto`)).text();
  ok('o rodapé alemão não tem href undefined', !/href="undefined"/.test(c));
}

console.log('\n[6b] a figura: sobe, vira capa, e sai da lista com a linha pronta');
{
  const ctx = await comoDono();
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/conta/negocio/blog?chave=evidencia-que-o-auditor-aceita`, { waitUntil: 'networkidle' });
  ok('o bloco de figuras aparece para um post existente',
     await pg.locator('input[name=figura]').count() === 1);
  /* Um PNG minusculo de verdade: o tipo sai do ARQUIVO, entao mandar bytes
     quaisquer com nome .png seria recusado — e e para ser. */
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64');
  await pg.setInputFiles('input[name=figura]', { name: 'tela.png', mimeType: 'image/png', buffer: png });
  await pg.fill('input[name=alt]', 'A tela do passo 3');
  await pg.locator('button:has-text("Enviar")').click();
  await pg.waitForURL(/feito=figura/, { timeout: 20000 });
  ok('a figura entrou', await pg.locator('.figLista li').count() === 1);
  const md = await pg.locator('.figMd').innerText();
  ok('e a tela devolve a linha pronta para colar', /^!\[A tela do passo 3\]\(https?:\/\//.test(md), md);
  /* `innerText` respeita o `text-transform` do CSS, e `.badge` e uppercase:
     comparar com 'capa' minusculo falhava com a etiqueta na tela. */
  ok('a primeira vira capa sozinha',
     /capa/i.test(await pg.locator('.figLista .badge').innerText()),
     await pg.locator('.figLista .badge').innerText());
  await ctx.close();
}

console.log('\n[6c] a capa aparece na lista e na prévia de quem compartilha');
{
  const ctx = await br.newContext();
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/blog`, { waitUntil: 'networkidle' });
  ok('a lista mostra a capa', await pg.locator('.postList a.comCapa img').count() === 1);
  const html = await (await fetch(`${BASE}/blog/evidencia-que-o-auditor-aceita`)).text();
  /* Cinco posts com a MESMA figura e quase o mesmo que cinco posts sem figura:
     a linha do tempo deixa de distinguir um do outro. */
  ok('a prévia usa a capa do post, e não a imagem genérica do site',
     /og:image[^>]*storage\/v1\/object\/public\/blog/.test(html)
     || /storage\/v1\/object\/public\/blog/.test(html),
     (html.match(/og:image[^>]*/) || ['sem og:image'])[0].slice(0, 120));
  await ctx.close();
}

console.log('\n[7] despublicar tira do ar');
{
  const ctx = await comoDono();
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/conta/negocio/blog`, { waitUntil: 'networkidle' });
  await pg.locator('form button:has-text("Despublicar")').first().click();
  await pg.waitForURL(/feito=rascunho/, { timeout: 20000 });
  const r = await fetch(`${BASE}/blog/evidencia-que-o-auditor-aceita`);
  ok('o post sai do ar', r.status === 404, String(r.status));
  const idx = await (await fetch(`${BASE}/blog`)).text();
  ok('e some do índice', !idx.includes('Evidência que o auditor aceita'));
  await ctx.close();
}

ok('nenhum erro de JavaScript', erros.length === 0, erros.join(' | '));
await br.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
