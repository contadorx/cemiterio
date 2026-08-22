/* O CARTÃO DA GRADE — a porta com nome, as setas que não somem, e a fala.
 *
 * O que o build 8 deixou por fazer, medido contra o produto:
 *
 * 1. A ÚNICA PORTA PARA METADE DAS FUNÇÕES ERA UM ÍCONE ESCONDIDO. Tarja,
 *    recorte, comparação, troca de imagem, clipe, hora, fronteira de tarefa e
 *    a fala editável moram todos na lente — e a lente só abria por um `⤢` com
 *    `opacity:0` até o mouse chegar em cima da miniatura. Num aparelho de
 *    toque não existe `:hover`: a metade cara da ferramenta era inalcançável,
 *    e nada na tela dizia que existia.
 *
 * 2. AS SETAS SUMIAM JUSTAMENTE ONDE PRECISAVAM SER EXPLICADAS. A seta
 *    desabilitada era `opacity:0 !important`. No primeiro quadro da fileira, a
 *    resposta da tela para "como movo isto para trás?" não era "não há para
 *    onde" — era o silêncio.
 *
 * 3. O CARTÃO NÃO DIZIA O QUE ESTAVA SENDO DITO. Numa gravação de sistema as
 *    telas são quase idênticas — mesma janela, mesmo menu — e `04:12` não
 *    distingue nada de `04:31`. O que distingue é a fala.
 *
 * O QUE ESTA RÉGUA NÃO PODE VIRAR: uma afirmação de aparência. Ela não mede
 * cor nem posição bonita. Mede (a) o botão respondendo sem hover nenhum,
 * (b) o controle desabilitado ainda tendo caixa, (c) o texto do cartão sendo
 * O MESMO que a lente mostra para aquele quadro, e (d) esse texto ACOMPANHANDO
 * um descarte — que é o defeito que um cache mal feito produziria.
 */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';

const ROOT = `${RAIZ_WS}/public`;
const html = fs.readFileSync(ROOT + '/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end('') }
  r.writeHead(200, {'Content-Type':'text/html'}); r.end(html);
});
await new Promise(r => srv.listen(8931, r));

const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++ };

const ctx = await br.newContext({ viewport: { width: 1250, height: 980 } });
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', e => erros.push(e.message));
await pg.goto('http://localhost:8931/app.html?lang=pt');
await pg.waitForTimeout(400);

/* ---------------------------------------------------------------- material */
await pg.selectOption('#modelo', 'evidencia');
await pg.setInputFiles('#file', '/tmp/amostra.webm');
/* Esperar o BOTÃO ficar clicável, e não um relógio. Um `waitForTimeout(2600)`
   passa na máquina que o escreveu e reprova na que decodifica devagar. */
await pg.waitForFunction(() => !document.getElementById('extract').disabled,
                         null, { timeout: 40000 });
await pg.selectOption('#mode', 'count'); await pg.fill('#count', '4');
await pg.locator('#extract').click();
await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length >= 4,
                         null, { timeout: 40000 });
await pg.waitForTimeout(500);

/* A transcrição é escrita CONTRA os instantes reais dos quadros, e não contra
   um relógio inventado: assim cada cartão tem uma frase só, conhecida pelo
   nome, e a afirmação pode ser de igualdade em vez de "contém alguma coisa". */
const ts = await pg.evaluate(() => window.__quadros().map(q => q.t));
const hh = v => {
  const m = Math.floor(v / 60), s = v - m * 60;
  return '00:' + String(m).padStart(2,'0') + ':' + s.toFixed(3).padStart(6,'0');
};
const vtt = 'WEBVTT\n\n' + ts.map((t, i) =>
  `${hh(t + 0.05)} --> ${hh(t + 0.60)}\nfala do quadro ${i + 1}`).join('\n\n') + '\n';
await pg.fill('#tr', vtt);
await pg.dispatchEvent('#tr', 'input');
await pg.waitForTimeout(700);

