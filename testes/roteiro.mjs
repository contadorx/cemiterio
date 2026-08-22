/* A tela de controle do roteiro de casos — a que vive em /conta/roteiro.
 *
 * ESCOPO. Este teste sobe um Next de verdade com um Supabase DE MENTIRA do
 * outro lado (autenticação e RPC), e prova o que só o Next pode errar:
 *
 *   - a porta do plano: quem não paga vê a tela, entende o que ela faz e sai
 *     por um link — e NÃO vê os controles que não funcionariam para ele;
 *   - a separação personal × time, que é o pedido literal: um roteiro "só meu"
 *     e um "do time" não podem cair na mesma lista sem distinção;
 *   - o link do caso, que é a peça que liga as duas telas: ele tem que abrir a
 *     ferramenta com caso, sistema e chamado dentro, e com o `rot=` da volta;
 *   - a volta: `?feito=<caso>` vira um POST, e nunca uma gravação por GET —
 *     endereço que grava é endereço que o histórico do navegador reexecuta;
 *   - o "feito" e o "atribuir" chegando ao banco com o e-mail DA SESSÃO, e não
 *     o que o formulário mandar;
 *   - a planilha de volta, aberta pelo openpyxl para provar que é xlsx de
 *     verdade e não um zip que só a nossa própria casa lê.
 *
 * O que ele NÃO prova: as regras dentro do banco (quem enxerga o quê, quem
 * apaga). Elas moram no Postgres e foram provadas lá, contra a migração
 * `roteiro_de_casos_na_conta` — uma página que "esconde o botão" não é
 * controle de acesso.
 */
import { chromium } from './_navegador.mjs';
import { spawn, execFileSync } from 'child_process';
import http from 'http';
import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const PORTA_NEXT = 8807;
const PORTA_BANCO = 8808;
const BASE = `http://localhost:${PORTA_NEXT}`;

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

/* ----------------------------------------------------------- o banco falso */

const chamadas = [];
let QUEM = 'chefe@teste-roteiro.example';   // quem a sessão diz que é
let CONTA = null;                            // o que `conta_do_usuario` devolve

const CASOS = [
  { id: 11, ordem: 1, caso: 'CT-01', titulo: 'Entrar no sistema', cenario: null,
    chamado: 'NAT-1234', sistema: 'Portal', responsavel: 'ana@teste-roteiro.example',
    feito_em: null, feito_por: null, arquivo: null, impressao: null, observacao: null,
    recibo: null, anexo: null },
  { id: 12, ordem: 2, caso: 'CT-02', titulo: 'Sair', cenario: null,
    chamado: null, sistema: 'Portal', responsavel: null,
    feito_em: '2026-08-16T10:20:00Z', feito_por: 'ana@teste-roteiro.example',
    arquivo: 'CT-02.pdf', impressao: 'a1b2c3d4e5f6a7b8', observacao: 'passou',
    recibo: { g: 'Walkstamp', v: 1, caso: 'CT-02', cen: 'evidencia', n: 4,
              imp: 'a1b2c3d4e5f6a7b8', h: ['aa', 'bb', 'cc', 'dd'], fmt: 'pdf' },
    anexo: { nome: 'sessao-CT-02.json', bytes: 8388608, em: '2026-08-16T10:21:00Z' } },
];

const ROTEIRO_TIME = {
  id: 7, nome: 'Regressão de agosto', escopo: 'time', dono: 'chefe@teste-roteiro.example',
  criado_em: '2026-08-16T09:00:00Z', meu: true, casos: CASOS,
};
const ROTEIRO_MEU = {
  id: 9, nome: 'Minhas verificações', escopo: 'personal', dono: 'chefe@teste-roteiro.example',
  criado_em: '2026-08-16T08:00:00Z', meu: true,
  casos: [{ id: 21, ordem: 1, caso: 'PV-01', titulo: 'Só meu', cenario: null, chamado: null,
            sistema: null, responsavel: null, feito_em: null, feito_por: null,
            arquivo: null, impressao: null, observacao: null, recibo: null, anexo: null }],
};

const contaPaga = () => ({
  email: QUEM, plano: 'time', assentos: 3, dias: 90, cliente: 'Cliente de Teste',
  motivo: 'conta', papel: 'admin', vence_em: null, emissoes: 0, assinante: true,
  perfil: { cliente: null, config: null, modelos: [] },
  faturas: [], chamados: [], resposta: null,
  time: { cliente: 'Cliente de Teste', assentos: 3, usados: 2, dias: 90, dominios: [],
          pessoas: [
            { email: 'chefe@teste-roteiro.example', papel: 'admin', ativo: true, admin: true, ultima_em: null, vence_em: null },
            { email: 'ana@teste-roteiro.example', papel: 'membro', ativo: true, admin: false, ultima_em: null, vence_em: null },
          ] },
});
const contaGratis = () => ({ ...contaPaga(), plano: null, motivo: 'teste_usado', papel: 'membro', time: null, assinante: false });

/* O que o Storage de mentira recebeu. É aqui que o teste consegue perguntar a
   coisa que mais importa: o que exatamente saiu do navegador. */
const balde = new Map();
let ANEXO = null;
/* A fila de órfãos que o banco devolve, e o que o servidor disse ter faxinado.
   É por aqui que o teste pergunta a coisa que importa: o arquivo saiu mesmo? */
const FILA = [];
const FAXINADOS = [];
let quebrarApagar = false;

