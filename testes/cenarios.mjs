/* O cenário no passo 1, o quinto cenário, e as cinco páginas de caso de uso. */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';
import { criarProxy, exigirNext } from './proxy.mjs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
await exigirNext();

const ROOT = `${RAIZ_WS}/public`;
const tipos = { '.css':'text/css', '.svg':'image/svg+xml', '.js':'text/javascript', '.ico':'image/x-icon' };
const jspdf = fs.readFileSync(`${RAIZ_WS}/vendor/jspdf.umd.min.js`, 'utf8');
/* O site virou Next.js: as páginas não existem mais como arquivo em public/.
   O servidorzinho estático daqui virou um encaminhador para o Next — mesma
   porta, mesmas URLs no teste, e quem responde é o produto de verdade. */
const srv = criarProxy();
await new Promise(r => srv.listen(8921, r));

const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, extra) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (extra ? '  → ' + extra : '')); if (!c) falhas++; };
const ctx = await br.newContext({ acceptDownloads: true, locale: 'pt-BR', viewport: { width: 1250, height: 950 } });

console.log('[1] o cenário é a primeira coisa do passo 1');
{
  const pg = await ctx.newPage();
  const erros = []; pg.on('pageerror', e => erros.push(e.message));
  await pg.route('**/jspdf**', r => r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
  await pg.goto('http://localhost:8921/app.html?lang=pt');
  await pg.waitForTimeout(400);
  ok('o seletor mora no cartão 1', (await pg.locator('#cardVideo #modelo').count()) === 1);
  ok('e não mora mais na revisão', (await pg.locator('#prevCard #modelo').count()) === 0);
  /* Antes de qualquer coisa: sem vídeo, sem gravação, sem nada. */
  ok('dá para escolher antes de gravar', !(await pg.locator('#modelo').isDisabled()));
  ok('a explicação aparece ao lado', (await pg.locator('#cenDica').textContent()).length > 30);
  ok('e o nome do quadro ficou na revisão', (await pg.locator('#prevCard #unNome').count()) === 1);

  const vals = await pg.locator('#modelo option').evaluateAll(o => o.map(x => x.value));
  /* Seis opções, cinco cenários: a primeira é um PEDIDO, e não um cenário.
     Ela vale '' e é `disabled` — não se volta a ela por engano depois de
     escolher, porque "nenhum cenário" no meio do caminho produziria documento
     sem formato. */
  /* Sete opções: o pedido, os cinco cenários que a gente conhece, e "Outro".
     Uma lista fechada não impede o uso fora dela — só faz a pessoa mentir na
     resposta e receber um documento com cara de outra coisa. */
  ok('o pedido, cinco cenários e o Outro', vals.length === 7, vals.join(','));
  ok('e o pedido vale vazio', vals[0] === '');
  ok('"Outro" é o último, porque é a saída e não uma opção do meio',
     vals[vals.length - 1] === 'outro');
  ok('inclui o teste de usabilidade', vals.includes('usabilidade'));
  ok('nenhum cenário vem escolhido de fábrica',
     (await pg.locator('#modelo').inputValue()) === '',
     JSON.stringify(await pg.locator('#modelo').inputValue()));
  ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 150));
  await pg.close();
}

console.log('\n[2] o cenário de usabilidade muda o documento inteiro');
{
  const pg = await ctx.newPage();
  const erros = []; pg.on('pageerror', e => erros.push(e.message));
  await pg.route('**/jspdf**', r => r.fulfill({status:200,headers:{'content-type':'text/javascript'},body:jspdf}));
  await pg.goto('http://localhost:8921/app.html?lang=pt');
  await pg.selectOption('#modelo', 'usabilidade');
  await pg.waitForTimeout(300);
  ok('a dica fala de participante', /participante/i.test(await pg.locator('#cenDica').textContent()));
  ok('o objetivo do prompt vira o relatório da sessão',
     (await pg.locator('#goal').inputValue()) === 'sessao',
     await pg.locator('#goal').inputValue());
  ok('e ele está na lista de objetivos',
     (await pg.locator('#goal option').allTextContents()).some(t => /relat[óo]rio da sess/i.test(t)));

  await pg.setInputFiles('#file', '/tmp/amostra.webm');
  await pg.waitForTimeout(2500);
  await pg.selectOption('#mode', 'count'); await pg.fill('#count', '2');
  await pg.locator('#extract').click();
  await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length >= 2, null, { timeout: 40000 });
  await pg.waitForTimeout(400);

  ok('o quadro se chama Momento',
     /Momento 1/.test(await pg.locator('#thumbs figcaption .passo').first().textContent()),
     await pg.locator('#thumbs figcaption .passo').first().textContent());
  ok('o bloco de identificação aparece', await pg.locator('#evBox').isVisible());
  ok('e pede o código do participante, não o nome',
     /[Cc][óo]digo do participante/.test(await pg.locator('#lblChamado').textContent()),
     await pg.locator('#lblChamado').textContent());
  ok('e o estudo no lugar do caso de teste',
     /Estudo/.test(await pg.locator('#lblCaso').textContent()), await pg.locator('#lblCaso').textContent());
  ok('sem resultado passou/falhou — isso é de evidência', await pg.locator('#cxRes').evaluate(e => e.classList.contains('hide')));

  const dl = pg.waitForEvent('download', { timeout: 40000 });
  await pg.locator('#go').click();
  const d = await dl;
  ok('o arquivo sai com o prefixo do cenário', /^sessao/.test(d.suggestedFilename()), d.suggestedFilename());
  ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 150));
  await pg.close();
}

