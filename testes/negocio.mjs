/* O BACK-OFFICE — a aba `Negócio` da área da conta.
 *
 * Ela é a única tela do produto que mostra dados de TODO MUNDO: receita, lista
 * de e-mails, chamados. Por isso este teste pergunta duas coisas antes de
 * perguntar qualquer coisa sobre desenho:
 *
 *   1. quem não é o dono não chega lá — nem pelo menu, nem digitando o endereço;
 *   2. cada aba da faixa tem endereço que responde.
 *
 * A (2) parece boba e não é: as abas moram um nível mais fundo que o resto do
 * painel (`/conta/negocio/contas`), e `/conta/negocio` já é uma reescrita. Sem
 * ponte própria em `beforeFiles`, a aba aparece na faixa e dá 404 no clique —
 * que é exatamente o que aconteceu com `/conta/faturas` quando o painel nasceu.
 *
 * O que ele NÃO prova: a trava do banco. `walkstamp_negocio_painel` está
 * revogada de `anon` e `authenticated` e concedida só ao `service_role`, e isso
 * se prova no Postgres — uma tela que "não mostra o link" não é controle de
 * acesso.
 */
import { chromium } from 'playwright';
import { spawn, execSync } from 'child_process';
import http from 'http';
import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const P = 8823, B = 8824;
const BASE = `http://localhost:${P}`;
const DONO = 'dono@walkstamp.example';

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

/* As abas e os endereços saem do `rotas.json`, e não escritos aqui: um teste
   com a lista própria passa a aprovar exatamente o erro que deveria pegar. */
const rotas = JSON.parse(fs.readFileSync(`${RAIZ_WS}/src/rotas.json`, 'utf8'));
const ABAS = rotas.abasNegocio;
const SUB = rotas.subConta;
const CONTA_EM = { pt: '/conta', en: '/en/account', es: '/es/cuenta', de: '/de/konto', fr: '/fr/compte' };
const IDIOMAS = Object.keys(CONTA_EM);

/* ----------------------------------------------------------- o banco falso */

const chamadas = [];
const respostas = [];
let QUEM = DONO;

const conta = () => ({
  email: QUEM, plano: 'time', assentos: 3, dias: 90, cliente: 'Cliente de Teste',
  motivo: 'conta', papel: 'admin', vence_em: '2026-11-13', emissoes: 2, assinante: true,
  perfil: { cliente: 'Cliente de Teste', config: null, modelos: [] },
  faturas: [], chamados: [], resposta: null, time: null,
});

/* O painel: um cliente com assento parado, uma fatura vencida, um chamado sem
   resposta há semanas e alguém na lista de interesse que JÁ virou conta. Cada
   um desses existe para provar uma regra da tela. */