const banco = http.createServer((q, r) => {
  const pedacos = [];
  q.on('data', (d) => { pedacos.push(d); });
  q.on('end', () => {
    const bruto = Buffer.concat(pedacos);
    /* O Storage do Supabase: subir, assinar e apagar. */
    const st = q.url.match(/^\/storage\/v1\/object\/(sign\/)?roteiro\/(.+)$/);
    if (st) {
      const caminho = decodeURIComponent(st[2]);
      if (q.method === 'POST' && st[1]) {
        r.writeHead(200, { 'Content-Type': 'application/json' });
        return r.end(JSON.stringify({ signedURL: `/object/sign/roteiro/${caminho}?token=abc` }));
      }
      if (q.method === 'POST') { balde.set(caminho, bruto); r.writeHead(200); return r.end('{}'); }
      if (q.method === 'DELETE') {
        if (quebrarApagar) { r.writeHead(500); return r.end('{"erro":"balde fora do ar"}'); }
        balde.delete(caminho); r.writeHead(200); return r.end('{}');
      }
    }
    const corpo = bruto.toString('utf8');
    const responde = (o) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(o)); };
    /* O `getUser` da sessão. Devolver um usuário aqui é o que faz o Next
       acreditar que há alguém logado, sem precisar do Supabase de verdade. */
    if (q.url.startsWith('/auth/v1/user')) {
      if (!QUEM) { r.writeHead(401, { 'Content-Type': 'application/json' }); return r.end('{"msg":"no session"}'); }
      return responde({ id: 'uuid-de-teste', aud: 'authenticated', email: QUEM, app_metadata: {}, user_metadata: {} });
    }
    const fn = q.url.replace('/rest/v1/rpc/', '');
    const args = JSON.parse(corpo || '{}');
    chamadas.push({ fn, args });
    if (fn === 'walkstamp_conta_do_usuario') return responde(CONTA || contaPaga());
    if (fn === 'walkstamp_roteiro_meus') {
      return responde({ email: args.p_email, roteiros: [
        { id: 7, nome: ROTEIRO_TIME.nome, escopo: 'time', dono: ROTEIRO_TIME.dono,
          criado_em: ROTEIRO_TIME.criado_em, meu: true, total: 2, feitos: 1, meus: 0 },
        { id: 9, nome: ROTEIRO_MEU.nome, escopo: 'personal', dono: ROTEIRO_MEU.dono,
          criado_em: ROTEIRO_MEU.criado_em, meu: true, total: 1, feitos: 0, meus: 0 },
      ] });
    }
    if (fn === 'walkstamp_roteiro_ver') return responde(args.p_id === 9 ? ROTEIRO_MEU : ROTEIRO_TIME);
    if (fn === 'walkstamp_roteiro_salvar') return responde({ ...ROTEIRO_TIME, id: 7, faxina: FILA.splice(0) });
    if (fn === 'walkstamp_roteiro_feito') return responde({ ...ROTEIRO_TIME, id: 7 });
    if (fn === 'walkstamp_roteiro_atribuir') return responde({ ...ROTEIRO_TIME, id: 7 });
    if (fn === 'walkstamp_roteiro_apagar') return responde({ roteiros: [], faxina: FILA.splice(0) });
    if (fn === 'walkstamp_anexo_faxinado') { FAXINADOS.push(args); return responde(1); }
    if (fn === 'walkstamp_roteiro_anexo') {
      /* Guardar o que a ação mandou é o que permite ao teste conferir DEPOIS
         que o caminho gravado é o mesmo que foi para o Storage. */
      ANEXO = args.p_caminho ? { nome: args.p_nome, bytes: args.p_bytes, caminho: args.p_caminho } : null;
      return responde({ ...ROTEIRO_TIME, id: 7 });
    }
    if (fn === 'walkstamp_roteiro_anexo_de') {
      return responde(ANEXO ? { caminho: ANEXO.caminho, nome: ANEXO.nome, bytes: ANEXO.bytes, caso: 'CT-01' }
                            : { erro: 'sem_anexo' });
    }
    responde({});
  });
});
await new Promise((r) => banco.listen(PORTA_BANCO, r));

/* -------------------------------------------------------------- o Next real */

