import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
import { execFileSync } from 'child_process';
import { ALVO, exigirNext } from './proxy.mjs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
await exigirNext();

const ROOT = `${RAIZ_WS}/public`;
/* As paletas saem de `brand/paletas.py`, que é onde elas são decididas e onde
   o contraste WCAG é conferido. Antes saíam de um `/tmp/paletas.json` escrito à
   mão: ele não viajava no zip (o teste morria com ENOENT em máquina nova) e,
   pior, não acompanhava mudança de cor nenhuma — repintava com o que estava
   guardado de antes. Uma lista à mão ao lado da lista de verdade. */
const PAL = JSON.parse(execFileSync('python3',
  [`${RAIZ_WS}/brand/paletas.py`, '--json'], { encoding: 'utf8', maxBuffer: 1 << 24 }));

// troca as variáveis de cor e a cor do logotipo inline / favicon
function pintar(html, p) {
  const c = p.claro, d = p.escuro;
  // valores antigos, claro e escuro, são distintos entre si: dá para trocar
  // "--nome:valorAntigo" por "--nome:valorNovo" sem ambiguidade e sem tocar
  // no #fff das barras do logotipo
  const MAPA = [
    ['bg','#faf9f7',c.bg], ['panel','#fff',c.panel], ['ink','#1f1e1c',c.ink],
    ['muted','#6b6862',c.muted], ['line','#e5e2dc',c.line], ['accent','#c2603a',c.accent],
    ['accent-ink','#fff',c.accent_ink], ['warn','#8a6d1f',c.warn], ['err','#b3402a',c.err],
    ['bg','#1a1917',d.bg], ['panel','#232220',d.panel], ['ink','#f0eee9',d.ink],
    ['muted','#a09c94',d.muted], ['line','#35332f',d.line], ['accent','#d97757',d.accent],
    ['accent-ink','#1a1917',d.accent_ink], ['warn','#d4b25f',d.warn], ['err','#e8846b',d.err],
  ];
  let s = html;
  for (const [nome, velho, novo] of MAPA)
    s = s.split(`--${nome}:${velho}`).join(`--${nome}:${novo}`);
  const A = c.accent.replace('#','').toUpperCase();
  s = s.replace(/#C2603A/gi, '#' + A).replace(/%23C2603A/gi, '%23' + A);
  return s;
}

const appPuro = fs.readFileSync(ROOT + '/app.html', 'utf8');
/* A home não é mais um arquivo: vem do Next. Buscada uma vez, aqui, para o
   resto do teste continuar trabalhando em cima de uma string como antes. */
const idxPuro = await (await fetch(ALVO + '/?lang=pt')).text();
const cssPuro = fs.readFileSync(ROOT + '/site.css', 'utf8');
const logoPuro = fs.readFileSync(ROOT + '/logo.svg', 'utf8');

let atual = 'atual';
/* Este servidor não encaminha para o Next: ele serve a página REPINTADA, que
   é o objeto do teste. O que veio do Next foi a home, buscada acima. */
const TIPOS = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
                '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
                '.webm': 'video/webm', '.mp4': 'video/mp4', '.jpg': 'image/jpeg' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u.startsWith('/_vercel/')) { r.writeHead(200, {'Content-Type':'text/javascript'}); return r.end(''); }
  const p = PAL[atual];
  if (u === '/' || u === '/index.html') {
    r.writeHead(200, {'Content-Type':'text/html'}); return r.end(pintar(idxPuro, p));
  }
  if (u === '/app.html' || u === '/app') {
    r.writeHead(200, {'Content-Type':'text/html'}); return r.end(pintar(appPuro, p));
  }
  if (u === '/site.css') { r.writeHead(200, {'Content-Type':'text/css'}); return r.end(pintar(cssPuro, p)); }
  if (u === '/logo.svg') { r.writeHead(200, {'Content-Type':'image/svg+xml'}); return r.end(pintar(logoPuro, p)); }
  const f = path.join(ROOT, u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('x'); }
  r.writeHead(200, {'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream'});
  r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(8881, r));

const br = await chromium.launch({ executablePath: CHROME_WS });

for (const chave of Object.keys(PAL)) {
  atual = chave;
  for (const modo of ['light', 'dark']) {
    const ctx = await br.newContext({ viewport: { width: 900, height: 1000 }, colorScheme: modo, deviceScaleFactor: 1.4 });
    const pg = await ctx.newPage();

    await pg.goto('http://localhost:8881/app.html?lang=pt', { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(700);
    await pg.evaluate(() => {
      // deixa visíveis os elementos que carregam a cor: botões, seletor, avisos
      document.getElementById('driveRow').classList.remove('hide');
      document.getElementById('recOpts').classList.remove('hide');
      document.getElementById('prevCard').classList.remove('hide');
      document.getElementById('status').innerHTML = '<span class="ok">8 frames extraídos.</span> Revise abaixo antes de gerar.';
      const t = document.getElementById('thumbs');
      const cor = ['#5b6b7a','#7a5b6b','#6b7a5b','#4a5a6a','#6a4a5a','#5a6a4a'];
      t.innerHTML = cor.map((c,i)=>`<figure${i===4?' class="off"':''}><div style="width:100%;aspect-ratio:16/9;background:${c}"></div><figcaption>00:${String(i*7).padStart(2,'0')}</figcaption></figure>`).join('');
      document.getElementById('nKeep').textContent = '5';
      document.getElementById('nOff').textContent = '1';
      document.getElementById('size').textContent = '1.4';
      ['go','docx','zip','json','allOn','dedup','mute','ocr'].forEach(id=>{const e=document.getElementById(id); if(e) e.disabled=false;});
    });
    await pg.waitForTimeout(300);
    await pg.locator('.card').first().screenshot({ path: `/tmp/pv-${chave}-${modo}-app1.png` });
    await pg.locator('#prevCard').screenshot({ path: `/tmp/pv-${chave}-${modo}-app2.png` });

    await pg.goto('http://localhost:8881/index.html?lang=pt', { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(700);
    await pg.screenshot({ path: `/tmp/pv-${chave}-${modo}-site.png` });
    await ctx.close();
  }
  console.log('renderizado:', chave);
}
await br.close(); srv.close();