const PAINEL = {
  resumo: {
    contas: 2, contas30: 1, clientes: 2, clientesAtivos: 1,
    assentosVendidos: 10, assentosUsados: 4,
    pago: 149000, aberto: 104700, vencido: 104700, nVencidas: 1,
    chamadosAbertos: 1, chamadosParados: 1, chamadosTotal: 2,
    interesse: 2, interesse30: 2, eventos30: 390, emissoes30: 3,
  },
  clientes: [
    { id: 1, nome: 'Acme S.A.', plano: 'time', ativo: true, assentos: 10, dias: 90,
      criado_em: '2026-06-01T10:00:00Z', stripe: true, usados: 4, pago: 149000, aberto: 104700 },
    { id: 2, nome: 'Antiga Ltda', plano: 'personal', ativo: false, assentos: 1, dias: 30,
      criado_em: '2026-02-01T10:00:00Z', stripe: false, usados: 0, pago: 0, aberto: 0 },
  ],
  contas: [
    { email: 'ana@acme.example', plano: 'time', cliente: 'Acme S.A.', ativo: true,
      assentos: 10, dias: 90, emissoes: 12, ultima_em: '2026-08-17T10:00:00Z',
      vence_em: '2026-11-13', criado_em: '2026-06-02T10:00:00Z' },
    { email: 'ja-virou@teste.example', plano: null, cliente: null, ativo: true,
      assentos: null, dias: null, emissoes: 0, ultima_em: null,
      vence_em: null, criado_em: '2026-08-01T10:00:00Z' },
  ],
  faturas: [
    { numero: '2026-002', cliente: 'Acme S.A.', valor: 104700, moeda: 'BRL', status: 'aberta',
      vence_em: '2026-07-10', pago_em: null, nf_numero: null, nf_url: null,
      competencia: '2026-07-01', criado_em: '2026-06-16T10:00:00Z', atrasada: true },
    { numero: '2026-003', cliente: 'Acme S.A.', valor: 149000, moeda: 'BRL', status: 'paga',
      vence_em: '2026-08-10', pago_em: '2026-08-09T10:00:00Z', nf_numero: 'NFSe 4417',
      nf_url: 'https://nf.example/4417.pdf', competencia: '2026-08-01',
      criado_em: '2026-08-01T10:00:00Z', atrasada: false },
  ],
  chamados: [
    { numero: 'CH-2', tipo: 'elogio', status: 'respondido', texto: 'Muito bom o PDF.',
      resposta: 'Obrigado!', email: 'feliz@acme.example', nota: 5, idioma: 'pt',
      cenario: 'evidencia', origem: 'app', diagnostico: null,
      criado_em: '2026-08-16T10:00:00Z', respondido_em: '2026-08-16T12:00:00Z' },
    { numero: 'CH-1', tipo: 'erro', status: 'aberto', texto: 'O ZIP saiu sem a legenda.',
      resposta: null, email: 'ana@acme.example', nota: null, idioma: 'pt',
      cenario: 'instrucao', origem: 'app', diagnostico: 'chrome 139 / 8 GB',
      criado_em: '2026-07-20T10:00:00Z', respondido_em: null },
  ],
  interesse: [
    { email: 'esperando@teste.example', idioma: 'pt', criado_em: '2026-08-10T10:00:00Z' },
    { email: 'ja-virou@teste.example', idioma: 'en', criado_em: '2026-07-30T10:00:00Z' },
  ],
  nps: {
    total: 12, promotores: 7, passivos: 2, detratores: 3, media: 8.1, nps: 33,
    faixas: [{ chave: '6', n: 3 }, { chave: '8', n: 2 }, { chave: '10', n: 7 }],
  },
  uso: {
    formato: [{ chave: 'pdf', n: 210 }, { chave: 'docx', n: 120 }, { chave: 'scorm', n: 4 }],
    idioma: [{ chave: 'pt', n: 300 }, { chave: 'en', n: 90 }],
    origem: [{ chave: 'app', n: 380 }, { chave: 'offline', n: 10 }],
    dia: [{ chave: '2026-08-17', n: 12 }],
  },
};

const banco = http.createServer((q, r) => {
  const p = [];
  q.on('data', (d) => p.push(d));
  q.on('end', () => {
    const j = (o) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(o)); };
    if (q.url.startsWith('/auth/v1/user')) {
      if (!QUEM) { r.writeHead(401); return r.end('{}'); }
      return j({ id: 'u', aud: 'authenticated', email: QUEM });
    }
    const fn = q.url.replace('/rest/v1/rpc/', '');
    chamadas.push({ fn, auth: q.headers.authorization || '' });
    if (fn === 'walkstamp_conta_do_usuario') return j(conta());
    if (fn === 'walkstamp_negocio_painel') return j(PAINEL);
    /* A aba `Blog` lê os posts. Sem isto o banco falso devolvia `{}` e a tela
       caía com 500 — que foi como este teste achou que a página de gestão não
       aguentava uma resposta fora de formato. */
    if (fn === 'walkstamp_blog_todos') return j([]);
    if (fn === 'walkstamp_chamado_responder') {
      const corpo = JSON.parse(Buffer.concat(p).toString('utf8') || '{}');
      respostas.push(corpo);
      return j({ ok: true, numero: corpo.p_numero });
    }
    j({});
  });
});
await new Promise((r) => banco.listen(B, r));