const next = spawn('npx', ['next', 'start', '-p', String(PORTA_NEXT)], {
  cwd: `${RAIZ_WS}`,
  env: { ...process.env,
    SUPABASE_URL: `http://localhost:${PORTA_BANCO}`,
    SUPABASE_SERVICE_ROLE_KEY: 'chave_de_servico_de_mentira',
    // a sessão do servidor também aponta para o banco falso; só endereço
    // local é aceito por lá, e é por isso que isto não é uma porta aberta
    WALKSTAMP_SUPA_TESTE: `http://localhost:${PORTA_BANCO}`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logNext = '';
next.stdout.on('data', (d) => { logNext += d; });
next.stderr.on('data', (d) => { logNext += d; });

const morrer = () => { try { next.kill('SIGKILL'); } catch {} try { banco.close(); } catch {} };
process.on('exit', morrer);

for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`${BASE}/conta`); if (r.ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

const br = await chromium.launch({ executablePath: CHROME_WS });

/* O cookie de sessão que o `@supabase/ssr` lê. O conteúdo não precisa ser um
   JWT válido: quem valida é o `/auth/v1/user`, e ele é o nosso. */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (email) => [b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ role: 'authenticated', email, exp: Math.floor(Date.now() / 1000) + 3600 }), 'x'].join('.');
const projeto = 'localhost';

async function contexto(email) {
  QUEM = email;
  const ctx = await br.newContext({ acceptDownloads: true, viewport: { width: 1300, height: 1100 } });
  if (email) {
    const sess = { access_token: jwt(email), token_type: 'bearer', expires_in: 3600,
                   expires_at: Math.floor(Date.now() / 1000) + 3600,
                   refresh_token: 'r', user: { id: 'uuid-de-teste', email } };
    await ctx.addCookies([{
      name: `sb-${projeto}-auth-token`,
      value: 'base64-' + Buffer.from(JSON.stringify(sess)).toString('base64'),
      domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax',
    }]);
  }
  return ctx;
}

/* ------------------------------------------------------------------ provas */

console.log('[1] o endereço público existe nos três idiomas — DENTRO do painel');
{
  /* A tela deixou de ser página inteira e virou rota do painel, com a barra
     lateral em volta, como faturas e chamados. Antes, clicar em `Casos de
     teste` no menu fazia o menu SUMIR: a pessoa saía do painel sem ter pedido,
     e o caminho de volta era um link de texto que ela precisava achar.

     Como a casca do painel exige sessão, estes endereços agora se provam
     LOGADO — e é isso que o bloco [2] cobre do outro lado. */
  CONTA = contaPaga();
  for (const [caminho, titulo] of [['/conta/roteiro', 'Roteiro'], ['/en/account/cases', 'Test run'], ['/es/cuenta/casos', 'Guion']]) {
    const ctx = await contexto('chefe@teste-roteiro.example');
    const pg = await ctx.newPage();
    const r = await pg.goto(BASE + caminho);
    const html = await pg.content();
    ok(`${caminho} responde e está no idioma certo`,
       r.status() === 200 && html.includes(titulo), String(r.status()));
    /* A prova de que virou rota do painel, e não uma página que só mudou de
       endereço: a barra lateral está lá, e o item dela está marcado. */
    ok(`${caminho} tem a barra lateral em volta`,
       await pg.locator('.painelMenu').count() === 1);
    ok(`${caminho} marca o item do menu como o aberto`,
       await pg.locator('.painelMenu a[aria-current="page"]').getAttribute('href') === caminho,
       await pg.locator('.painelMenu a[aria-current="page"]').getAttribute('href'));
    /* Sem a ponte `beforeFiles` isto era um 404: /conta/roteiro casa com a rota
       dinâmica /conta/[lang] antes de qualquer reescrita ser consultada, e
       `lang="roteiro"` cai no `notFound()`. */
    ok(`${caminho} NÃO caiu na rota dinâmica /conta/[lang]`,
       !/404/.test(await pg.title()), await pg.title());
    await ctx.close();
  }
}

console.log('\n[2] deslogado: a tela FICA e explica o que ela faz');
{
  /* MUDOU DE PROMESSA, e vale registrar porque a antiga também tinha razão.
   *
   * Antes isto redirecionava para a raiz do painel: "quem sabe explicar é a
   * porta de entrada, e ter uma quarta cópia da tela de login aqui é ter uma
   * versão que um dia responde diferente das outras três". Continua verdade
   * sobre o FORMULÁRIO — e é por isso que ele continua morando num lugar só.
   *
   * O que mudou é o que se perdia no caminho: quem clica em "Roteiro" sem
   * conta era jogado numa caixa de e-mail sem nunca ter visto o que estava
   * comprando. Um recurso que a pessoa nunca viu não é desejado. Agora o
   * endereço fica de pé, com o menu em volta, dizendo o que o item faz e
   * levando a dois lugares: entrar, e os planos.
   *
   * O que este bloco cobra é que a saída CONTINUE existindo — a porta mudou de
   * forma, não pode ter sumido — e que nada que exigiria sessão apareça. */
  const ctx = await contexto(null);
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/conta/roteiro`);
  ok('o endereço fica de pé', new URL(pg.url()).pathname === '/conta/roteiro', pg.url());
  const txt = await pg.locator('body').innerText();
  ok('com o menu do painel em volta', await pg.locator('.painelMenu').count() === 1);
  ok('e dizendo o que este item faz', txt.length > 120, txt.slice(0, 70).replace(/\n/g, ' '));
  ok('a porta de entrada continua a um clique',
     await pg.locator('a[href="/conta"]').count() > 0, txt.slice(0, 90).replace(/\n/g, ' '));
  ok('e os planos também, que é o motivo de a tela ficar',
     await pg.locator('a[href*="preco"], a[href*="plan"], a[href*="prix"], a[href*="preis"]').count() > 0);
  ok('sem convidar para nada que não funcionaria', await pg.locator('input[type=file]').count() === 0);
  await ctx.close();
}
{
  /* A EXCEÇÃO, e ela tem motivo. Quem volta da ferramenta traz no endereço o
     nome do arquivo, a impressão das telas e o recibo — coisas que não existem
     em nenhum outro lugar. Redirecionar jogaria tudo fora, e recuperar seria
     gerar o documento de novo. Então o endereço fica de pé. */
  const ctx = await contexto(null);
  const pg = await ctx.newPage();
  const alvo = `${BASE}/conta/roteiro?id=7&marcar=11&arq=CT-01.pdf&imp=a1b2c3d4e5f6a7b8`;
  await pg.goto(alvo);
  ok('o endereço com ?marcar= NÃO é jogado fora',
     new URL(pg.url()).pathname === '/conta/roteiro'
     && new URL(pg.url()).searchParams.get('arq') === 'CT-01.pdf', pg.url());
  const txt = await pg.locator('body').innerText();
  ok('e a tela diz para guardar a aba', /aba/i.test(txt), txt.slice(0, 140).replace(/\n/g, ' '));
  ok('com a entrada abrindo em outra aba, para esta não se perder',
     await pg.locator('a[href="/conta"][target="_blank"]').count() > 0);
  await ctx.close();
}

console.log('\n[3] plano gratuito: porta, e não muro');
{
  CONTA = contaGratis();
  const ctx = await contexto('gratis@teste-roteiro.example');
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/conta/roteiro`);
  const txt = await pg.locator('body').innerText();
  ok('a tela existe e explica o recurso', txt.length > 120 && /plano|link|caso/i.test(txt));
  ok('e leva para os planos', await pg.locator('a[href="/precos"]').count() > 0);
  /* A regra da auditoria de fluxo: nada clicável que não possa dar em nada.
     Um campo de arquivo para quem não tem o recurso é exatamente isso. */
  ok('nenhum controle que não funcionaria para ele', await pg.locator('input[type=file]').count() === 0);
  ok('nem botão de salvar', await pg.locator('button:has-text("Salvar roteiro")').count() === 0);
  await ctx.close();
}

console.log('\n[4] pagante: personal e time em listas SEPARADAS');
let pg, ctx;
{
  CONTA = contaPaga();
  ctx = await contexto('chefe@teste-roteiro.example');
  pg = await ctx.newPage();
  await pg.goto(`${BASE}/conta/roteiro`);
  const txt = await pg.locator('body').innerText();
  ok('o grupo "meus" aparece', /Meus roteiros/i.test(txt), txt.slice(0, 60).replace(/\n/g, ' '));
  ok('o grupo "do time" aparece', /Do time/i.test(txt));
  /* O pedido literal era organizar o que vem de personal e o que vem de time.
     Os dois nomes na mesma lista, sem separação, é o que havia antes. */
  const meus = await pg.locator('h2:has-text("Meus roteiros")').count();
  const time = await pg.locator('h2:has-text("Do time")').count();
  ok('e são dois títulos, não um', meus === 1 && time === 1, `meus=${meus} time=${time}`);
  const posMeu = txt.indexOf('Minhas verificações');
  const posTime = txt.indexOf('Regressão de agosto');
  ok('cada roteiro está debaixo do seu grupo',
     posMeu > txt.indexOf('Meus roteiros') && posTime > txt.indexOf('Do time'),
     `meu=${posMeu} time=${posTime}`);
  ok('a contagem de feitos aparece', /1 de 2 feitos/.test(txt), (txt.match(/\d+ de \d+ feitos/) || [])[0]);
}

