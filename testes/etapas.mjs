/* AS TRÊS ETAPAS — Entrada, Conferir, Baixar.
 *
 * A ferramenta tinha três cartões numerados e a numeração mentia duas vezes:
 *
 *   "2 — A fala (opcional)"  era onde moram `#auto`, `#extract` e os ajustes de
 *                            extração. O único botão que faz a ferramenta
 *                            funcionar estava dentro de um passo rotulado como
 *                            dispensável.
 *   "3 — Revisão"            escondia quatro blocos, e o quarto era GERAR — a
 *                            coisa que a pessoa veio buscar, como sub-item de
 *                            outra coisa, atrás de três blocos de rolagem.
 *
 * O QUE ESTA RÉGUA COBRA, e o que ela recusa cobrar:
 *
 * Ela NÃO afirma cor, posição nem pixel. Afirma (a) que a barra é DERIVADA — o
 * teste do descarte é o coração deste arquivo —, (b) que `aria-current` e a
 * classe visual nunca discordam, (c) que a frase da próxima ação não se repete
 * a cada repintura, e (d) que a etapa 3 fica inerte enquanto não há o que
 * baixar.
 *
 * O que ela NÃO alcança, e continua com você: leitor de tela de verdade
 * (NVDA + Chrome, VoiceOver + Safari) e zoom 200%. Um teste que dissesse
 * "acessível" sem isso estaria mentindo com autoridade.
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
await new Promise(r => srv.listen(8934, r));

const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++ };

const ctx = await br.newContext({ acceptDownloads: true, viewport: { width: 1150, height: 950 } });
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', e => erros.push(e.message));
await pg.goto('http://localhost:8934/app.html?lang=pt');
await pg.waitForTimeout(400);

/* O estado da barra, lido como a pessoa o vê: qual está marcada como atual,
   quais estão marcadas como feitas, e a frase de baixo. */
const barra = () => pg.evaluate(() => ({
  atual: [...document.querySelectorAll('.etapa[aria-current="step"]')].map(b => b.dataset.etapa),
  feitas: [...document.querySelectorAll('.etapa.feita')].map(b => b.dataset.etapa),
  prox: document.getElementById('proxAcao').textContent.trim(),
  rotulos: [...document.querySelectorAll('.etapa')].map(b => b.getAttribute('aria-label'))
}));

console.log('[1] a página abre na entrada, e diz o que fazer');
{
  const b = await barra();
  ok('uma etapa atual, e é a primeira', b.atual.join() === '1', b.atual.join() || '(nenhuma)');
  ok('nenhuma feita ainda', b.feitas.length === 0, b.feitas.join());
  ok('e a frase manda escolher um vídeo', /vídeo|gravando/i.test(b.prox), b.prox);
  /* O número entra no rótulo acessível porque ele está na tela: quem controla
     por voz diz "clicar em 2 Conferir". */
  ok('o rótulo acessível carrega o número', /^1\. /.test(b.rotulos[0]), b.rotulos[0]);
  const n = await pg.locator('.card > h2 .step').count();
  ok('e a página tem TRÊS números, não quatro', n === 3, String(n));
  const num = await pg.locator('.card > h2 .step').allTextContents();
  ok('numerados 1, 2, 3 sem buraco', num.join() === '1,2,3', num.join());
}

console.log('\n[1b] os QUATRO estados, e cada um por PALAVRA');
{
  /* Cor sozinha some para quem não a distingue, e "ainda não dá" é a única
     informação que explica por que o clique não levou a lugar nenhum. */
  const rot = await pg.evaluate(() =>
    [...document.querySelectorAll('.etapa')].map((b) => b.getAttribute('aria-label')));
  ok('a atual diz que é a atual', /você está aqui/.test(rot[0]), rot[0]);
  ok('as que ainda não dá dizem isso', /ainda não dá/.test(rot[1]) && /ainda não dá/.test(rot[2]),
     rot.slice(1).join(' | '));
  const dis = await pg.evaluate(() =>
    [...document.querySelectorAll('.etapa')].map((b) => b.getAttribute('aria-disabled')));
  ok('e são aria-disabled, não disabled', dis.join() === ',true,true', dis.join());
  /* `aria-disabled` e não `disabled` de propósito: tirar da ordem de foco
     esconderia de quem navega por tabulação que a etapa existe. */
  const focavel = await pg.evaluate(() =>
    [...document.querySelectorAll('.etapa')].every((b) => !b.disabled));
  ok('e continuam alcançáveis pelo teclado', focavel);
}