console.log('\n[3] o link pré-configurado alcança o cenário novo');
{
  const pg = await ctx.newPage();
  await pg.goto('http://localhost:8921/app.html?lang=pt&modelo=usabilidade&caso=Estudo%20de%20checkout');
  await pg.waitForTimeout(600);
  ok('o cenário veio do link', (await pg.locator('#modelo').inputValue()) === 'usabilidade');
  ok('e o campo também', (await pg.locator('#evCaso').inputValue()) === 'Estudo de checkout');
  await pg.close();
}

console.log('\n[4] as cinco páginas existem nos três idiomas');
{
  const pg = await ctx.newPage();
  const paginas = [
    ['/evidencia-de-teste', 'Evidência de teste'], ['/instrucao-de-trabalho', 'Instrução de trabalho'],
    ['/ata-de-reuniao', 'Ata de reunião'], ['/contexto-para-ia', 'a IA consegue ler'],
    ['/teste-de-usabilidade', 'usabilidade'],
    ['/en/test-evidence', 'Test evidence'], ['/en/work-instruction', 'Work instruction'],
    ['/en/meeting-minutes', 'Meeting minutes'], ['/en/context-for-ai', 'AI can actually read'],
    ['/en/usability-test', 'usability session'],
    ['/es/evidencia-de-prueba', 'Evidencia de prueba'], ['/es/instruccion-de-trabajo', 'Instrucción de trabajo'],
    ['/es/acta-de-reunion', 'Acta de reunión'], ['/es/contexto-para-ia', 'la IA sí puede leer'],
    ['/es/prueba-de-usabilidad', 'sesión de usabilidad'],
  ];
  for (const [u, marca] of paginas) {
    const r = await pg.goto('http://localhost:8921' + u);
    const h1 = await pg.locator('h1').textContent();
    ok(u, r.status() === 200 && h1.includes(marca), h1.slice(0, 40));
  }
  const sm = fs.readFileSync(ROOT + '/sitemap-paginas.xml', 'utf8');
  ok('as quinze estão no sitemap',
     paginas.every(([u]) => sm.includes(u + '<')));
  await pg.close();
}

console.log('\n[5] cada página leva ao cenário certo dentro da ferramenta');
{
  const pg = await ctx.newPage();
  for (const [u, modelo] of [['/evidencia-de-teste','evidencia'], ['/instrucao-de-trabalho','tutorial'],
                             ['/ata-de-reuniao','ata'], ['/contexto-para-ia','ia'],
                             ['/teste-de-usabilidade','usabilidade']]) {
    await pg.goto('http://localhost:8921' + u);
    const href = await pg.locator('a.btn').first().getAttribute('href');
    ok(u + ' → ?modelo=' + modelo, href.includes('modelo=' + modelo), href.slice(-40));
  }
  await pg.close();
}

console.log('\n[6] a home apresenta os cinco');
{
  const pg = await ctx.newPage();
  await pg.goto('http://localhost:8921/');
  await pg.waitForTimeout(300);
  ok('a seção existe', (await pg.locator('#casos').count()) === 1);
  ok('com cinco cartões', (await pg.locator('.caso').count()) === 5);
  const hrefs = await pg.locator('.caso').evaluateAll(a => a.map(x => x.getAttribute('href')));
  ok('e cada um aponta para a sua página', hrefs.every(h => h && h.length > 4) && new Set(hrefs).size === 5,
     hrefs.join(' '));
  await pg.close();
}

console.log('\n[7] preços: três planos, três moedas, mesma altura');
{
  const pg = await ctx.newPage();
  await pg.goto('http://localhost:8921/precos');
  await pg.waitForTimeout(300);
  ok('são três cartões', (await pg.locator('.plan').count()) === 3);
  const nomes = await pg.locator('.plan h3').allTextContents();
  ok('Free, Personal e Team', JSON.stringify(nomes) === JSON.stringify(['Free','Personal','Team']), nomes.join(','));
  const alturas = await pg.locator('.plan').evaluateAll(e => e.map(x => Math.round(x.getBoundingClientRect().height)));
  ok('os três têm a mesma altura', new Set(alturas).size === 1, alturas.join(' / '));
  const moedas = await pg.locator('.plan .moedas').allTextContents();
  ok('cada um traz dólar e euro', moedas.length === 3 && moedas.every(m => /US\$/.test(m) && /€/.test(m)),
     moedas.join(' | '));
  const itens = await pg.locator('.plan ul').evaluateAll(u => u.map(x => x.children.length));
  ok('e a lista de cada um é curta', itens.every(n => n <= 6), itens.join('/'));
  ok('nenhum cartão é muito mais longo que o outro',
     Math.max(...itens) - Math.min(...itens) <= 1, itens.join('/'));
  ok('o que não existe está marcado', (await pg.locator('.plan .soon').count()) > 0);
  await pg.close();
}

await br.close(); srv.close();
console.log(falhas ? '\n' + falhas + ' falha(s)' : '\nCenários e páginas: tudo passou.');
process.exit(falhas ? 1 : 0);
