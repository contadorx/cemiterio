import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT = `${RAIZ_WS}/public`;
const html = fs.readFileSync(ROOT + '/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (u.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end('') }
  if (u === '/sw.js') { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end(fs.readFileSync(ROOT+'/sw.js')) }
  r.writeHead(200, {'Content-Type':'text/html'}); r.end(html);
});
await new Promise(r => srv.listen(8902, r));

const br = await chromium.launch({
  executablePath: CHROME_WS,
  args: ['--autoplay-policy=no-user-gesture-required']
});
let falhas = 0;
const ok = (n, c, extra) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (extra ? '  → ' + extra : '')); if (!c) falhas++; };

async function gravar({ quebrarAssinatura, telaParada }){
  const ctx = await br.newContext();
  const pg = await ctx.newPage();
  const erros = [];
  pg.on('pageerror', e => erros.push(e.message));
  await pg.addInitScript(([quebra, parada]) => {
    function tela(){
      const c = document.createElement('canvas'); c.width = 320; c.height = 180;
      const g = c.getContext('2d'); let i = 0;
      g.fillStyle = '#222'; g.fillRect(0, 0, 320, 180);
      if (!parada) setInterval(() => {
        i++; g.fillStyle = ['#123','#eee','#567','#fa0'][i % 4];
        g.fillRect(0, 0, 320, 180);
      }, 700);
      return c.captureStream(12);
    }
    navigator.mediaDevices.getDisplayMedia = async () => tela();
    navigator.mediaDevices.getUserMedia = async () => { throw new Error('sem mic'); };
    if (quebra) {
      /* Simula a falha que produz `semAssinatura`: o detector de mudança não
         consegue ler a tela. A captura forçada tem que passar assim mesmo. */
      const orig = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function (...a) {
        if (this.canvas.width === 32) throw new Error('leitura barrada');
        return orig.apply(this, a);
      };
    }
  }, [!!quebrarAssinatura, !!telaParada]);

  await pg.goto('http://localhost:8902/app.html?lang=pt');
  // o cenário de uso passou a ser obrigatório: sem ele o Gravar e o envio de vídeo cobram a escolha
  await pg.selectOption('#modelo', 'ia').catch(() => {});
  await pg.waitForTimeout(400);
  await pg.locator('#recTr').evaluate(el => { if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change')); } });
  await pg.locator('#rec').click({ force: true });
  await pg.waitForSelector('#recStop:visible', { timeout: 40000 });
  await pg.waitForTimeout(6000);
  await pg.locator('#recStop').click();
  await pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null, null, { timeout: 40000 });
  await pg.waitForTimeout(500);
  const n = await pg.locator('#thumbs figure').count();
  const msg = await pg.locator('#recMsg').textContent();
  return { pg, ctx, erros, n, msg };
}

console.log('[A] o detector de mudança falha: a captura forçada tem que passar');
{
  const { pg, ctx, erros, n, msg } = await gravar({ quebrarAssinatura: true });
  ok('não terminou com zero frames', n > 0, n + ' miniaturas');
  ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 160));
  await ctx.close();
}

console.log('\n[B] tela realmente parada: zero é legítimo, mas explicado');
{
  const { pg, ctx, erros, n, msg } = await gravar({ telaParada: true });
  ok('a tela parada rende pouquíssimos frames', n <= 2, n + ' miniaturas');

  /* O botão Diagnóstico saiu da tela na revisão de UX: ele virou o ANEXO de um
     recado, no rodapé. O caminho de uma pessoa com problema agora é este —
     abrir "avisar um problema" e ver o relatório antes de mandar. */
  await pg.locator('#avisar').click();
  await pg.waitForFunction(() => {
    const el = document.getElementById('fbDiagOut');
    return el && el.textContent && el.textContent.length > 40;
  }, null, { timeout: 25000 });
  await pg.waitForFunction(() => /fim ---/.test(document.getElementById('fbDiagOut').textContent),
                           null, { timeout: 90000 });
  const d = await pg.locator('#fbDiagOut').textContent();
  const bloco = d.slice(d.indexOf('última gravação de tela:'), d.indexOf('modelo guardado'));
  console.log(bloco.split('\n').map(l => '      ' + l).join('\n'));

  ok('o diagnóstico traz a última gravação', /última gravação de tela:/.test(d));
  ok('traz a contagem de recusas', /recusas: sem imagem do vídeo=\d+/.test(bloco));
  ok('traz a maior mudança contra o limiar', /mudança: maior vista=[\d.]+\s+limiar em vigor=[\d.]+/.test(bloco));
  ok('traz as dimensões do vídeo', /vídeo\s+: \d+×\d+/.test(bloco));
  ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 160));
  await ctx.close();
}

await br.close(); srv.close();
console.log(falhas ? '\n' + falhas + ' falha(s)' : '\nSem frames: tudo passou.');
process.exit(falhas ? 1 : 0);