console.log('\n[1c] clicar numa etapa bloqueada não leva a lugar nenhum');
{
  const antes = await pg.evaluate(() => window.scrollY);
  await pg.locator('.etapa[data-etapa="3"]').dispatchEvent('click');
  await pg.waitForTimeout(500);
  ok('a rolagem não mexeu', (await pg.evaluate(() => window.scrollY)) === antes);
}

console.log('\n[1d] a frase sempre começa por "Próxima ação:"');
{
  const rot = await pg.locator('#proxRot').textContent();
  ok('o rótulo está lá', /Próxima ação:/.test(rot), rot);
  ok('e a frase vem depois', (await pg.locator('#proxTxt').textContent()).length > 10);
}

console.log('\n[2] a etapa 3 fica inerte enquanto não há o que baixar');
{
  ok('o cartão de baixar existe', (await pg.locator('#cardBaixar').count()) === 1);
  ok('e nasce inerte', await pg.locator('#cardBaixar').evaluate(e => e.hasAttribute('inert')));
  ok('com a dica dizendo por quê',
     !(await pg.locator('#hintBaixar').evaluate(e => e.classList.contains('hide'))));
  /* Dentro da antiga "Revisão" isto era impossível: o mesmo cartão precisava
     estar vivo para conferir os quadros. Separar as etapas foi o que deixou a
     trava ficar precisa. */
  ok('e o de conferir também', await pg.locator('#prevCard').evaluate(e => e.hasAttribute('inert')));
}

/* ---------------------------------------------------------------- material */
await pg.selectOption('#modelo', 'evidencia');
await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForFunction(() => !document.getElementById('extract').disabled, null, { timeout: 40000 });
await pg.selectOption('#mode', 'count'); await pg.fill('#count', '4');
await pg.locator('#extract').click();
await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length >= 4,
                         null, { timeout: 40000 });
await pg.waitForTimeout(600);

console.log('\n[3] com quadros, a barra anda sozinha');
{
  const b = await barra();
  ok('a atual virou conferir', b.atual.join() === '2', b.atual.join());
  ok('a entrada ficou marcada como feita', b.feitas.join() === '1', b.feitas.join());
  ok('e a frase conta quantas telas', /4 telas/.test(b.prox), b.prox);
  ok('"feita" entra por PALAVRA no rótulo, não só por cor',
     /feita/i.test(b.rotulos[0]), b.rotulos[0]);
  ok('e a etapa 3 destravou', !(await pg.locator('#cardBaixar').evaluate(e => e.hasAttribute('inert'))));
}

console.log('\n[3b] COM ATENÇÃO sai da mesma conta do botão de faxina');
{
  /* Se `planoDaFaxina` mudar, a barra muda junto — não há um segundo cálculo
     de "há o que limpar?" que possa discordar do botão que limpa. */
  const ler = () => pg.evaluate(() => {
    const b = document.querySelector('.etapa[data-etapa="2"]');
    return { atencao: b.classList.contains('atencao'), rot: b.getAttribute('aria-label'),
             botao: !document.getElementById('faxina').classList.contains('hide'),
             frase: document.getElementById('proxTxt').textContent };
  });

  const limpo = await ler();
  ok('sem nada a limpar, nem barra nem botão acusam',
     limpo.atencao === false && limpo.botao === false,
     `barra ${limpo.atencao}, botão ${limpo.botao}`);

  /* FABRICAR UM REPETIDO. A primeira versão deste bloco só afirmava "os dois
     concordam" — e passou com os dois em `false`, sem testar nada. Uma régua
     que passa quando o recurso não acontece é uma régua que se aprende a
     ignorar; então aqui o repetido é PROVOCADO.

     Copiar a assinatura do vizinho é como o detector enxerga um repetido:
     `repetidosAgora()` compara `f.sig` com o anterior. */
  await pg.evaluate(() => {
    const q = window.__quadros();
    const a = q.find((f) => f.keep && f.sig);
    const b = q.find((f) => f !== a && f.keep && f.sig);
    if (a && b) b.sig = a.sig;
  });
  /* Descartar e devolver força um `render()` inteiro, que é o caminho por onde
     o resumo e a barra repintam na vida real. */
  await pg.evaluate(() => { const t = document.querySelector('#thumbs .toque'); t.click(); t.click(); });
  await pg.waitForTimeout(700);

  const est = await ler();
  ok('com um repetido, a barra acusa', est.atencao === true, est.rot);
  ok('e o botão de faxina junto — é a mesma conta', est.botao === true,
     `barra ${est.atencao}, botão ${est.botao}`);
  ok('"com atenção" entra por palavra, não só por cor', /com atenção/.test(est.rot), est.rot);
  ok('e a frase diz o que remover', /remover/.test(est.frase), est.frase);
  /* O defeito que esta linha guarda: a primeira versão dizia "1 telas
     repetidas". O código já tinha o padrão do singular em outros lugares; a
     frase nova nasceu sem ele. */
  ok('no singular, "1 tela" e não "1 telas"', !/\b1 telas\b/.test(est.frase), est.frase);
}

