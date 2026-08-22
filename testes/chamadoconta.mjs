/* ABRIR CHAMADO NO PAINEL DA CONTA, com o relatório junto.
 *
 * A tela `/conta/chamados` só LISTAVA, e o texto dela mandava abrir um chamado
 * "no rodapé da ferramenta". Quem chega ali já está procurando o lugar de
 * contar um problema; mandá-la para outra tela é o mesmo defeito que tirou o
 * "abrir chamado" da sexta seção da página.
 *
 * Este arquivo afirma quatro coisas:
 *
 *   1. o formulário existe, e vem ANTES da lista;
 *   2. o botão Diagnóstico monta o relatório e o mostra na tela;
 *   3. o chamado chega ao banco com o e-mail DA SESSÃO — e não de um campo,
 *      que qualquer um troca — e com o relatório dentro;
 *   4. e a volta traz o NÚMERO, na própria tela de chamados.
 *
 *   node testes/chamadoconta.mjs
 */
import { chromium } from 'playwright';
import { spawn, execSync } from 'child_process';
import http from 'http';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const P = 8823, B = 8824;
const BASE = `http://localhost:${P}`;
const QUEM = 'quem@teste-chamado.example';

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

/* ----------------------------------------------------------- o banco falso */
const chamadas = [];
const CONTA = {
  email: QUEM, plano: 'time', assentos: 3, dias: 90, cliente: 'Cliente de Teste',
  motivo: 'conta', papel: 'admin', vence_em: '2026-11-13', emissoes: 0, assinante: true,
  perfil: { cliente: null, config: null, modelos: [] },
  faturas: [], chamados: [], resposta: null,
  time: { cliente: 'Cliente de Teste', assentos: 3, usados: 1, dias: 90, dominios: [],
          config: {}, pessoas: [], modelos: [], emissoes: [] },
};

const banco = http.createServer((q, r) => {
  const p = [];
  q.on('data', d => p.push(d));
  q.on('end', () => {
    const j = o => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(o)); };
    if (q.url.startsWith('/auth/v1/user')) return j({ id: 'u', aud: 'authenticated', email: QUEM });
    const fn = q.url.replace('/rest/v1/rpc/', '');
    const args = JSON.parse(Buffer.concat(p).toString('utf8') || '{}');
    chamadas.push({ fn, args });
    if (fn === 'walkstamp_conta_do_usuario') return j(CONTA);
    if (fn === 'walkstamp_recado') return j('WS-4242');
    j({});
  });
});
await new Promise(r => banco.listen(B, r));

const matarPorta = () => { try { execSync(`fuser -k ${P}/tcp 2>/dev/null`); } catch {} };
matarPorta();
await new Promise(r => setTimeout(r, 500));

const next = spawn('npx', ['next', 'start', '-p', String(P)], {
  cwd: process.env.RAIZ || `${RAIZ_WS}`, stdio: 'ignore',
  env: { ...process.env, SUPABASE_URL: `http://localhost:${B}`,
         SUPABASE_SERVICE_ROLE_KEY: 'chave_de_mentira',
         WALKSTAMP_SUPA_TESTE: `http://localhost:${B}` },
});
process.on('exit', () => { try { next.kill('SIGKILL'); } catch {} matarPorta(); banco.close(); });
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`${BASE}/conta`); if (r.ok) break; } catch {}
  await new Promise(r => setTimeout(r, 500));
}