const matarPorta = () => { try { execSync(`fuser -k ${P}/tcp 2>/dev/null`); } catch {} };
matarPorta();
await new Promise((r) => setTimeout(r, 500));

const next = spawn('npx', ['next', 'start', '-p', String(P)], {
  cwd: `${RAIZ_WS}`, stdio: 'ignore',
  env: { ...process.env,
    SUPABASE_URL: `http://localhost:${B}`,
    SUPABASE_SERVICE_ROLE_KEY: 'chave_de_mentira',
    WALKSTAMP_SUPA_TESTE: `http://localhost:${B}`,
    WALKSTAMP_DONO: DONO },
});
process.on('exit', () => { try { next.kill('SIGKILL'); } catch {} matarPorta(); banco.close(); });
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`${BASE}/conta`); if (r.ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

const br = await chromium.launch({ executablePath: CHROME_WS });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** Um contexto já logado como `email`. Trocar de pessoa é trocar de contexto:
 *  o cookie de sessão é do navegador, não da página. */
async function comoSendo(email) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 1600 } });
  const jwt = [b64({ alg: 'HS256', typ: 'JWT' }),
    b64({ role: 'authenticated', email, exp: Math.floor(Date.now() / 1000) + 3600 }), 'x'].join('.');
  const sess = { access_token: jwt, token_type: 'bearer', expires_in: 3600,
                 expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r',
                 user: { id: 'u', email } };
  await ctx.addCookies([{ name: 'sb-localhost-auth-token',
    value: 'base64-' + Buffer.from(JSON.stringify(sess)).toString('base64'),
    domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' }]);
  return ctx;
}

const erros = [];

console.log('[1] a aba só existe para o dono');
{
  QUEM = DONO;
  const ctx = await comoSendo(DONO);
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => erros.push(e.message));
  await pg.goto(`${BASE}/conta`, { waitUntil: 'networkidle' });
  const menu = await pg.locator('.painelMenu').innerText();
  ok('o dono vê `Negócio` no menu', /Neg[óo]cio/i.test(menu), menu.replace(/\n/g, ' | '));
  await ctx.close();

  QUEM = 'outra@acme.example';
  const ctx2 = await comoSendo(QUEM);
  const pg2 = await ctx2.newPage();
  await pg2.goto(`${BASE}/conta`, { waitUntil: 'networkidle' });
  const menu2 = await pg2.locator('.painelMenu').innerText();
  ok('quem não é dono NÃO vê o item', !/Neg[óo]cio/i.test(menu2), menu2.replace(/\n/g, ' | '));

  /* E o endereço digitado à mão também não entrega. Esconder o link é desenho;
     recusar o endereço é a trava. */
  await pg2.goto(`${BASE}/conta/negocio`, { waitUntil: 'networkidle' });
  ok('e digitando o endereço volta para a raiz da conta',
     new URL(pg2.url()).pathname === '/conta', pg2.url());
  const corpo2 = await pg2.locator('body').innerText();
  ok('sem vazar nenhum número do negócio', !/1\.047,00|Acme S\.A\./.test(corpo2));
  await ctx2.close();
}

console.log('\n[2] toda aba da faixa tem endereço que responde — nos cinco idiomas');
{
  QUEM = DONO;
  const ctx = await comoSendo(DONO);
  const pg = await ctx.newPage();
  for (const L of IDIOMAS) {
    const raiz = `${CONTA_EM[L]}/${SUB.negocio[L]}`;
    for (const aba of ['', ...ABAS]) {
      const url = BASE + raiz + (aba ? `/${aba}` : '');
      const r = await pg.goto(url, { waitUntil: 'domcontentloaded' });
      const caiu = new URL(pg.url()).pathname;
      ok(`${raiz}${aba ? '/' + aba : ''} responde e fica onde está`,
         r.status() === 200 && caiu === raiz + (aba ? `/${aba}` : ''),
         `${r.status()} → ${caiu}`);
    }
  }
  await ctx.close();
}

console.log('\n[3] a faixa leva a todas as abas, e marca onde você está');
{
  const ctx = await comoSendo(DONO);
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/conta/negocio`, { waitUntil: 'networkidle' });
  const hrefs = await pg.locator('.negAbas a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  ok(`a faixa tem ${ABAS.length + 1} abas`, hrefs.length === ABAS.length + 1, hrefs.join(' '));
  for (const aba of ABAS) {
    ok(`a faixa aponta para /conta/negocio/${aba}`, hrefs.includes(`/conta/negocio/${aba}`), hrefs.join(' '));
  }
  ok('no radar, a aba marcada é a primeira',
     await pg.locator('.negAbas a.on').innerText() === 'Radar');
  await pg.goto(`${BASE}/conta/negocio/${ABAS[0]}`, { waitUntil: 'networkidle' });
  ok(`em /${ABAS[0]} a marca andou junto`,
     (await pg.locator('.negAbas a.on').count()) === 1
     && (await pg.locator('.negAbas a.on').getAttribute('href')) === `/conta/negocio/${ABAS[0]}`);
  await ctx.close();
}

console.log('\n[4] o radar conta o que precisa de você — e ninguém escreveu os avisos');
{
  const ctx = await comoSendo(DONO);
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/conta/negocio`, { waitUntil: 'networkidle' });
  const t = await pg.locator('.painelCorpo').innerText();
  ok('o recebido sai em real, não em centavos', t.includes('1.490,00') && !t.includes('149000'), t.slice(0, 400));
  ok('o vencido aparece com o número de faturas', /1\.047,00/.test(t) && /1 fatura/.test(t));
  ok('o assento pago e parado é contado', /6 assento/.test(t), t);
  ok('e o chamado parado também', /1 chamado\(s\) sem resposta/.test(t));
  ok('o uso mostra o formato mais gerado', /pdf/.test(t) && /210/.test(t));
  ok('a caixa "Precisa de você" não está vazia', /Precisa de voc/.test(t));
  await ctx.close();
}