console.log('[1] a porta tem nome, e o nome está sempre à vista');
{
  const n = await pg.locator('#thumbs figure').count();
  ok('cada cartão tem uma', (await pg.locator('#thumbs .editar').count()) === n);
  const rot = (await pg.locator('#thumbs .editar').first().textContent() || '').trim();
  ok('e ela diz "Editar", não desenha uma lupa', rot === 'Editar', rot);
  /* O `title` é onde a descoberta acontece: "Editar" sozinho não conta que
     tarja e recorte moram ali dentro. */
  const tit = await pg.locator('#thumbs .editar').first().getAttribute('title') || '';
  for (const p of ['tarjar', 'recortar', 'comparar', 'clipe', 'fala'])
    ok(`o rótulo longo cita "${p}"`, tit.toLowerCase().includes(p), tit.slice(0, 90));

  /* O CORAÇÃO DESTA RÉGUA. O mouse é levado para longe da grade e NÃO volta.
     Com o desenho antigo o botão media opacidade 0 aqui e o teste reprovava —
     que é exatamente o que ele existe para fazer. */
  await pg.locator('#thumbs .editar').first().scrollIntoViewIfNeeded();
  /* A grade fica sob uma barra fixa no topo. Sem rolar primeiro, quem responde
     no ponto é a barra — e a pergunta aqui é sobre o cartão, não sobre ela. */
  await pg.evaluate(() => window.scrollBy(0, -90));
  await pg.mouse.move(4, 400);
  await pg.waitForTimeout(250);
  const est = await pg.locator('#thumbs .editar').first().evaluate(e => {
    const c = getComputedStyle(e), r = e.getBoundingClientRect();
    return { op: c.opacity, vis: c.visibility, pos: c.position,
             alt: Math.round(r.height), larg: Math.round(r.width),
             /* Quem responde ao dedo no meio do botão: ele mesmo, ou a imagem
                por baixo? Com o botão flutuando sobre a miniatura esta era a
                pergunta que ninguém tinha feito. */
             topo: (document.elementFromPoint(r.left + r.width / 2,
                                              r.top + r.height / 2) || {}).className };
  });
  ok('sem o mouse por perto, ela está opaca', est.op === '1', 'opacity ' + est.op);
  ok('e visível', est.vis === 'visible', est.vis);
  ok('não flutua por cima da imagem', est.pos !== 'absolute', est.pos);
  ok('tem alvo de toque de verdade', est.alt >= 22 && est.larg >= 40,
     `${est.larg}×${est.alt}px`);
  ok('e é ela que responde no centro dela', /editar/.test(est.topo || ''), est.topo);
  /* E abre mesmo, sem hover prévio: `click()` do Playwright move o mouse, mas
     a afirmação de opacidade acima já provou que não é o hover que a revela. */
  await pg.locator('#thumbs figure').first().locator('.editar').click();
  await pg.waitForSelector('#lente:not(.hide)', { timeout: 4000 });
  ok('e abre a lente', !(await pg.locator('#lente').evaluate(e => e.classList.contains('hide'))));
  await pg.locator('#lenteFechar').click(); await pg.waitForTimeout(300);
}

console.log('\n[2] nas pontas, a seta fica apagada — não sumida');
{
  await pg.mouse.move(4, 4); await pg.waitForTimeout(200);
  const n = await pg.locator('#thumbs figure').count();
  const pri = await pg.locator('#thumbs figure').first().locator('.mover.esq').evaluate(e => {
    const c = getComputedStyle(e), r = e.getBoundingClientRect();
    return { off: e.disabled, op: parseFloat(c.opacity), disp: c.display, alt: Math.round(r.height) };
  });
  ok('no primeiro quadro ela está desabilitada', pri.off === true);
  ok('e ainda assim tem caixa', pri.disp !== 'none' && pri.alt >= 20, `${pri.disp} ${pri.alt}px`);
  ok('e ainda assim se enxerga', pri.op > 0.1, 'opacity ' + pri.op);
  const ult = await pg.locator('#thumbs figure').nth(n - 1).locator('.mover.dir').evaluate(e => ({
    off: e.disabled, op: parseFloat(getComputedStyle(e).opacity) }));
  ok('no último quadro, a seta da direita idem', ult.off === true && ult.op > 0.1,
     `disabled ${ult.off}, opacity ${ult.op}`);
  /* E a do meio continua funcionando: um controle sempre visível que não move
     nada seria pior que o escondido. */
  const meio = pg.locator('#thumbs figure').nth(1).locator('.mover.dir');
  ok('a do meio está habilitada', !(await meio.evaluate(e => e.disabled)));
}

console.log('\n[3] o cartão diz o que estava sendo dito ali');
{
  await pg.waitForTimeout(300);
  const n = await pg.locator('#thumbs figure').count();
  ok('todo cartão mantido tem a linha da fala',
     (await pg.locator('#thumbs .fala').count()) === n,
     `${await pg.locator('#thumbs .fala').count()} de ${n}`);
  for (let i = 0; i < n; i++) {
    const txt = (await pg.locator('#thumbs figure').nth(i).locator('.fala').textContent() || '').trim();
    ok(`o cartão ${i + 1} traz a fala do quadro ${i + 1}`, txt === `fala do quadro ${i + 1}`, txt);
  }
  /* A MESMA HISTÓRIA NOS DOIS LUGARES. Um resumo no cartão que não batesse com
     o texto editável da lente seria evidência se contradizendo dentro da
     própria ferramenta. */
  await pg.locator('#thumbs figure').nth(2).locator('.editar').click();
  await pg.waitForSelector('#lente:not(.hide)', { timeout: 4000 });
  await pg.waitForTimeout(300);
  const naLente = (await pg.locator('#lenteFalas input').first().inputValue() || '').trim();
  ok('e a lente conta a mesma coisa', naLente === 'fala do quadro 3', naLente);
  await pg.locator('#lenteFechar').click(); await pg.waitForTimeout(300);
}