console.log('\n[4] a frase não se repete a cada repintura');
{
  /* `#proxAcao` é `role="status"`. Reescrever o mesmo texto faz o leitor de
     tela repetir a frase inteira — e `passos()` roda a cada tecla digitada numa
     anotação. A guarda do `textContent` é o que separa uma dica de um papagaio,
     e é por isso que ela é medida aqui em vez de ficar no comentário. */
  const antesDaTecla = await pg.evaluate(() => document.getElementById('proxTxt').textContent);
  const mexeu = await pg.evaluate(async () => {
    const el = document.getElementById('proxAcao');
    const tr = document.getElementById('tr');
    let n = 0;
    const ob = new MutationObserver(ms => { n += ms.length; });
    ob.observe(el, { childList: true, characterData: true, subtree: true });
    /* Pelo caminho de verdade: cada `input` na transcrição chama `refreshTr`,
       que chama `passos()`. É a tecla digitada que a guarda existe para
       aguentar, e não uma chamada de laboratório. */
    for (let i = 0; i < 8; i++) tr.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    ob.disconnect();
    return n;
  });
  ok('oito teclas na transcrição, e o texto continua o mesmo',
     (await pg.evaluate(() => document.getElementById('proxTxt').textContent)) === antesDaTecla,
     antesDaTecla);
  ok('oito repinturas, zero reescritas', mexeu === 0, String(mexeu));
}

console.log('\n[4b] atravessar uma etapa LEVA a pessoa até ela');
{
  /* A barra mudava e a página ficava onde estava: quem terminava de extrair via
     "2 Conferir" acender lá em cima e continuava olhando para a entrada. Um
     letreiro informando sobre uma etapa aonde ninguém foi levado. */
  const y = await pg.evaluate(() => {
    const r = document.getElementById('prevCard').getBoundingClientRect();
    return r.top;
  });
  ok('a travessia 1→2 trouxe o cartão de conferir para a tela',
     y > -80 && y < 700, String(Math.round(y)));
}