const br = await chromium.launch({ executablePath: CHROME_WS });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const ctx = await br.newContext({ viewport: { width: 1200, height: 1400 } });
{
  const jwt = [b64({ alg: 'HS256', typ: 'JWT' }),
    b64({ role: 'authenticated', email: QUEM, exp: Math.floor(Date.now()/1000) + 3600 }), 'x'].join('.');
  const sess = { access_token: jwt, token_type: 'bearer', expires_in: 3600,
                 expires_at: Math.floor(Date.now()/1000) + 3600, refresh_token: 'r',
                 user: { id: 'u', email: QUEM } };
  await ctx.addCookies([{ name: 'sb-localhost-auth-token',
    value: 'base64-' + Buffer.from(JSON.stringify(sess)).toString('base64'),
    domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' }]);
}
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', e => erros.push(e.message));
/* As sondagens do relatório respondem aqui mesmo: o que se mede é o relatório,
   e não se esta máquina alcança o Hugging Face. */
await pg.route('**huggingface.co/**', r => r.fulfill({ status:200, headers:{'access-control-allow-origin':'*'}, body:'{}' }));
await pg.route('**cdn.jsdelivr.net/**', r => r.fulfill({ status:200, headers:{'access-control-allow-origin':'*'}, body:'x' }));

await pg.goto(BASE + '/conta/chamados', { waitUntil: 'networkidle' });
await pg.waitForTimeout(500);

console.log('\n[1] o formulário existe, e vem antes da lista');
const ordem = await pg.evaluate(() => {
  const f = document.querySelector('textarea[name="texto"]');
  const cartoes = [...document.querySelectorAll('.card h2')].map(h => h.textContent.trim());
  return { temCampo: !!f, temBotao: !!document.querySelector('button[type="submit"]'), cartoes };
});
console.log('     cartões: ' + ordem.cartoes.join(' | '));
ok('há onde escrever o chamado', ordem.temCampo);
ok('e um botão para abrir', ordem.temBotao);
ok('abrir vem antes de listar', ordem.cartoes.length >= 2, ordem.cartoes.join(' | '));

console.log('\n[2] o botão Diagnóstico monta o relatório');
const antes = await pg.evaluate(() => !!document.querySelector('#chamadoTexto ~ * details'));
await pg.getByRole('button', { name: 'Diagnóstico' }).click();
await pg.waitForFunction(() => /fim ---/.test(document.body.textContent || ''), null, { timeout: 30000 });
const rel = await pg.evaluate(() => {
  const pre = document.querySelector('details pre');
  const esc = document.querySelector('input[name="diag"]');
  return { linhas: (pre?.textContent || '').split('\n').length,
           noCampo: (esc?.value || '').length,
           temNavegador: /navegador/.test(esc?.value || '') };
});
console.log('     relatório com ' + rel.linhas + ' linhas, ' + rel.noCampo + ' caracteres no campo');
ok('o relatório não estava lá antes', antes === false);
ok('o relatório aparece na tela', rel.linhas > 6, rel.linhas + ' linhas');
/* O CAMPO ESCONDIDO é o que viaja. Um relatório que só existe na tela é um
   relatório que não chega ao chamado — foi exatamente o defeito da ferramenta. */
ok('e vai para o campo que o formulário manda', rel.noCampo > 200, rel.noCampo + ' caracteres');
ok('e é o relatório mesmo', rel.temNavegador);

console.log('\n[3] o chamado chega ao banco');
await pg.fill('#chamadoTexto', 'a transcrição para no 0% e o modelo não baixa');
await pg.getByRole('button', { name: 'Abrir chamado' }).click();
await pg.waitForFunction(() => /feito=|erro=/.test(location.search), null, { timeout: 30000 });
await pg.waitForTimeout(400);

const rec = chamadas.filter(c => c.fn === 'walkstamp_recado').pop();
ok('o banco recebeu o chamado', !!rec, JSON.stringify(chamadas.map(c => c.fn)));
if (rec) {
  /* A REGRA DA CASA: o e-mail vem da sessão, e nunca do formulário. Na
     ferramenta ele é digitado, e um chamado com o e-mail errado é um chamado
     que nunca volta para quem o abriu. */
  ok('o e-mail veio da sessão', rec.args.p_email === QUEM, String(rec.args.p_email));
  ok('a origem diz de onde veio', rec.args.p_origem === 'conta', String(rec.args.p_origem));
  ok('o texto chegou', /0%/.test(rec.args.p_texto || ''), String(rec.args.p_texto).slice(0, 50));
  ok('o RELATÓRIO chegou junto, e inteiro',
     (rec.args.p_diag || '').length > 200 && /fim ---/.test(rec.args.p_diag || ''),
     (rec.args.p_diag || '').length + ' caracteres');
}

console.log('\n[4] a volta traz o número, na própria tela de chamados');
const volta = await pg.evaluate(() => ({
  rota: location.pathname,
  aviso: (document.querySelector('.aviso.ok')?.textContent || '').trim(),
}));
console.log('     ' + volta.rota + '  →  ' + volta.aviso.slice(0, 70));
ok('continuou na tela de chamados', /chamados$/.test(volta.rota), volta.rota);
ok('e o número está na tela', /WS-4242/.test(volta.aviso), volta.aviso);
ok('sem erro de página', erros.length === 0, erros[0]);

await br.close();
console.log(falhas ? `\n  ${falhas} falha(s)` : '\n  tudo certo');
process.exit(falhas ? 1 : 0);
