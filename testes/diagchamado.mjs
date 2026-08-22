/* O DIAGNÓSTICO NO CHAMADO — que ele exista, e que ele CHEGUE.
 *
 * O relato foi "o botão de diagnóstico não está ativo". Ele estava: tinha
 * deixado de ser botão e virado o anexo do recado. O que NÃO estava ativo era
 * o anexo — e isso não se via na tela, se via no banco.
 *
 * A coleta é assíncrona e leva de 1 s (rede boa) a mais de 10 s (rede ruim,
 * que é a máquina de quem está reclamando). O botão Enviar não esperava por
 * ela: partia com o texto de espera no lugar do relatório. No banco de
 * produção, o chamado WS-0005 chegou com `diagnostico = "…"`, um caractere.
 *
 * Este arquivo afirma três coisas:
 *
 *   1. o botão existe no painel de chamados, e o relatório aparece ali;
 *   2. quem aperta Enviar DEPRESSA continua mandando o relatório inteiro —
 *      é a afirmação que pega o defeito, e ela falha sem o conserto;
 *   3. desmarcar a caixa continua mandando o chamado sem relatório e SEM
 *      espera — a espera é o preço de uma promessa, não uma trava.
 *
 *   node testes/diagchamado.mjs
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';

import { CHROME_WS } from './_caminhos.mjs';
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'public');
const CHROME = process.env.CHROME || CHROME_WS;
const T = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png',
           '.svg':'image/svg+xml','.ico':'image/x-icon','.webmanifest':'application/json'};
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end(''); }
  const u = q.url.split('?')[0], f = path.join(RAIZ, u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'}); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(8961, r));

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const br = await chromium.launch({ executablePath: CHROME });

/* A REDE LENTA É O CENÁRIO, e não um detalhe do teste: com a rede boa a coleta
   termina antes de qualquer clique humano e o defeito não aparece. Ele é de
   quem está com problema — que é exatamente quem abre chamado. */
const LENTO = 2500;

async function abrir({ lentidao, comSessao }) {
  const pg = await br.newPage();
  if (comSessao) await semearSessao(pg);
  const erros = []; pg.on('pageerror', e => erros.push(e.message));
  const enviados = [];
  /* As sondagens do diagnóstico, atrasadas de propósito. */
  const devagar = async (rota) => {
    if (lentidao) await new Promise(r => setTimeout(r, lentidao));
    return rota.fulfill({ status:200, headers:{'access-control-allow-origin':'*'}, body:'{}' });
  };
  await pg.route('**huggingface.co/**', devagar);
  /* SÓ a biblioteca do modelo, e não o jsdelivr inteiro: o jsPDF vem do mesmo
     CDN por uma tag <script> comum, e devolver um módulo ES para ela produz
     "Unexpected token 'export'" — um erro de página que não é do produto. */
  await pg.route('**@huggingface/transformers**', r => r.fulfill({ status:200,
    headers:{'access-control-allow-origin':'*','content-type':'text/javascript'},
    body:'export const env={allowLocalModels:true,allowRemoteModels:true,backends:{onnx:{wasm:{}}}};export async function pipeline(){}' }));
  /* O recado: guardamos o que o navegador MANDOU, que é a única pergunta. */
  await pg.route('**/rpc/walkstamp_recado', async r => {
    enviados.push(JSON.parse(r.request().postData() || '{}'));
    await r.fulfill({ status:200, headers:{'access-control-allow-origin':'*'}, body:'"WS-9999"' });
  });
  await pg.route('**/functions/v1/walkstamp-meus', r => r.fulfill({ status:200,
    headers:{'access-control-allow-origin':'*'}, body: JSON.stringify({ chamados: [], perfil: null }) }));
  await pg.route('**/rpc/*stamp_ev*', r => r.fulfill({ status:200, headers:{'access-control-allow-origin':'*'}, body:'null' }));
  await pg.goto('http://localhost:8961/app.html?lang=pt');
  await pg.waitForTimeout(400);
  /* A caixa da licença nasce fechada e é aberta pelo link do e-mail ou pelo
     botão. Aqui ela é aberta pelo BOTÃO, que é o gesto de quem já entrou. */
  if (comSessao) await pg.evaluate(() =>
    document.getElementById('licBox').classList.remove('hide'));
  return { pg, erros, enviados };
}

/* Uma sessão de mentira, guardada ONDE O APP A PROCURA — e não injetada por
   dentro. O arquivo é uma função fechada: mexer nas variáveis dele de fora
   testaria um app que não existe. Aqui a sessão entra pelo `sessionStorage`,
   que é o caminho de verdade da volta do link de e-mail. */