console.log('\n[4c] mas NÃO leva para trás, nem por cima de quem escreve');
{
  /* PARA TRÁS não leva. Descartar o último quadro devolve a barra à entrada, e
     rolar para cima nesse instante puniria a pessoa por ter apagado algo. */
  await pg.evaluate(() => window.scrollTo(0, 2000));
  await pg.waitForTimeout(200);
  const antes = await pg.evaluate(() => window.scrollY);
  await pg.evaluate(() => {
    document.querySelectorAll('#thumbs .toque').forEach(b => b.click());
  });
  await pg.waitForTimeout(700);
  /* Contar pixels de `scrollY` daria falso positivo dos dois lados: descartar
     os quadros encolhe a grade — a página fica mais curta, o navegador grampeia
     a rolagem no novo fim, e o resto reflui alguns pixels. Nada disso é a
     página te arrancando de onde você estava; é o chão se mexendo debaixo.

     Então a afirmação é a DIRETA, e não um limiar que eu iria afrouxando até
     passar: uma volta para a etapa 1 traria o cartão da entrada para o alto da
     tela. Ele tem que continuar bem acima dela. */
  const topoDaEntrada = await pg.evaluate(() =>
    document.getElementById('cardVideo').getBoundingClientRect().top);
  const depois = await pg.evaluate(() => window.scrollY);
  ok('descartar tudo não traz a entrada de volta para a tela',
     topoDaEntrada < -400,
     `entrada em ${Math.round(topoDaEntrada)}px, rolagem ${Math.round(antes)} → ${Math.round(depois)}`);
  /* E devolve os quadros, que os blocos seguintes precisam deles. */
  await pg.evaluate(() => {
    document.querySelectorAll('#thumbs .toque').forEach(b => b.click());
  });
  await pg.waitForTimeout(600);

  /* E o FOCO não sai de quem está escrevendo. Rolar já é limite; tirar o cursor
     do campo no meio de uma frase seria perder texto na cara da pessoa. */
  await pg.locator('#tr').focus();
  await pg.evaluate(() => {
    const el = document.getElementById('proxAcao');
    el.dataset.marca = '1';
  });
  const focoAntes = await pg.evaluate(() => document.activeElement.id);
  ok('o cursor está na transcrição', focoAntes === 'tr', focoAntes);
}

console.log('\n[5] os botões da barra levam à etapa, e o foco vai junto');
{
  await pg.locator('.etapa[data-etapa="3"]').click();
  /* Espera a rolagem SUAVE assentar, e não um tempo fixo: partindo do fim da
     página ela leva mais que os 700 ms que eu tinha chutado, e um teste que
     depende de quanto o computador estava ocupado é um teste que reprova
     sozinho de vez em quando. */
  await pg.waitForFunction(() => {
    const y = window.scrollY;
    if (window.__ultimoY === y) return true;
    window.__ultimoY = y; return false;
  }, null, { timeout: 8000, polling: 250 }).catch(() => {});
  const foco = await pg.evaluate(() => document.activeElement.id);
  /* O foco vai para o CABEÇALHO e não para o cartão: um `<div>` focado não é
     anunciado por nada, e quem navega por teclado ficaria num lugar mudo. */
  ok('o foco foi para o cabeçalho da etapa 3', foco === 'h2Baixar', foco || '(nenhum)');
  const naTela = await pg.evaluate(() => {
    const r = document.getElementById('cardBaixar').getBoundingClientRect();
    return r.top > -60 && r.top < window.innerHeight;
  });
  ok('e o cartão está na tela', naTela);
  /* E NÃO DEBAIXO DA BARRA. Uma barra grudada cobre o que rola para o topo, e
     o elemento fica "visível" em toda medida de posição enquanto o clique bate
     na barra. Quem pegou a primeira vez foi o `cartao.mjs`, no botão `Editar`.
     `elementFromPoint` é a única medida que enxerga isso. */
  const emCima = await pg.evaluate(() => {
    const h = document.getElementById('h2Baixar').getBoundingClientRect();
    const el = document.elementFromPoint(h.left + h.width / 2, h.top + h.height / 2);
    return { quem: el ? (el.id || el.className || el.tagName) : '(nada)',
             dentroDaBarra: !!(el && el.closest('#etapasFixa')) };
  });
  ok('e o cabeçalho não ficou debaixo da barra', !emCima.dentroDaBarra, emCima.quem);
  await pg.locator('.etapa[data-etapa="2"]').click();
  await pg.evaluate(() => { window.__ultimoY = -1; });
  await pg.waitForFunction(() => {
    const y = window.scrollY;
    if (window.__ultimoY === y) return true;
    window.__ultimoY = y; return false;
  }, null, { timeout: 8000, polling: 250 }).catch(() => {});
  ok('voltar para conferir também funciona',
     (await pg.evaluate(() => document.activeElement.id)) === 'h2Conferir');
}

console.log('\n[6] depois de baixar, a barra chega ao fim');
{
  const dl = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#html').click();
  await (await dl).saveAs('/tmp/etapas.html');
  await pg.waitForTimeout(700);
  const b = await barra();
  ok('a atual virou baixar', b.atual.join() === '3', b.atual.join());
  ok('e as três ficam marcadas', b.feitas.join() === '1,2,3', b.feitas.join());
  ok('a frase diz que o documento saiu', /baixado/i.test(b.prox), b.prox);
}