{
  /* A tabela de casos é a coisa mais larga do painel inteiro. Quando a tela
     virou rota do painel ela perdeu a largura de página cheia, e a coluna de
     ações passou a nascer CORTADA em toda visita, numa tela de 1300 — não por
     falta de espaço na janela, mas porque o `--max:940` do site, que existe
     para texto corrido, estava apertando uma tabela.

     A prova não é a largura em pixel (isso muda com fonte e com zoom): é que a
     caixa de rolagem NÃO precisa rolar. */
  await pg.goto(`${BASE}/conta/roteiro?id=7`, { waitUntil: 'networkidle' });
  const rolando = await pg.evaluate(() => {
    const cx = document.querySelector('.painelCorpo div[style*="auto"]');
    return cx ? { precisa: cx.scrollWidth > cx.clientWidth, cabe: cx.clientWidth, quer: cx.scrollWidth } : null;
  });
  ok('a tabela de casos cabe no painel, sem barra horizontal',
     rolando && !rolando.precisa, JSON.stringify(rolando));
}

console.log('\n[5] o link do caso é a ponte para a ferramenta');
{
  await pg.goto(`${BASE}/conta/roteiro?id=7`);
  const href = await pg.locator('table a[href^="/app?"]').first().getAttribute('href');
  const u = new URL(href, BASE);
  ok('leva para a ferramenta', u.pathname === '/app', u.pathname);
  ok('com o caso dentro', (u.searchParams.get('caso') || '').startsWith('CT-01'), u.searchParams.get('caso'));
  ok('com o sistema', u.searchParams.get('sistema') === 'Portal', u.searchParams.get('sistema'));
  ok('com o chamado', u.searchParams.get('chamado') === 'NAT-1234', u.searchParams.get('chamado'));
  ok('e com o número do caso, que é o que traz a volta', u.searchParams.get('rot') === '11', u.searchParams.get('rot'));
  /* O caso já feito não ganha link de execução: convidar a refazer o que está
     pronto é o caminho mais curto para duas evidências do mesmo caso. */
  const links = await pg.locator('table a[href^="/app?"]').count();
  ok('e o caso já feito não oferece link', links === 1, String(links));
}

console.log('\n[6] a ferramenta recebe o link e prepara a volta');
{
  /* O outro lado da ponte, medido no `app.html` de verdade: os campos entram, e
     o botão de voltar NÃO existe antes de haver documento. */
  const pgApp = await ctx.newPage();
  const erros = []; pgApp.on('pageerror', (e) => erros.push(e.message));
  await pgApp.route('**/rpc/**', (r) => r.fulfill({ status: 200, body: 'null' }));
  await pgApp.goto(`${BASE}/app?lang=pt&modelo=evidencia&caso=CT-01%20-%20Entrar&sistema=Portal&chamado=NAT-1234&rot=11`);
  await pgApp.waitForTimeout(1200);
  ok('o caso chegou preenchido', (await pgApp.inputValue('#evCaso')).startsWith('CT-01'), await pgApp.inputValue('#evCaso'));
  ok('o sistema chegou', (await pgApp.inputValue('#evSis')) === 'Portal');
  ok('o chamado chegou', (await pgApp.inputValue('#evChamado')) === 'NAT-1234');
  ok('a tela avisa de onde a pessoa veio', await pgApp.locator('#rotVindo').isVisible());
  ok('e o botão de "feito" ainda NÃO existe — não há documento',
     !(await pgApp.locator('#rotVolta').isVisible()));
  ok('sem erro de JS com o roteiro fora da página', erros.length === 0, erros.join(' | ').slice(0, 160));
  await pgApp.close();
}

console.log('\n[7] a volta grava por POST, nunca por GET');
{
  const antes = chamadas.length;
  await pg.goto(`${BASE}/conta/roteiro?marcar=11&arq=CT-01.pdf&imp=a1b2c3d4`);
  const gravou = chamadas.slice(antes).some((c) => c.fn === 'walkstamp_roteiro_feito');
  ok('abrir o endereço da volta NÃO grava nada', !gravou);
  const txt = await pg.locator('body').innerText();
  ok('mas mostra o que veio', txt.includes('CT-01.pdf'), txt.slice(0, 120).replace(/\n/g, ' '));
  ok('e pede confirmação', await pg.locator('button:has-text("Marcar como feito")').count() > 0);

  const antes2 = chamadas.length;
  await pg.locator('button:has-text("Marcar como feito")').click();
  await pg.waitForLoadState('networkidle');
  const c = chamadas.slice(antes2).find((x) => x.fn === 'walkstamp_roteiro_feito');
  ok('confirmar grava', !!c);
  ok('com o caso certo', !!c && c.args.p_caso_id === 11, c && String(c.args.p_caso_id));
  ok('com o arquivo e a impressão', !!c && c.args.p_arquivo === 'CT-01.pdf' && c.args.p_impressao === 'a1b2c3d4',
     c && `${c.args.p_arquivo} ${c.args.p_impressao}`);
  /* A regra que atravessa a área do cliente inteira. */
  ok('e com o e-mail DA SESSÃO, não do formulário',
     !!c && c.args.p_email === 'chefe@teste-roteiro.example', c && c.args.p_email);
}

console.log('\n[8] atribuir é do time, e o admin sai da sessão');
{
  await pg.goto(`${BASE}/conta/roteiro?id=7`);
  const antes = chamadas.length;
  await pg.locator('select[name="para"]').first().selectOption('ana@teste-roteiro.example');
  await pg.locator('button:has-text("Atribuir")').first().click();
  await pg.waitForLoadState('networkidle');
  const c = chamadas.slice(antes).find((x) => x.fn === 'walkstamp_roteiro_atribuir');
  ok('o pedido chegou', !!c);
  ok('com o admin da sessão', !!c && c.args.p_admin === 'chefe@teste-roteiro.example', c && c.args.p_admin);
  ok('e para quem foi escolhido', !!c && c.args.p_para === 'ana@teste-roteiro.example', c && c.args.p_para);

  /* No roteiro pessoal não há a quem atribuir: a coluna não existe. */
  await pg.goto(`${BASE}/conta/roteiro?id=9`);
  ok('no roteiro "só meu" não há coluna de responsável',
     await pg.locator('select[name="para"]').count() === 0);
}