const SESSAO = 'Walkstamp.sessao';
const semearSessao = (pg) => pg.addInitScript(([chave, dados]) => {
  try { sessionStorage.setItem(chave, dados); } catch (e) {}
}, [SESSAO, JSON.stringify({ token: 'fake', email: 'quem@empresa.com',
                             exp: Math.floor(Date.now()/1000) + 3600 })]);

// ------------------------------------------------------ 1. o botão existe
{
  const { pg, erros } = await abrir({ lentidao: 0, comSessao: true });
  console.log('\n[1] o botão no painel de chamados');
  const antes = await pg.evaluate(() => ({
    existe: !!document.getElementById('meusDiag'),
    visivel: !!document.getElementById('meusDiag') &&
             document.getElementById('meusDiag').offsetParent !== null,
    chamarEscondido: document.getElementById('meusChamar').classList.contains('hide'),
  }));
  ok('o botão Diagnóstico existe no painel', antes.existe);
  ok('e está à vista depois de entrar', antes.visivel);
  ok('"abrir chamado" só aparece depois do relatório', antes.chamarEscondido);

  await pg.click('#meusDiag');
  await pg.waitForFunction(() => /fim ---/.test(document.getElementById('meusDiagOut').textContent || ''),
                           null, { timeout: 60000 });
  const dep = await pg.evaluate(() => ({
    linhas: (document.getElementById('meusDiagOut').textContent || '').split('\n').length,
    versao: /versão/.test(document.getElementById('meusDiagOut').textContent || ''),
    chamarVisivel: !document.getElementById('meusChamar').classList.contains('hide'),
  }));
  console.log('     relatório com ' + dep.linhas + ' linhas');
  ok('o relatório aparece no painel', dep.linhas > 20, dep.linhas + ' linhas');
  ok('e começa pela versão, que é a primeira pergunta', dep.versao);
  ok('agora dá para abrir o chamado com ele', dep.chamarVisivel);
  ok('sem erro de página', erros.length === 0, erros[0]);
  await pg.close();
}

// ---------------------------- 2. o envio RÁPIDO leva o relatório inteiro
{
  const { pg, erros, enviados } = await abrir({ lentidao: LENTO });
  console.log('\n[2] apertar Enviar depressa, com a rede ruim');
  await pg.click('#avisar');
  await pg.waitForTimeout(120);                    // o tempo de digitar, não de esperar
  await pg.fill('#fbTexto', 'a transcrição trava no 0%');
  const t0 = Date.now();
  await pg.click('#fbEnviar');
  await pg.waitForFunction(() => /WS-9999/.test(document.getElementById('fbMsg').textContent || ''),
                           null, { timeout: 90000 });
  const ms = Date.now() - t0;
  const env = enviados[enviados.length - 1] || {};
  const diag = env.p_diag || '';
  console.log('     esperou ' + ms + ' ms, mandou ' + diag.length + ' caracteres de relatório');
  ok('mandou um recado', !!env.p_texto);
  /* A AFIRMAÇÃO QUE PEGA O DEFEITO. Sem o conserto isto vale 1 — o "…" que
     chegou no WS-0005 — ou o tamanho da mensagem de espera. */
  ok('o relatório vai INTEIRO, e não o texto de espera',
     diag.length > 400 && /fim ---/.test(diag), diag.length + ' caracteres: ' + diag.slice(0, 60));
  ok('e é o relatório, não outra coisa', /versão/.test(diag) && /navegador/.test(diag));
  ok('sem erro de página', erros.length === 0, erros[0]);
  await pg.close();
}

// ------------------- 3. desmarcar a caixa manda na hora, e sem relatório
{
  const { pg, erros, enviados } = await abrir({ lentidao: LENTO });
  console.log('\n[3] com a caixa desmarcada, não há espera nenhuma');
  await pg.click('#avisar');
  await pg.waitForTimeout(120);
  await pg.fill('#fbTexto', 'só uma ideia');
  await pg.uncheck('#fbDiag');
  const t0 = Date.now();
  await pg.click('#fbEnviar');
  await pg.waitForFunction(() => /WS-9999/.test(document.getElementById('fbMsg').textContent || ''),
                           null, { timeout: 30000 });
  const ms = Date.now() - t0;
  const env = enviados[enviados.length - 1] || {};
  console.log('     esperou ' + ms + ' ms');
  ok('o recado saiu sem relatório', env.p_diag === null || env.p_diag === undefined, String(env.p_diag).slice(0,40));
  ok('e saiu sem esperar a coleta', ms < LENTO, ms + ' ms contra ' + LENTO + ' ms de sondagem');
  ok('sem erro de página', erros.length === 0, erros[0]);
  await pg.close();
}

await br.close(); srv.close();
console.log(falhas ? `\n  ${falhas} falha(s)` : '\n  tudo certo');
process.exit(falhas ? 1 : 0);