console.log('\n[5] cobranças: o que não foi pago vem primeiro');
{
  const ctx = await comoSendo(DONO);
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/conta/negocio/cobrancas`, { waitUntil: 'networkidle' });
  const linhas = await pg.locator('table.legal tbody tr').evaluateAll((trs) => trs.map((tr) => tr.innerText));
  ok('a vencida está na primeira linha', /2026-002/.test(linhas[0] || ''), (linhas[0] || '').replace(/\t/g, ' | '));
  ok('e está escrito que ela venceu', /vencida/i.test(linhas[0] || ''));
  ok('a paga mostra a nota fiscal', /NFSe 4417/.test(linhas.join(' ')));
  await ctx.close();
}

console.log('\n[6] chamados: sem resposta no topo, do mais velho para o mais novo');
{
  const ctx = await comoSendo(DONO);
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/conta/negocio/chamados`, { waitUntil: 'networkidle' });
  const itens = await pg.locator('.negLista li').evaluateAll((ls) => ls.map((l) => l.innerText));
  ok('o sem resposta é o primeiro', /CH-1/.test(itens[0] || ''), (itens[0] || '').replace(/\n/g, ' | '));
  ok('e está marcado como sem resposta', /sem resposta/i.test(itens[0] || ''));
  ok('o respondido mostra a resposta', /Obrigado!/.test(itens.join(' ')));
  ok('o diagnóstico está guardado, não jogado na cara',
     (await pg.locator('details summary').count()) >= 1);
  await ctx.close();
}