console.log('\n[9] a planilha volta, e é xlsx de verdade');
{
  await pg.goto(`${BASE}/conta/roteiro?id=7`);
  const dl = pg.waitForEvent('download', { timeout: 20000 });
  await pg.locator('a:has-text("Baixar a planilha")').click();
  const arq = await dl;
  const destino = '/tmp/roteiro-volta.xlsx';
  await arq.saveAs(destino);
  ok('o clique baixou alguma coisa', fs.statSync(destino).size > 400, String(fs.statSync(destino).size));

  /* O nome do arquivo é conferido no cabeçalho, e não no que o Chromium
     resolveu chamar o download: o defeito que isto tranca é o acento cru num
     cabeçalho HTTP, que faz o navegador jogar o cabeçalho INTEIRO fora e salvar
     como "download", sem extensão — e ninguém descobre até receber a queixa. */
  const cab = await pg.request.get(`${BASE}/conta/planilha?id=7&lang=pt`);
  const cd = cab.headers()['content-disposition'] || '';
  ok('o cabeçalho manda o nome em ASCII', /filename="[\x20-\x7e]+\.xlsx"/.test(cd), cd);
  ok('e o nome de verdade em UTF-8', /filename\*=UTF-8''[^;]*\.xlsx/.test(cd), cd);
  ok('e o tipo é de planilha',
     (cab.headers()['content-type'] || '').includes('spreadsheetml'), cab.headers()['content-type']);

  /* Abrir com openpyxl, e não com o nosso próprio leitor: dois leitores da
     mesma casa concordam com o mesmo erro. O Excel é quem vai abrir isto. */
  const saida = execFileSync('python3', ['-c', `
import openpyxl, json
w = openpyxl.load_workbook(${JSON.stringify(destino)})
s = w.active
linhas = [[('' if c is None else str(c)) for c in l] for l in s.iter_rows(values_only=True)]
print(json.dumps({'cab': linhas[0], 'corpo': linhas[1:]}, ensure_ascii=False))
`]).toString();
  const p = JSON.parse(saida);
  ok('o openpyxl abriu', Array.isArray(p.corpo) && p.corpo.length === 2, String(p.corpo && p.corpo.length));
  ok('com o cabeçalho traduzido', p.cab.includes('Caso') && p.cab.includes('Situação'), p.cab.join('|'));
  ok('o caso feito veio marcado', p.corpo[1].includes('feito'), p.corpo[1].join('|'));
  ok('com a impressão digital junto', p.corpo[1].includes('a1b2c3d4e5f6a7b8'), p.corpo[1].join('|'));
  ok('e o caso não feito veio em branco na situação', p.corpo[0][5] === '', JSON.stringify(p.corpo[0]));

  /* Quem não pode ver não pode baixar — e a recusa vem do servidor, não da
     ausência do botão. */
  const semSessao = await br.newContext();
  QUEM = null;
  const r = await semSessao.request.get(`${BASE}/conta/planilha?id=7&lang=pt`);
  ok('e deslogado a planilha é recusada', r.status() === 401, String(r.status()));
  QUEM = 'chefe@teste-roteiro.example';
  await semSessao.close();
}

console.log('\n[10] a ferramenta não guarda mais roteiro nenhum');
{
  const app = fs.readFileSync(`${RAIZ_WS}/public/app.html`, 'utf8');
  for (const morto of ['rotBloco', 'abrirRoteiro', 'juntarRoteiros', 'marcarCasoDoRoteiro',
                       'xlsxParaLinhas', 'montarXlsx', 'ROTEIRO_CHAVE']) {
    ok(`"${morto}" saiu do app.html`, !app.includes(morto));
  }
  ok('e o que ficou é só a volta', app.includes('casoDoRoteiro') && app.includes('rotVolta'));
}

console.log('\n[11] a planilha entra: conferir antes de salvar');
{
  /* Uma planilha de VERDADE, escrita pelo openpyxl, com uma coluna vazia no
     meio — é a que quebra leitor ingênuo, porque o Excel não escreve a célula
     e quem conta na ordem desalinha tudo a partir dali. */
  execFileSync('python3', ['-c', `
import openpyxl
w = openpyxl.Workbook(); s = w.active
s.append(['Código', 'Descrição', '', 'Módulo', 'Ticket', 'Responsável'])
s.append(['CT-77', 'Abrir a fatura', '', 'Financeiro', 'FIN-9', 'ana@teste-roteiro.example'])
s.append(['CT-78', 'Baixar o PDF',  '', 'Financeiro', 'FIN-9', 'não é e-mail'])
w.save('/tmp/roteiro-entrada.xlsx')`]);

  await pg.goto(`${BASE}/conta/roteiro`);
  await pg.setInputFiles('input[type=file]', '/tmp/roteiro-entrada.xlsx');
  await pg.locator('button:has-text("Ler a planilha")').click();
  await pg.waitForSelector('text=Confira o que foi entendido', { timeout: 20000 });

  const conf = pg.locator('table.legal').last();
  const txt = await conf.innerText();
  ok('as duas linhas apareceram', /CT-77/.test(txt) && /CT-78/.test(txt), txt.slice(0, 80).replace(/\n/g, ' '));
  ok('a coluna vazia no meio não desalinhou', /Financeiro/.test(txt) && /FIN-9/.test(txt));
  /* Só e-mail vira responsável: "não é e-mail" atribuiria o caso a ninguém e o
     banco recusaria a linha inteira. */
  ok('e o que não é e-mail não vira responsável', !/não é e-mail/.test(txt));

  /* Trocar a coluna no menu muda a tabela na hora — é a razão inteira de esta
     parte ter JavaScript. */
  /* Os menus do mapa são os únicos `select` sem `name` — o do escopo tem, e o
     de atribuir responsável mora na tabela do roteiro aberto, lá em cima. */
  const mapa = pg.locator('.card').last().locator('select:not([name])');
  await mapa.first().selectOption({ label: 'Descrição' });
  await pg.waitForTimeout(300);
  ok('trocar a coluna do caso muda o que vai ser salvo',
     /Abrir a fatura/.test(await conf.innerText()));
  await mapa.first().selectOption({ label: 'Código' });
  await pg.waitForTimeout(300);

  const antes = chamadas.length;
  await pg.locator('input[name="nome"]').fill('Financeiro agosto');
  await pg.locator('button:has-text("Salvar roteiro")').click();
  await pg.waitForURL(/[?&](feito|erro)=/, { timeout: 20000 });
  const c = chamadas.slice(antes).find((x) => x.fn === 'walkstamp_roteiro_salvar');
  ok('o roteiro foi salvo', !!c);
  ok('com o nome que a pessoa deu', !!c && c.args.p_nome === 'Financeiro agosto', c && c.args.p_nome);
  ok('com o e-mail da sessão', !!c && c.args.p_email === 'chefe@teste-roteiro.example', c && c.args.p_email);
  ok('com os dois casos', !!c && c.args.p_casos.length === 2, c && String(c.args.p_casos.length));
  ok('com os campos no lugar certo',
     !!c && c.args.p_casos[0].caso === 'CT-77' && c.args.p_casos[0].sistema === 'Financeiro'
         && c.args.p_casos[0].chamado === 'FIN-9',
     c && JSON.stringify(c.args.p_casos[0]));
  ok('e o responsável só quando é e-mail',
     !!c && c.args.p_casos[0].responsavel === 'ana@teste-roteiro.example' && c.args.p_casos[1].responsavel === '',
     c && JSON.stringify(c.args.p_casos.map((x) => x.responsavel)));

  /* A planilha entrou e foi embora: o que atravessa é a lista de campos, e
     nunca o arquivo. É a promessa da política de privacidade, medida. */
  ok('e o arquivo NÃO foi junto para o servidor',
     !!c && !JSON.stringify(c.args).includes('PK') && !('arquivo' in c.args));

  /* O recado de sucesso volta em `?feito=`, e a volta do caso vem em
     `?marcar=`. Se fossem o mesmo nome, salvar um roteiro abriria a caixa de
     "você voltou de um caso" com um caso que não existe. */
  ok('e o recado de sucesso não é confundido com a volta de um caso',
     /[?&]feito=/.test(pg.url()) &&
     (await pg.locator('body').innerText()).indexOf('Você voltou de um caso') < 0,
     pg.url());
}

