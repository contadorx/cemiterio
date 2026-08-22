/**
 * O tour da home, gravado percorrendo o aplicativo DE VERDADE.
 *
 * Nada aqui é encenação: é o Playwright abrindo o `app.html` publicado,
 * clicando nos botões que existem e filmando o que acontece. Se o aplicativo
 * quebrar, o tour quebra junto — que é o único jeito honesto de manter um
 * vídeo de produto atualizado. Um tour gravado à mão envelhece em silêncio.
 *
 * O cursor é sintético: o Playwright não filma o ponteiro do sistema. Um vídeo
 * em que as coisas acontecem sozinhas parece defeito de gravação.
 *
 * ---- o que este roteiro mudou em relação ao anterior ----
 *
 * O aplicativo mudou embaixo dele. Três coisas quebrariam o roteiro antigo, e
 * uma quarta o tornaria mentiroso:
 *
 *   1. O CENÁRIO virou obrigatório. Sem escolher, o vídeo do exemplo nem
 *      carrega — e essa é agora a primeira decisão de quem chega, então ela
 *      abre o tour em vez de ficar de fora dele;
 *   2. o PASSO 3 foi reordenado: vocabulário, organizar, revisar, e o placar
 *      por último. O roteiro percorre nessa ordem;
 *   3. "Revisar passo a passo" virou "Revisar quadro a quadro" e ganhou
 *      destaque — o tour para nele, porque é a coisa mais valiosa do cartão e
 *      a que ninguém descobre sozinho;
 *   4. e a legenda do exemplo agora segue o idioma da página, então o tour em
 *      alemão mostra um documento em alemão. Antes mostrava inglês.
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';

const ROOT = '/root/cc/walkstamp/public';
const jspdf = fs.readFileSync('/root/cc/walkstamp/vendor/jspdf.umd.min.js', 'utf8');
const LANG = process.argv[2] || 'pt';
const SAIDA = `/tmp/tour-${LANG}`;

/* O cenário do tour é a EVIDÊNCIA DE TESTE, e não o genérico.
   É o caso de uso que mais paga, é o que tem hora de relógio e impressão
   digital na tela — as duas coisas que distinguem este produto de um gravador
   de tela qualquer. Um tour que escolhe o formato neutro mostra menos. */
const CENARIO = 'evidencia';

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
const erros = [];
pg.on('pageerror', e => { erros.push(e.message); console.log('ERRO:', e.message); });
await pg.route('**/jspdf**', r => r.fulfill({ status:200,
  headers:{'content-type':'text/javascript','access-control-allow-origin':'*'}, body: jspdf }));

const T0 = Date.now();
const marca = {};
const reg = n => { marca[n] = (Date.now()-T0)/1000; };
await pg.goto(`http://localhost:8879/app.html?lang=${LANG}`);
await pg.waitForTimeout(500);

// o cursor sintético
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
const aoCentro = async sel => {
  await pg.evaluate(s => { const e = document.querySelector(s);
    if (e) e.scrollIntoView({ block:'center', behavior:'smooth' }); }, sel);
  await pg.waitForTimeout(800);
};

// 1 — a página parada, para dar tempo de ler o cabeçalho
await pg.waitForTimeout(1300);

/* 2 — A PRIMEIRA DECISÃO: o cenário.
   Ela abre o tour porque abre o uso. O documento inteiro depende dela, e quem
   chega sem saber que a pergunta existe recebe o formato errado. */
await apontar('#modelo');
await pg.waitForTimeout(500);
await pg.selectOption('#modelo', CENARIO);
await pg.waitForTimeout(1100);

// 3 — carregar o vídeo de exemplo
await clicar('#demo');
await pg.waitForSelector('#playerBox:not(.hide)', { timeout: 30000 });
await pg.waitForTimeout(1300);

// 4 — a transcrição chega junto, no idioma da página
await rolar(430);
await pg.waitForTimeout(1600);

// 5 — os controles de extração
await rolar(900);
await pg.waitForTimeout(900);
await apontar('#sens');
await pg.waitForTimeout(400);

// 6 — extrair os quadros, com a barra correndo
reg('scanIni');
await clicar('#extract');
await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length > 0,
                         null, { timeout: 90000 });
reg('scanFim');
await pg.waitForTimeout(700);

/* 7 — o passo 3, na ordem nova: como se chama um quadro, depois o que fazer
   com eles, depois o botão que passa por todos, e o placar no fim. */
await aoCentro('#unNome');
await apontar('#unNome');
await pg.waitForTimeout(900);
await aoCentro('#revisar');
await apontar('#revisar');
await pg.waitForTimeout(1100);

// 8 — descartar um quadro com um clique, que é o gesto que ninguém adivinha
await aoCentro('#thumbs');
await pg.waitForTimeout(600);
await clicar('#thumbs figure:nth-child(3)');
await pg.waitForTimeout(1200);

// 9 — as saídas
await aoCentro('#go');
for (const s of ['#go', '#docx', '#pptx', '#zip']) await apontar(s);
await pg.waitForTimeout(800);

// 10 — o prompt pronto, no fim
await pg.evaluate(() => { const e = document.getElementById('promptCard');
  if (e) e.scrollIntoView({ block:'start', behavior:'smooth' }); });
await pg.waitForTimeout(1700);
await apontar('#copyPrompt');
await pg.waitForTimeout(1200);
reg('fim');

await ctx.close();
await br.close(); srv.close();

const bruto = fs.readdirSync(SAIDA).find(f => f.endsWith('.webm'));
if (!bruto) { console.error('não saiu vídeo nenhum'); process.exit(1); }
fs.renameSync(path.join(SAIDA, bruto), `/tmp/tour-bruto-${LANG}.webm`);
fs.writeFileSync(`/tmp/tour-marcas-${LANG}.json`, JSON.stringify(marca));
console.log(`gravado: /tmp/tour-bruto-${LANG}.webm`, JSON.stringify(marca),
            erros.length ? `  ERROS: ${erros.length}` : '');
process.exit(erros.length ? 1 : 0);