console.log('\n[4] descartar um quadro reabre a janela do anterior');
{
  /* ESTE É O TESTE DO CACHE. A fala de um cartão depende de duas coisas: do
     texto da transcrição e de QUAIS quadros continuam mantidos. Guardar o mapa
     pronto pela transcrição faria o cartão 1 continuar dizendo só a fala 1
     depois de o quadro 2 ser descartado — o texto do meio simplesmente
     evaporaria do documento e da tela, sem nada avisando. */
  const antes = (await pg.locator('#thumbs figure').nth(0).locator('.fala').textContent() || '').trim();
  await pg.locator('#thumbs figure').nth(1).locator('.toque').click();
  await pg.waitForTimeout(500);
  ok('o quadro 2 saiu', await pg.locator('#thumbs figure').nth(1).evaluate(e => e.classList.contains('off')));
  const depois = (await pg.locator('#thumbs figure').nth(0).locator('.fala').textContent() || '').trim();
  ok('e a fala dele passou para o cartão anterior',
     depois === 'fala do quadro 1 fala do quadro 2', `antes "${antes}" · depois "${depois}"`);
  ok('o cartão descartado não mostra mais fala',
     (await pg.locator('#thumbs figure').nth(1).locator('.fala').count()) === 0);
  /* E a fileira de ações de um descartado fica no lugar, vazia: escondê-la
     mudaria a altura do cartão e desalinharia a grade a cada descarte. */
  const acoes = await pg.locator('#thumbs figure').nth(1).locator('.acoes').evaluate(e => {
    const c = getComputedStyle(e); return { vis: c.visibility, alt: Math.round(e.getBoundingClientRect().height) };
  });
  ok('sem controle à vista', acoes.vis === 'hidden', acoes.vis);
  ok('mas sem encolher o cartão', acoes.alt >= 20, acoes.alt + 'px');
  await pg.locator('#thumbs figure').nth(1).locator('.toque').click();
  await pg.waitForTimeout(400);
}

console.log('\n[5] a grade repinta quando a transcrição chega');
{
  /* Colar uma transcrição não passa por `render()`. Sem uma repintura, quarenta
     cartões ficavam mudos com o texto na tela logo ao lado — e a conclusão de
     quem olha é que a ferramenta não pareou nada. */
  await pg.fill('#tr', '');
  await pg.dispatchEvent('#tr', 'input');
  await pg.waitForTimeout(600);
  ok('sem transcrição, nenhum cartão fala', (await pg.locator('#thumbs .fala').count()) === 0);
  await pg.fill('#tr', vtt);
  await pg.dispatchEvent('#tr', 'input');
  await pg.waitForTimeout(700);
  ok('e a fala volta sozinha ao colar de novo',
     (await pg.locator('#thumbs .fala').count()) === (await pg.locator('#thumbs figure').count()));
}

console.log('\n[6] o resto do cartão continua inteiro');
{
  /* A anotação NÃO foi para dentro de `Editar`. A proposta pedia isso contra um
     cartão que ela imaginava lotado; medido, o cartão tem imagem, legenda e um
     campo. Anotar é O trabalho desta etapa, e um trabalho que exige abrir um
     diálogo por quadro é um trabalho que ninguém faz quarenta vezes. */
  ok('o campo da anotação continua no cartão',
     (await pg.locator('#thumbs .nota').count()) === (await pg.locator('#thumbs figure').count()));
  await pg.locator('#thumbs .nota').first().click();
  await pg.locator('#thumbs .nota').first().type('conferido');
  await pg.waitForTimeout(400);
  ok('e ainda aceita digitação tecla a tecla',
     (await pg.evaluate(() => window.__quadros()[0].nota)) === 'conferido',
     await pg.evaluate(() => window.__quadros()[0].nota));
  ok('a legenda mantém o número do passo',
     /Passo 1/.test(await pg.locator('#thumbs figure').first().locator('.passo').textContent() || ''),
     await pg.locator('#thumbs figure').first().locator('.passo').textContent());
}

console.log('\n[7] nada disso quebrou o JS');
ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 200));

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nCartão da grade: tudo passou.');
process.exit(falhas ? 1 : 0);