console.log('\n[12] o recibo: viaja no link, e não leva imagem nenhuma');
{
  /* O recibo é montado na FERRAMENTA de verdade, com quadros de verdade. Um
     recibo escrito à mão aqui provaria que sei escrever JSON, e não que a
     ferramenta manda o que diz mandar. */
  const app = await ctx.newPage();
  const erros = []; app.on('pageerror', (e) => erros.push(e.message));
  const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`, 'utf8');
  await app.route('**/jspdf**', (r) => r.fulfill({ status: 200, headers: { 'content-type': 'text/javascript' }, body: jspdf }));
  await app.route('**/rpc/**', (r) => r.fulfill({ status: 200, body: 'null' }));
  await app.goto(`${BASE}/app?lang=pt&modelo=evidencia&caso=CT-01&sistema=Portal&chamado=NAT-1234&rot=11`);
  await app.waitForTimeout(800);
  await app.selectOption('#modelo', 'evidencia');
  await app.setInputFiles('#file', '/tmp/amostra.webm');
  await app.waitForTimeout(2600);
  await app.selectOption('#mode', 'count');
  /* Se `#count` não aparecer, a causa quase sempre é a mesma e é grave: o
     script da página não rodou. Uma `const` declarada duas vezes derruba o
     arquivo inteiro antes da primeira linha — foi assim que este teste pegou o
     `b64url` repetido. Por isso o erro de JS é dito aqui, e não só no fim. */
  await app.waitForSelector('#count', { state: 'visible', timeout: 15000 }).catch(() => {
    ok('a ferramenta carregou sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 160));
  });
  await app.fill('#count', '3');
  await app.locator('#extract').click();
  await app.waitForFunction(() => document.querySelectorAll('#thumbs figure').length >= 3, null, { timeout: 40000 });
  const dl = app.waitForEvent('download', { timeout: 30000 });
  await app.locator('#md').click();
  await dl;
  await app.waitForSelector('#rotVolta a', { timeout: 20000 });

  const href = await app.locator('#rotVolta a').getAttribute('href');
  const u = new URL(href);
  const rec = u.searchParams.get('rec');
  ok('o link da volta leva o recibo', !!rec, href.slice(0, 90));
  ok('e o endereço não fica absurdo', href.length < 7500, String(href.length));

  /* Abrir o recibo com o zlib, do lado de fora: é o mesmo que o servidor faz, e
     é a única forma de afirmar o que está lá dentro. */
  const zlib = await import('node:zlib');
  const aberto = JSON.parse(zlib.gunzipSync(Buffer.from(rec.replace(/-/g, '+').replace(/_/g, '/'), 'base64')).toString());
  ok('com o caso dentro', aberto.caso === 'CT-01', aberto.caso);
  ok('com o sistema e o chamado', aberto.sis === 'Portal' && aberto.cha === 'NAT-1234');
  ok('com os três quadros', aberto.n === 3, String(aberto.n));
  ok('e com a impressão de CADA quadro', Array.isArray(aberto.h) && aberto.h.length === 3,
     JSON.stringify(aberto.h || []).slice(0, 60));
  ok('as impressões são hash de verdade, não texto',
     (aberto.h || []).every((x) => /^[0-9a-f]{64}$/.test(x)), (aberto.h || [])[0]);
  ok('e o formato do documento gerado', aberto.fmt === 'md', aberto.fmt);

  /* A pergunta que dá o nome ao recurso: o que saiu do navegador. */
  const cru = JSON.stringify(aberto);
  ok('NENHUMA imagem viajou', !/data:image|base64|iVBOR|\/9j\//.test(cru));
  ok('nenhuma transcrição viajou', !/\bWEBVTT\b|-->/.test(cru));
  ok('e o recibo inteiro é pequeno', cru.length < 4000, String(cru.length) + ' bytes abertos');
  ok('sem erro de JS no caminho', erros.length === 0, erros.join(' | ').slice(0, 140));

  /* E do lado de cá: o servidor abre o mesmo recibo e o grava. */
  const antes = chamadas.length;
  await pg.goto(BASE + u.pathname + u.search);
  const txt = await pg.locator('body').innerText();
  ok('a tela mostra o recibo ANTES de gravar', /Recibo/.test(txt) && /3 quadros/.test(txt),
     (txt.match(/Recibo[^\n]*/) || [])[0]);
  ok('e abrir o endereço ainda não grava nada',
     !chamadas.slice(antes).some((c) => c.fn === 'walkstamp_roteiro_feito'));

  await pg.locator('button:has-text("Marcar como feito")').click();
  await pg.waitForURL(/[?&](feito|erro)=/, { timeout: 20000 });
  const c = chamadas.filter((x) => x.fn === 'walkstamp_roteiro_feito').pop();
  ok('confirmar grava o recibo junto', !!c && !!c.args.p_recibo);
  ok('com as três impressões', !!c && (c.args.p_recibo.h || []).length === 3);
  ok('e sem nenhum campo que a gente não pediu',
     !!c && Object.keys(c.args.p_recibo).every((k) =>
       ['g','v','em','cen','idi','caso','sis','cha','quem','res','amb','ini','n','imp','arq','fmt','h','h_omitidos'].includes(k)),
     !!c && Object.keys(c.args.p_recibo).join(','));
  await app.close();
}

console.log('\n[13] o recibo é entrada de fora, e é tratado como tal');
{
  const zlib = await import('node:zlib');
  const enc = (o) => zlib.gzipSync(Buffer.from(JSON.stringify(o))).toString('base64url');

  /* Campo que a gente não pediu não entra no banco. */
  const antes = chamadas.length;
  await pg.goto(`${BASE}/conta/roteiro?marcar=11&rec=` +
    encodeURIComponent(enc({ imp: 'abc', h: ['aa'], texto_do_passo: 'clicou em salvar', img: 'data:image/png;base64,AAA' })));
  await pg.locator('button:has-text("Marcar como feito")').click();
  await pg.waitForURL(/[?&](feito|erro)=/, { timeout: 20000 });
  const c = chamadas.slice(antes).filter((x) => x.fn === 'walkstamp_roteiro_feito').pop();
  ok('o campo intruso foi jogado fora', !!c && !('texto_do_passo' in c.args.p_recibo) && !('img' in c.args.p_recibo),
     !!c && Object.keys(c.args.p_recibo).join(','));

  /* Um "hash" que é uma frase é ou defeito nosso ou alguém escrevendo o que
     quiser num campo que a tela mostra. */
  const antes2 = chamadas.length;
  await pg.goto(`${BASE}/conta/roteiro?marcar=11&rec=` +
    encodeURIComponent(enc({ imp: 'abc', h: ['aa11', '<script>alerta</script>', 'bb22'] })));
  await pg.locator('button:has-text("Marcar como feito")').click();
  await pg.waitForURL(/[?&](feito|erro)=/, { timeout: 20000 });
  const c2 = chamadas.slice(antes2).filter((x) => x.fn === 'walkstamp_roteiro_feito').pop();
  ok('só hexadecimal sobrevive na lista de impressões',
     !!c2 && c2.args.p_recibo.h.length === 2, !!c2 && JSON.stringify(c2.args.p_recibo.h));

  /* A bomba: um recibo que descomprime para trinta megabytes. Sem o teto, isto
     derruba o processo — é o ataque mais barato contra quem descomprime
     entrada de fora, e ele tem nome. */
  const bomba = zlib.gzipSync(Buffer.alloc(30 * 1024 * 1024, 'a')).toString('base64url');
  const antes3 = chamadas.length;
  const resp = await pg.request.post(`${BASE}/conta/roteiro`, { failOnStatusCode: false }).catch(() => null);
  await pg.goto(`${BASE}/conta/roteiro?marcar=11&rec=` + encodeURIComponent(bomba.slice(0, 11000)));
  ok('a página aguenta um recibo-bomba e continua respondendo',
     (await pg.locator('body').innerText()).length > 50);
  await pg.locator('button:has-text("Marcar como feito")').click();
  await pg.waitForURL(/[?&](feito|erro)=/, { timeout: 20000 });
  const c3 = chamadas.slice(antes3).filter((x) => x.fn === 'walkstamp_roteiro_feito').pop();
  ok('e ela grava o caso SEM recibo, em vez de recusar o trabalho',
     !!c3 && c3.args.p_recibo === null, !!c3 && JSON.stringify(c3.args.p_recibo).slice(0, 60));
  void resp;
}

console.log('\n[14] o anexo: só se a pessoa escolher, e some quando ela mandar');
{
  /* Um `.json` de sessão com uma imagem dentro — é exatamente o que a
     ferramenta baixa, e é o que a política diz que só sobe por escolha. */
  const sessao = JSON.stringify({ gerador: 'Walkstamp', v: 1,
    passos: [{ n: 1, t: 1.2, img: 'data:image/jpeg;base64,' + 'A'.repeat(2000) }] });
  fs.writeFileSync('/tmp/sessao-de-teste.json', sessao);

  await pg.goto(`${BASE}/conta/roteiro?marcar=11&arq=CT-01.pdf&imp=abc123`);
  const bytesAntes = balde.size;
  ok('o campo do anexo existe, e vem fechado',
     await pg.locator('input[name="anexo"]').count() === 1 &&
     !(await pg.locator('input[name="anexo"]').isVisible()));
  const aviso = await pg.locator('summary:has-text("Anexar")').innerText();
  ok('e o rótulo diz que é opcional', /opcional/i.test(aviso), aviso);

  /* Sem escolher arquivo, nada sobe. É o caminho normal. */
  await pg.locator('button:has-text("Marcar como feito")').click();
  await pg.waitForURL(/[?&](feito|erro)=/, { timeout: 20000 });
  ok('marcar sem anexar não põe arquivo nenhum no servidor', balde.size === bytesAntes,
     `${balde.size} vs ${bytesAntes}`);

  /* Agora escolhendo. */
  await pg.goto(`${BASE}/conta/roteiro?marcar=11&arq=CT-01.pdf&imp=abc123`);
  await pg.locator('details:has(input[name="anexo"])').evaluate((d) => { d.open = true; });
  const avisoTxt = await pg.locator('details:has(input[name="anexo"]) p').innerText();
  ok('o aviso diz que o arquivo tem IMAGEM dentro', /IMAGENS|imagens/.test(avisoTxt), avisoTxt.slice(0, 70));
  ok('e diz que dá para apagar depois', /apagá-lo|apagar/i.test(avisoTxt));
  await pg.setInputFiles('input[name="anexo"]', '/tmp/sessao-de-teste.json');
  await pg.locator('button:has-text("Marcar como feito")').click();
  await pg.waitForURL(/[?&](feito|erro)=/, { timeout: 20000 });

  ok('o arquivo subiu', balde.size === bytesAntes + 1, String(balde.size));
  const [caminho, corpo] = [...balde.entries()].pop();
  ok('e é o arquivo que a pessoa escolheu, byte a byte', corpo.toString('utf8') === sessao);
  ok('guardado debaixo do número do caso', caminho.startsWith('11/'), caminho);
  const c = chamadas.filter((x) => x.fn === 'walkstamp_roteiro_anexo').pop();
  ok('e o banco anotou nome e tamanho', !!c && c.args.p_nome === 'sessao-de-teste.json' &&
     c.args.p_bytes === Buffer.byteLength(sessao), !!c && `${c.args.p_nome} ${c.args.p_bytes}`);
  ok('com o e-mail da sessão', !!c && c.args.p_email === 'chefe@teste-roteiro.example');

  /* O caminho do arquivo nunca aparece na tela — quem baixa passa pelo servidor. */
  const html = await pg.content();
  ok('o caminho no balde NÃO vaza para o HTML', !html.includes(caminho), caminho);
  ok('e o botão de baixar aponta para a nossa porta',
     await pg.locator('a[href^="/conta/anexo?caso="]').count() > 0);

  /* Baixar: o servidor assina e redireciona; deslogado, recusa. */
  const semSessao = await br.newContext();
  QUEM = null;
  const r = await semSessao.request.get(`${BASE}/conta/anexo?caso=12&lang=pt`, { maxRedirects: 0 });
  ok('deslogado o anexo é recusado', r.status() === 401, String(r.status()));
  QUEM = 'chefe@teste-roteiro.example';
  await semSessao.close();

  const rr = await pg.request.get(`${BASE}/conta/anexo?caso=12&lang=pt`, { maxRedirects: 0 });
  ok('logado, vem um endereço assinado e temporário',
     rr.status() === 303 && /token=/.test(rr.headers().location || ''), `${rr.status()} ${rr.headers().location}`);

  /* Apagar apaga o ARQUIVO, e não só a linha. Foi a coisa que a política
     prometeu com todas as letras. */
  await pg.goto(`${BASE}/conta/roteiro?id=7`);
  await pg.locator('button:has-text("Apagar anexo")').first().click();
  await pg.waitForURL(/[?&](feito|erro)=/, { timeout: 20000 });
  ok('apagar tira o arquivo do balde, não só o registro', !balde.has(caminho),
     [...balde.keys()].join(','));
  const ca = chamadas.filter((x) => x.fn === 'walkstamp_roteiro_anexo').pop();
  ok('e limpa a linha depois', !!ca && ca.args.p_caminho === null);
}

console.log('\n[15] o que o site promete continua verdade');
{
  /* A frase mais forte do site é a da página de segurança, e ela é a primeira
     coisa que uma feature nova torna mentira sem ninguém perceber. */
  const seg = fs.readFileSync(`${RAIZ_WS}/src/site/bodies/seguranca.pt.html`, 'utf8');
  ok('a página de segurança não diz mais "não há conta"', !/não há conta/.test(seg));
  ok('e explica a exceção do anexo', /única exceção/i.test(seg) && /\.json/.test(seg));
  ok('mantendo o que continua verdade: vídeo e áudio nunca saem',
     /vídeo e o áudio continuam nunca saindo/.test(seg));
  const pol = fs.readFileSync(`${RAIZ_WS}/src/site/bodies/privacidade.pt.html`, 'utf8');
  ok('a política descreve o recibo', /recibo/i.test(pol));
  ok('e o anexo, com o botão de apagar', /apagar anexo/i.test(pol));
  const pre = fs.readFileSync(`${RAIZ_WS}/src/site/bodies/precos.pt.html`, 'utf8');
  ok('a página de preços não promete mais o que deixou de ser verdade',
     !/não recebemos vídeo, áudio nem documento em/.test(pre));
}

console.log('\n[16] nada de arquivo órfão no balde');
{
  /* O defeito que isto tranca, e que existiu de verdade por uma hora: apagar um
     roteiro apagava as linhas por cascata e DEIXAVA os arquivos no balde —
     conteúdo de cliente guardado sem nada apontando para ele, invisível na tela
     e impossível de apagar pela tela. É exatamente a frase que a política de
     privacidade promete: "apagar apaga o arquivo, não só a linha". */
  balde.set('roteiro/11/velho.json', Buffer.from('{"quadros":"..."}'));
  balde.set('roteiro/12/velho2.json', Buffer.from('{"quadros":"..."}'));
  FAXINADOS.length = 0;

  FILA.push({ id: 501, caminho: 'roteiro/11/velho.json' },
            { id: 502, caminho: 'roteiro/12/velho2.json' });
  await pg.goto(`${BASE}/conta/roteiro?id=7`);
  await pg.locator('button:has-text("Apagar roteiro")').click();
  await pg.waitForURL(/[?&](feito|erro)=/, { timeout: 20000 });

  ok('apagar o roteiro tirou os arquivos do balde',
     !balde.has('roteiro/11/velho.json') && !balde.has('roteiro/12/velho2.json'),
     [...balde.keys()].join(','));
  const limpos = FAXINADOS.filter((f) => f.p_erro === null).flatMap((f) => f.p_ids);
  ok('e avisou o banco de que a fila foi drenada',
     limpos.includes(501) && limpos.includes(502), JSON.stringify(FAXINADOS));

  /* O reenvio da planilha: o caso que sumiu leva o anexo dele junto. */
  balde.set('roteiro/13/some.json', Buffer.from('{}'));
  FILA.push({ id: 503, caminho: 'roteiro/13/some.json' });
  FAXINADOS.length = 0;
  await pg.goto(`${BASE}/conta/roteiro`);
  await pg.setInputFiles('input[type=file]', '/tmp/roteiro-entrada.xlsx');
  await pg.locator('button:has-text("Ler a planilha")').click();
  await pg.waitForSelector('text=Confira o que foi entendido', { timeout: 20000 });
  await pg.locator('button:has-text("Salvar roteiro")').click();
  await pg.waitForURL(/[?&](feito|erro)=/, { timeout: 20000 });
  ok('reenviar a planilha sem um caso apaga o arquivo dele',
     !balde.has('roteiro/13/some.json'), [...balde.keys()].join(','));

  /* E o que não deu para apagar NÃO é dado por apagado: a fila conta a
     tentativa e tenta de novo depois. Uma fila que apaga o que falhou mente. */
  FILA.push({ id: 504, caminho: 'roteiro/14/quebra.json' });
  FAXINADOS.length = 0;
  quebrarApagar = true;
  await pg.goto(`${BASE}/conta/roteiro?id=7`);
  await pg.locator('button:has-text("Apagar roteiro")').click();
  await pg.waitForURL(/[?&](feito|erro)=/, { timeout: 20000 });
  quebrarApagar = false;
  const falhos = FAXINADOS.filter((f) => f.p_erro);
  ok('quando o balde recusa, a fila guarda o motivo em vez de esquecer',
     falhos.length === 1 && falhos[0].p_ids.includes(504), JSON.stringify(FAXINADOS));
  ok('e não declara faxinado o que não foi',
     !FAXINADOS.some((f) => f.p_erro === null && f.p_ids.includes(504)));
}

await br.close();
morrer();
if (falhas) console.log('\n--- últimas linhas do Next ---\n' + logNext.slice(-1500));
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nRoteiro de casos: tudo passou.');
process.exit(falhas ? 1 : 0);
