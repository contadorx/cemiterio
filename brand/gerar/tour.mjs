/**
 * Regrava o tour da landing percorrendo o app de verdade.
 * Um roteiro em Playwright, gravado em tempo real, com um cursor sintético
 * (o Playwright não grava o ponteiro do sistema).
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = '/root/cc/clipcontext/public';
const jspdf = fs.readFileSync('/root/cc/clipcontext/vendor/jspdf.umd.min.js', 'utf8');
const LANG = process.argv[2] || 'pt';
const SAIDA = `/tmp/tour-${LANG}`;

const TIPOS = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript',
  '.svg':'image/svg+xml', '.ico':'image/x-icon', '.png':'image/png', '.jpg':'image/jpeg',
  '.mp4':'video/mp4', '.webm':'video/webm', '.vtt':'text/vtt' };

const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(8879, r));

fs.rmSync(SAIDA, { recursive: true, force: true });
const br = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--autoplay-policy=no-user-gesture-required', '--force-prefers-reduced-motion=false']
});
const ctx = await br.newContext({
  viewport: { width: 1000, height: 700 },
  recordVideo: { dir: SAIDA, size: { width: 1000, height: 700 } },
  colorScheme: 'light'
});
const pg = await ctx.newPage();
pg.on('pageerror', e => console.log('ERRO:', e.message));
await pg.route('**/jspdf**', r => r.fulfill({ status:200,
  headers:{'content-type':'text/javascript','access-control-allow-origin':'*'}, body: jspdf }));

const T0 = Date.now();
const marca = {};
const reg = n => { marca[n] = (Date.now()-T0)/1000; };
await pg.goto(`http://localhost:8879/app.html?lang=${LANG}`);
await pg.waitForTimeout(400);

// cursor sintético
await pg.evaluate(() => {
  const c = document.createElement('div');
  c.id = '__cur';
  c.style.cssText = 'position:fixed;left:0;top:0;width:19px;height:19px;border-radius:50%;'
    + 'background:rgba(58,63,158,.28);border:2px solid rgba(58,63,158,.85);z-index:99999;'
    + 'pointer-events:none;transform:translate(-50%,-50%);transition:left .55s cubic-bezier(.4,0,.2,1),'
    + 'top .55s cubic-bezier(.4,0,.2,1),transform .16s;opacity:0';
  document.body.appendChild(c);
  window.__mover = (sel) => {
    const el = document.querySelector(sel); if (!el) return;
    const r = el.getBoundingClientRect();
    c.style.opacity = '1';
    c.style.left = (r.left + r.width/2) + 'px';
    c.style.top = (r.top + r.height/2) + 'px';
  };
  window.__pulsar = () => {
    c.style.transform = 'translate(-50%,-50%) scale(.62)';
    setTimeout(() => c.style.transform = 'translate(-50%,-50%) scale(1)', 170);
  };
});
const apontar = async sel => { await pg.evaluate(s => window.__mover(s), sel); await pg.waitForTimeout(650); };
const clicar  = async sel => { await apontar(sel); await pg.evaluate(() => window.__pulsar());
                               await pg.waitForTimeout(180); await pg.click(sel); };
const rolar   = async (y) => { await pg.evaluate(v => window.scrollTo({top:v, behavior:'smooth'}), y);
                               await pg.waitForTimeout(750); };

// 1 — a página, parada, para dar tempo de ler o cabeçalho
await pg.waitForTimeout(1200);

// 2 — carregar o vídeo de exemplo
await clicar('#demo');
await pg.waitForSelector('#playerBox:not(.hide)', { timeout: 30000 });
await pg.waitForTimeout(1200);

// 3 — a transcrição chega junto
await rolar(430);
await pg.waitForTimeout(1500);

// 4 — os controles de extração
await rolar(880);
await pg.waitForTimeout(1000);
await apontar('#sens');

// 5 — extrair os frames, com a barra correndo
reg('scanIni');
await clicar('#extract');
await pg.waitForSelector('#prevCard:not(.hide)', { timeout: 90000 });
reg('scanFim');
await pg.waitForTimeout(600);

// 6 — a grade de revisão
await rolar(1320);
await pg.waitForTimeout(1500);

// 7 — descartar um frame com um clique
await clicar('#thumbs figure:nth-child(3)');
await pg.waitForTimeout(1100);

// 8 — as quatro saídas
await pg.evaluate(() => document.getElementById('go').scrollIntoView({block:'center', behavior:'smooth'}));
await pg.waitForTimeout(900);
for (const s of ['#go', '#docx', '#zip', '#json']) await apontar(s);
await pg.waitForTimeout(700);

// 9 — o prompt pronto no fim
await pg.evaluate(() => document.getElementById('promptCard').scrollIntoView({block:'start', behavior:'smooth'}));
await pg.waitForTimeout(1700);
await apontar('#copyPrompt');
await pg.waitForTimeout(1100);
reg('fim');

await ctx.close();
await br.close(); srv.close();

const bruto = fs.readdirSync(SAIDA).find(f => f.endsWith('.webm'));
fs.renameSync(path.join(SAIDA, bruto), `/tmp/tour-bruto-${LANG}.webm`);
fs.writeFileSync(`/tmp/tour-marcas-${LANG}.json`, JSON.stringify(marca));
console.log(`gravado: /tmp/tour-bruto-${LANG}.webm`, JSON.stringify(marca));