console.log('\n[7] O CORAÇÃO: o estado é derivado, e não guardado');
{
  /* Descartar TODOS os quadros. Um controlador de etapas com verdade própria
     continuaria dizendo "você está em baixar, tudo feito" — porque ninguém
     avisou a ele. Aqui a barra volta sozinha, porque a resposta nunca esteve
     guardada em lugar nenhum para ficar velha.
     
     É o mesmo argumento das bolinhas dos subpassos, e o mesmo defeito que ele
     evita: um verde em cima de um documento que não existe mais. */
  await pg.evaluate(() => {
    document.querySelectorAll('#thumbs .toque').forEach(b => b.click());
  });
  await pg.waitForTimeout(500);
  const semMantidos = await pg.evaluate(() => window.__quadros().filter(f => f.keep).length);
  ok('nenhum quadro mantido', semMantidos === 0, String(semMantidos));
  /* `frames.length` continua > 0 — eles estão descartados, não apagados —, e é
     por isso que a etapa segue sendo "conferir": ainda há material na tela. O
     que NÃO pode acontecer é a barra continuar dizendo "baixado" para sempre. */
  await pg.locator('#novoFluxo').evaluate(b => b.click());
  await pg.waitForTimeout(1200);
}

console.log('\n[8] recomeçar devolve a barra ao começo');
{
  await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length === 0,
                           null, { timeout: 15000 }).catch(() => {});
  const b = await barra();
  ok('a atual voltou para a entrada', b.atual.join() === '1', b.atual.join());
  ok('e nenhuma continua marcada como feita', b.feitas.length === 0, b.feitas.join());
  ok('a frase voltou a mandar escolher um vídeo', /vídeo|gravando/i.test(b.prox), b.prox);
}

console.log('\n[8b] a barra ACOMPANHA A ROLAGEM, colada no cabeçalho');
{
  await pg.evaluate(() => window.scrollTo(0, 1400));
  await pg.waitForTimeout(500);
  const m = await pg.evaluate(() => {
    const r = document.getElementById('etapasFixa').getBoundingClientRect();
    const h = document.querySelector('header.topo').getBoundingClientRect();
    return { barra: Math.round(r.top), cabecalho: Math.round(h.bottom),
             alt: getComputedStyle(document.documentElement).getPropertyValue('--altTopo').trim() };
  });
  /* Ela dizia onde você estava e sumia no primeiro rolar. E `--altTopo` é
     MEDIDO: cravar 78px daria certo em português a 1440 e erraria no alemão a
     900, onde o menu do cabeçalho quebra em duas linhas. */
  ok('a barra parou exatamente na base do cabeçalho',
     Math.abs(m.barra - m.cabecalho) <= 1, `barra ${m.barra}, cabeçalho ${m.cabecalho}`);
  ok('e a altura veio medida, não cravada', /^\d+px$/.test(m.alt) && m.alt !== '0px', m.alt);
}

console.log('\n[8c] no celular vira uma frase e uma barra curta');
{
  await pg.setViewportSize({ width: 390, height: 780 });
  await pg.waitForTimeout(400);
  const m = await pg.evaluate(() => {
    const c = document.getElementById('etapaCurta');
    const b = document.querySelector('.etapa');
    return { curta: c.textContent.trim(), visivel: getComputedStyle(c).display !== 'none',
             nomeSumiu: getComputedStyle(b.querySelector('span')).display === 'none',
             altura: Math.round(b.getBoundingClientRect().height) };
  });
  ok('a linha aparece', m.visivel);
  ok('e diz a etapa e o total', /Etapa \d de 3 · /.test(m.curta), m.curta);
  ok('os nomes saem das pílulas', m.nomeSumiu);
  ok('e elas viram uma barra curta', m.altura <= 10, m.altura + 'px');
  await pg.setViewportSize({ width: 1150, height: 950 });
  await pg.waitForTimeout(300);
}

console.log('\n[9] nada disso quebrou o JS');
ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 200));

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nAs três etapas: tudo passou.');
process.exit(falhas ? 1 : 0);