console.log('\n[6b] o NPS sai das notas de 0 a 10, e diz o tamanho da amostra');
{
  const ctx = await comoSendo(DONO);
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/conta/negocio`, { waitUntil: 'networkidle' });
  const t = await pg.locator('.painelCorpo').innerText();
  ok('o índice aparece', /NPS/.test(t) && /\b33\b/.test(t), t.slice(0, 80).replace(/\n/g, ' '));
  ok('com promotores e detratores separados', /Promotores/.test(t) && /Detratores/.test(t));
  /* Um NPS sem o tamanho da amostra é um número que convida a decidir roteiro
     de produto em cima de três pessoas. */
  ok('e com o número de respostas junto', /12 resposta/.test(t));
  ok('a distribuição das notas aparece', /Distribui/.test(t));
  await ctx.close();
}

console.log('\n[6c] responder um chamado grava no banco — não abre o e-mail');
{
  const ctx = await comoSendo(DONO);
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/conta/negocio/chamados`, { waitUntil: 'networkidle' });
  /* O respondido NÃO ganha formulário: responder duas vezes sobrescreve a
     resposta que a pessoa já leu. */
  const forms = await pg.locator('.negLista li form').count();
  ok('só o chamado sem resposta ganha formulário', forms === 1, String(forms));
  await pg.locator('.negLista li form textarea').fill('Consertado na versão de hoje — o zip agora leva a legenda.');
  await pg.locator('.negLista li form button').click();
  await pg.waitForURL(/[?&](feito|erro)=/, { timeout: 20000 });
  ok('voltou dizendo qual chamado foi respondido', /feito=CH-1/.test(pg.url()), pg.url());
  ok('o banco recebeu o número e o texto',
     respostas.length === 1 && respostas[0].p_numero === 'CH-1'
     && /Consertado/.test(respostas[0].p_texto), JSON.stringify(respostas));
  await ctx.close();
}

console.log('\n[7] interesse: quem já virou conta sai da lista');
{
  const ctx = await comoSendo(DONO);
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/conta/negocio/interesse`, { waitUntil: 'networkidle' });
  const t = await pg.locator('.painelCorpo').innerText();
  ok('quem ainda espera aparece', t.includes('esperando@teste.example'));
  ok('quem já virou conta some da tabela',
     (await pg.locator('table.legal tbody tr').count()) === 1, t.replace(/\n/g, ' | '));
  ok('e a tela diz quantos saíram', /1 j[áa] viraram conta|1 já/.test(t), t.slice(0, 300));
  const bcc = await pg.locator('a.btn').getAttribute('href');
  ok('o botão de escrever usa cópia oculta', (bcc || '').startsWith('mailto:?bcc='), bcc);
  ok('e não leva quem já virou conta junto', !(bcc || '').includes('ja-virou'), bcc);
  await ctx.close();
}

console.log('\n[8] a leitura é do servidor, com a chave de serviço');
{
  const doNegocio = chamadas.filter((c) => c.fn === 'walkstamp_negocio_painel');
  ok('o painel foi lido pela função certa', doNegocio.length > 0);
  ok('e sempre com a chave de serviço no cabeçalho',
     doNegocio.every((c) => c.auth === 'Bearer chave_de_mentira'));
  /* A tela não pode ter mandado nada disso para o navegador como JSON de
     hidratação: a área da conta é server component de ponta a ponta. */
  const ctx = await comoSendo(DONO);
  const pg = await ctx.newPage();
  const html = await (await fetch(`${BASE}/conta/negocio`, {
    headers: { cookie: (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ') },
  })).text();
  ok('nenhum "use client" arrastou React para esta tela',
     !/negAbas[^]{0,4000}__next_f\.push[^]{0,200}Acme/.test(html));
  await ctx.close();
}

ok('nenhum erro de JavaScript na página', erros.length === 0, erros.join(' | '));

await br.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
