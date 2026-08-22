/* A GRADE DE MINIATURAS, medida antes de mexer nela.
 *
 * A proposta era virtualizar: `IntersectionObserver` na `.thumbs`, instanciar o
 * `<figure>` completo só para o que está visível, reciclar o resto. Antes de
 * escrever isso — que traz junto o risco de reciclar um campo de anotação com
 * texto dentro — é preciso saber o que a grade custa hoje.
 *
 * Ele mede, com a grade cheia:
 *
 *   - nós de DOM por miniatura e no total
 *   - quanto tempo um `render()` leva (é ele que refaz a grade inteira a cada
 *     descarte, a cada mover, a cada reabrir)
 *   - o ritmo de quadros ROLANDO a página com a grade cheia
 *   - quantas imagens o navegador realmente decodificou
 *
 * As afirmações são só as que não dependem da máquina. FPS e milissegundos
 * saem impressos.
 *
 *   node testes/grade.mjs               # 300 quadros, o teto padrão
 *   node testes/grade.mjs --quadros 60
 */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const RAIZ = `${RAIZ_WS}`;
const html = fs.readFileSync(RAIZ + '/public/app.html', 'utf8');
const arg = (n, p) => {
  const i = process.argv.indexOf('--' + n);
  return i > 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : p;
};
const QUADROS = arg('quadros', 300);

const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) {
    r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end('');
  }
  r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(html);
});
await new Promise(r => srv.listen(8937, r));

let falhas = 0;
const ok = (n, c, e) => {
  console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : ''));
  if (!c) falhas++;
};

const br = await chromium.launch({
  executablePath: CHROME_WS,
  args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
const ctx = await br.newContext({ viewport: { width: 1250, height: 980 } });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));
await pg.goto('http://localhost:8937/app.html?lang=pt');
await pg.selectOption('#modelo', 'evidencia').catch(() => {});
await pg.waitForTimeout(300);

await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForTimeout(2500);
await pg.selectOption('#mode', 'count');
await pg.fill('#maxf', String(Math.max(300, QUADROS)));
await pg.fill('#count', String(QUADROS));
await pg.locator('#extract').click();
await pg.waitForFunction(n => document.querySelectorAll('#thumbs figure').length >= n,
                         QUADROS, { timeout: 300000 });
await pg.waitForTimeout(1500);

const dom = await pg.evaluate(() => {
  const box = document.getElementById('thumbs');
  return {
    figuras: box.querySelectorAll('figure').length,
    nos: box.querySelectorAll('*').length,
    imagens: box.querySelectorAll('img').length,
    campos: box.querySelectorAll('input.nota').length,
    docNos: document.querySelectorAll('*').length
  };
});

/* Quanto custa refazer a grade. `render()` roda a cada descarte e a cada mover;
   com a grade cheia é ele que decide se a ferramenta responde ao clique. */
const renderMs = await pg.evaluate(() => {
  const t = [];
  for (let k = 0; k < 5; k++) {
    const t0 = performance.now();
    /* Pelo caminho da pessoa: descartar e devolver o mesmo quadro chama
       `render()` duas vezes e volta ao estado inicial. */
    document.querySelector('#thumbs .toque').click();
    t.push(performance.now() - t0);
    document.querySelector('#thumbs .toque').click();
  }
  t.sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)];
});

/* Rolando: o ritmo de quadros enquanto a grade cheia passa pela tela. */
const rolagem = await pg.evaluate(async () => {
  const box = document.scrollingElement;
  const marcas = [];
  let t0 = performance.now(), rodando = true;
  const tique = () => {
    const t = performance.now();
    marcas.push(t - t0); t0 = t;
    if (rodando) requestAnimationFrame(tique);
  };
  requestAnimationFrame(tique);
  const alvo = document.getElementById('thumbs');
  const alto = alvo.scrollHeight;
  /* Passo FIXO em pixels, e não uma fração da altura da grade.
     Com fração, uma grade mais alta faz cada passo pular mais conteúdo e o
     número piora sem que nada tenha ficado mais lento — foi assim que eu quase
     concluí que uma mudança tinha piorado a rolagem quando ela só tinha mudado a
     altura estimada das miniaturas fora da tela. 120 px por quadro de tela é o
     ritmo de quem rola com o dedo, e é o mesmo trabalho nas duas medições. */
  for (let i = 0; i <= 80; i++) {
    box.scrollTop = alvo.offsetTop + Math.min(alto, i * 120);
    await new Promise(r => requestAnimationFrame(r));
  }
  rodando = false;
  marcas.sort((a, b) => a - b);
  const p = q => marcas[Math.min(marcas.length - 1, Math.floor(marcas.length * q))];
  return { fps: 1000 / (marcas.reduce((s, x) => s + x, 0) / marcas.length),
           p50: p(0.5), p95: p(0.95), n: marcas.length,
           alturaDaGrade: alto };
});

const decodificadas = await pg.evaluate(() =>
  [...document.querySelectorAll('#thumbs img')].filter(i => i.naturalWidth > 0).length);

const heap = await pg.evaluate(() => {
  if (window.gc) window.gc();
  return performance.memory ? performance.memory.usedJSHeapSize : null;
});

