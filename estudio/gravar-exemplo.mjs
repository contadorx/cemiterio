/**
 * Grava o VÍDEO DE EXEMPLO: alguém percorrendo um sistema, não passando slides.
 *
 * O exemplo anterior era um relatório trimestral — e mostrava o produto errado.
 * Quem procura "evidência de teste" ou "instrução de trabalho" não grava
 * slides: grava um sistema. Um exemplo que não parece o trabalho de quem chega
 * faz a pessoa concluir que a ferramenta é para outra coisa.
 *
 * O percurso é o que todo mundo que já homologou alguma coisa reconhece:
 * abrir a lista, criar, preencher, LEVAR UMA RECUSA, corrigir e sair com um
 * número. A recusa é o ponto: é o quadro que interessa numa evidência, é o que
 * a marcação manual existe para pegar e o que o comentário existe para
 * explicar.
 *
 * As pausas são longas de propósito. O detector de mudança do Walkstamp compara
 * quadros ao longo do tempo; uma tela que fica meio segundo não vira passo. O
 * que se está gravando aqui é material de teste para o próprio produto.
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';

const LANG = process.argv[2] || 'pt';
const SAIDA = `/tmp/exemplo-${LANG}`;

const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = path.join(process.env.SISTEMA || '/tmp/sistema', u === '/' ? 'app.html' : u);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': 'text/html' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(8881, r));

fs.rmSync(SAIDA, { recursive: true, force: true });
const br = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const ctx = await br.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: SAIDA, size: { width: 1280, height: 720 } },
  colorScheme: 'light',
});
const pg = await ctx.newPage();
await pg.goto(`http://localhost:8881/app.html?lang=${LANG}`);
await pg.waitForTimeout(300);

/* O cursor. Sem ele o vídeo parece uma tela se preenchendo sozinha — e o que
   se quer mostrar é uma PESSOA usando um sistema. */
await pg.evaluate(() => {
  const c = document.createElement('div');
  c.id = '__cur';
  c.style.cssText = 'position:fixed;left:640px;top:360px;width:16px;height:16px;'
    + 'border-radius:50%;background:rgba(20,25,45,.30);border:2px solid rgba(20,25,45,.7);'
    + 'z-index:9999;pointer-events:none;transform:translate(-50%,-50%);'
    + 'transition:left .5s cubic-bezier(.4,0,.2,1),top .5s cubic-bezier(.4,0,.2,1),transform .15s';
  document.body.appendChild(c);
  window.__ir = (sel) => {
    const el = document.querySelector(sel); if (!el) return;
    const r = el.getBoundingClientRect();
    c.style.left = (r.left + r.width / 2) + 'px';
    c.style.top = (r.top + r.height / 2) + 'px';
  };
  window.__clique = () => {
    c.style.transform = 'translate(-50%,-50%) scale(.6)';
    setTimeout(() => c.style.transform = 'translate(-50%,-50%) scale(1)', 160);
  };
});
const ir = async s => { await pg.evaluate(x => window.__ir(x), s); await pg.waitForTimeout(560); };
const clicar = async s => { await ir(s); await pg.evaluate(() => window.__clique());
                            await pg.waitForTimeout(200); };

/* Digitar letra a letra, e não `fill`. Um campo que se preenche de uma vez não
   parece alguém digitando — e o vídeo é sobre alguém usando o sistema. */
const digitar = async (sel, texto) => {
  await ir(sel);
  await pg.evaluate(s => document.querySelector(s).focus(), sel);
  await pg.type(sel, texto, { delay: 42 });
  await pg.waitForTimeout(320);
};
const V = await pg.evaluate(() => window.__V);

// ---- 1. a lista, parada, para ser lida --------------------------------------
await pg.waitForTimeout(3200);

// ---- 2. novo pedido ---------------------------------------------------------
await clicar('#novo');
await pg.evaluate(() => {
  document.getElementById('lista').classList.add('esconde');
  document.getElementById('form').classList.remove('esconde');
});
await pg.waitForTimeout(2600);

// ---- 3. preencher, DE PROPÓSITO sem o centro de custo ----------------------
await digitar('#f1', V[0]);
await digitar('#f2', V[1]);
await digitar('#f4', V[3]);
await digitar('#f5', V[4]);
await pg.waitForTimeout(1400);

// ---- 4. salvar e levar a recusa — o quadro que interessa -------------------
await clicar('#salvar');
await pg.evaluate(() => {
  document.getElementById('erro').classList.add('ver');
  document.getElementById('f3').classList.add('ruim');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
await pg.waitForTimeout(4200);

// ---- 5. corrigir ------------------------------------------------------------
await digitar('#f3', V[2]);
await pg.evaluate(() => {
  document.getElementById('erro').classList.remove('ver');
  document.getElementById('f3').classList.remove('ruim');
});
await pg.waitForTimeout(1800);

// ---- 6. salvar de novo, e o número de protocolo ----------------------------
await clicar('#salvar');
await pg.evaluate(() => {
  document.getElementById('form').classList.add('esconde');
  document.getElementById('fim').classList.remove('esconde');
});
await pg.waitForTimeout(4600);

await ctx.close(); await br.close(); srv.close();
const bruto = fs.readdirSync(SAIDA).find(f => f.endsWith('.webm'));
fs.renameSync(path.join(SAIDA, bruto), `/tmp/exemplo-bruto-${LANG}.webm`);
console.log(`gravado: /tmp/exemplo-bruto-${LANG}.webm`);