const linha = (k, v) => console.log('   ' + k.padEnd(38) + v);
console.log(`\n  grade com ${dom.figuras} miniaturas\n`);
linha('nós de DOM na grade', dom.nos + '  (' + (dom.nos / dom.figuras).toFixed(1) + ' por miniatura)');
linha('nós de DOM na página inteira', dom.docNos);
linha('imagens instanciadas', dom.imagens);
linha('imagens já decodificadas', decodificadas);
linha('campos de anotação instanciados', dom.campos);
linha('um render() completo', renderMs.toFixed(0) + ' ms');
linha('rolando a grade inteira',
      rolagem.fps.toFixed(1) + ' FPS   p50 ' + rolagem.p50.toFixed(1) +
      ' ms, p95 ' + rolagem.p95.toFixed(1) + ' ms');
linha('altura da grade', Math.round(rolagem.alturaDaGrade) + ' px');
if (heap != null) linha('heap JS', (heap / 1048576).toFixed(1) + ' MB');

console.log('\n  o que este arquivo AFIRMA:');
/* A grade tem que continuar contando a mesma história que `frames`: quem
   virtualiza tirando `<figure>` do documento quebra a barra de rolagem, o
   Ctrl+F, o leitor de tela e a contagem de passos ao mesmo tempo. */
ok('há uma miniatura por quadro, e nenhuma some da página',
   dom.figuras === QUADROS, dom.figuras + ' de ' + QUADROS);
ok('e um campo de anotação por miniatura',
   dom.campos === dom.figuras, dom.campos + ' de ' + dom.figuras);
/* A ANOTAÇÃO MORA NO QUADRO, e não no campo. É a única coisa que uma grade
   virtualizada pode destruir sem fazer barulho: reciclar o campo antes de o
   texto ter chegado ao modelo apaga o comentário de quem acabou de digitar. */
{
  const guardou = await pg.evaluate(async () => {
    const campos = [...document.querySelectorAll('#thumbs input.nota')];
    const ultimo = campos[campos.length - 1];
    ultimo.focus();
    ultimo.value = 'anotação do último passo';
    ultimo.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50));
    /* Rola para o começo — se houver reciclagem, é aqui que o campo do fim
       perde o dono — e pergunta ao MODELO, não ao campo. */
    document.scrollingElement.scrollTop = 0;
    await new Promise(r => setTimeout(r, 400));
    const q = window.__quadros();
    return q[q.length - 1].nota;
  });
  ok('o que se digita numa anotação mora no quadro, não no campo',
     guardou === 'anotação do último passo', JSON.stringify(guardou));
}
/* ---- REFAZER A VARREDURA ESVAZIA A GRADE NO MESMO GESTO ----
   O defeito: "Refazer as telas" esvaziava a LISTA e deixava as miniaturas
   antigas na tela até o primeiro quadro novo chegar — segundos, num vídeo
   longo. Nesse intervalo os campos continuavam clicáveis, e escrever num deles
   escrevia em `frames[i]` de uma lista que já não tinha o índice i: a anotação
   sumia e o console cuspia "Cannot set properties of undefined".

   As duas metades do conserto são cobradas aqui: a grade some junto (não há
   onde clicar), e a escrita passou a ir para o OBJETO do quadro (se alguém
   guardar o campo, escrever nele não derruba nada e não inventa anotação). */
{
  const TEXTO = 'anotação num campo que já saiu da tela';
  await pg.selectOption('#mode', 'count');
  await pg.fill('#count', '3');
  const r = await pg.evaluate(txt => {
    const campoVelho = document.querySelector('#thumbs input.nota');
    const antes = document.querySelectorAll('#thumbs figure').length;
    /* O clique aqui dentro, e não pelo Playwright: o manipulador roda até o
       primeiro `await`, e é dentro dessa mesma tarefa que a grade tem que
       esvaziar. Medir depois seria medir a varredura nova, não o conserto. */
    document.getElementById('extract').click();
    const logoDepois = document.querySelectorAll('#thumbs figure').length;
    campoVelho.value = txt;
    campoVelho.dispatchEvent(new Event('input', { bubbles: true }));
    return { antes, logoDepois, aindaNoDocumento: campoVelho.isConnected };
  }, TEXTO);
  console.log('\n  ao refazer a varredura:');
  linha('miniaturas antes do clique', r.antes);
  linha('miniaturas no mesmo instante depois', r.logoDepois);
  ok('a grade some no mesmo gesto em que a lista é esvaziada',
     r.logoDepois === 0, r.antes + ' → ' + r.logoDepois);
  ok('e o campo antigo saiu do documento junto', !r.aindaNoDocumento);
  await pg.waitForTimeout(500);
  const vazou = await pg.evaluate(txt => (window.__quadros() || []).some(q => q.nota === txt), TEXTO);
  ok('escrever no campo órfão não inventa anotação em quadro nenhum', !vazou);
  await pg.locator('#cancel').click().catch(() => {});
  await pg.waitForFunction(() => !document.getElementById('extract').disabled,
                           null, { timeout: 60000 });
}
ok('sem erro de JavaScript', erros.length === 0, erros.join(' | ').slice(0, 200));

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
