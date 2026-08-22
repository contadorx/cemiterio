/* A ESPERA DE QUARENTA MINUTOS, e as cinco coisas que ela mudou.
 *
 * O RELATO, de campo: "gravei uma reunião de 40 minutos e estou gerando por
 * outros 40 minutos essa transcrição". Um por um, o que estava errado:
 *
 *   1. O modelo padrão era o `whisper-small` — o maior dos dois sensatos.
 *   2. A caixa "usar a placa de vídeo" nascia DESMARCADA e nada a ligava, então
 *      todo mundo transcrevia no processador. Os dois somados dão o 1x medido.
 *   3. Terminado o trabalho, nada avisava: quem trocou de aba não fica sabendo.
 *   4. A faixa de progresso — o único sinal global — sumia quando a barra de
 *      verdade entrava na tela, ou seja, piscava conforme o scroll.
 *   5. E a tela dizia o que NÃO fazer ("mantenha a aba visível") sem dizer o
 *      que dá para fazer enquanto se espera.
 *
 * Cada afirmação aqui tem que cair com o conserto desligado. As de tempo são as
 * mais fáceis de fingir — um teste que só confere que o botão existe não prova
 * que o padrão mudou —, então o que se afirma é o VALOR do controle, que é o
 * que decide o tempo de quem usa.
 *
 *   node testes/espera2.mjs
 */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const RAIZ = `${RAIZ_WS}`;
const html = fs.readFileSync(RAIZ + '/public/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) {
    r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end('');
  }
  r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(html);
});
await new Promise(r => srv.listen(8957, r));

let falhas = 0;
const ok = (n, c, e) => {
  console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : ''));
  if (!c) falhas++;
};

const br = await chromium.launch({
  executablePath: CHROME_WS,
});

// ---------------------------------------------------------------------------
console.log('[1] os dois padrões que custavam os 40 minutos');
{
  /* SEM WebGPU a caixa nem aparece — e é o estado do Chromium desta esteira.
     Então a placa é medida no bloco [2], com `navigator.gpu` falsificado; aqui
     se cobra o modelo, que não depende de placa nenhuma. */
  const pg = await (await br.newContext()).newPage();
  await pg.goto('http://localhost:8957/app.html?lang=pt');
  const modelo = await pg.locator('#model').inputValue();
  console.log('     modelo padrão: ' + modelo);
  /* O NÚMERO QUE IMPORTA não é o nome: é que o padrão seja o modelo RÁPIDO.
     Com `whisper-small` aqui, 40 minutos de reunião voltam a levar 40. */
  ok('o padrão é o whisper-base, e não o small',
     modelo === 'onnx-community/whisper-base', modelo);

  /* E o rótulo tem que acompanhar: um seletor que chama de "recomendado" uma
     opção que não é a padrão ensina a pessoa a desconfiar do seletor. */
  const rotulo = await pg.locator('#model option[value="onnx-community/whisper-base"]').textContent();
  ok('e o rótulo do padrão diz que ele é o recomendado',
     /Recomendado/i.test(rotulo), rotulo);
  const rSmall = await pg.locator('#model option[value="onnx-community/whisper-small"]').textContent();
  ok('e o mais preciso avisa que é mais lento', /lento/i.test(rSmall), rSmall);
  await pg.close();
}

// ---------------------------------------------------------------------------
console.log('\n[2] a placa de vídeo nasce ligada onde ela existe');
{
  const ctx = await br.newContext();
  /* `navigator.gpu` falsificado ANTES de qualquer script da página: a decisão é
     tomada na montagem, e um remendo aplicado depois mediria outra coisa. */
  await ctx.addInitScript(() => {
    try { Object.defineProperty(navigator, 'gpu', { get: () => ({ falso: true }) }); } catch (e) {}
  });
  const pg = await ctx.newPage();
  await pg.goto('http://localhost:8957/app.html?lang=pt');
  await pg.waitForTimeout(400);
  /* A caixa mora na gaveta de ajustes, fechada por padrão — abrir é o caminho
     de quem vai mexer nela. O estado MEDIDO abaixo é o de antes de abrir: a
     gaveta não decide nada, só esconde. */
  const abrirAjustes = async () => {
    const b = pg.locator('#ajustesBtn');
    if (await b.count() && (await b.getAttribute('aria-expanded')) !== 'true') {
      await b.scrollIntoViewIfNeeded();
      await b.click();
      await pg.waitForTimeout(400);
    }
  };
  const st = await pg.evaluate(() => ({
    marcada: document.getElementById('gpu').checked,
    visivel: !document.getElementById('gpu').closest('label').classList.contains('hide'),
  }));
  console.log('     ' + JSON.stringify(st));
  ok('a caixa aparece', st.visivel);
  /* O NÚMERO QUE IMPORTA: marcada. Desmarcada, a fila de montagem nem tenta a
     placa — os degraus de webgpu são condicionados a `usaPlaca()`. */
  ok('e nasce MARCADA', st.marcada === true, String(st.marcada));

  /* A ESCOLHA DA PESSOA GANHA DO PADRÃO. Sem isto, quem desmarca de propósito
     — porque a placa dela trava — vê a caixa voltar sozinha na repintura
     seguinte, e a queda automática viraria um laço. */
  await abrirAjustes();
  await pg.locator('#gpu').uncheck();
  await pg.waitForTimeout(200);
  await pg.selectOption('#model', 'onnx-community/whisper-small');   // força repintura
  await pg.waitForTimeout(300);
  ok('e desmarcar à mão sobrevive à repintura',
     (await pg.locator('#gpu').isChecked()) === false);
  await ctx.close();
}

// ---------------------------------------------------------------------------
console.log('\n[3] a faixa de progresso não pisca conforme o scroll');
{
  const pg = await (await br.newContext({ viewport: { width: 1250, height: 900 } })).newPage();
  await pg.goto('http://localhost:8957/app.html?lang=pt');
  await pg.selectOption('#modelo', 'evidencia');
  /* Simula um trabalho longo em curso mexendo só no que a faixa LÊ — ela se
     alimenta da barra do cartão, então acender a barra é o estado real. */
  await pg.evaluate(() => {
    /* `__ocupado(true)` é o que separa TRABALHO de CORTESIA — sem ele a faixa
       não fala, e é isso que conserta o defeito do bloco [6] abaixo. Ele chama
       a mesma `trabalhando()` que a transcrição chama. */
    window.__ocupado(true);
    document.getElementById('abarWrap').classList.remove('hide');
    document.getElementById('abar').style.width = '42%';
    document.getElementById('astatus').textContent = 'transcrevendo 42%…';
  });
  /* A CONDIÇÃO DO RELATO TEM QUE EXISTIR DE VERDADE, e a primeira versão deste
     bloco não a criava: media a faixa com a barra do cartão FORA da tela, onde
     a regra antiga também a mostrava. Ou seja, passava com o conserto
     desligado. É preciso ROLAR até a barra ficar visível — que é literalmente
     o gesto do relato, "a barra some quando estamos no item 2". */
  await pg.locator('#abarWrap').scrollIntoViewIfNeeded();
  await pg.waitForTimeout(1400);
  const comBarraNaTela = await pg.evaluate(() => {
    const r = document.getElementById('abarWrap').getBoundingClientRect();
    return { barraNaTela: r.height > 0 && r.bottom > 0 && r.top < innerHeight,
             faixa: !document.getElementById('faixa').classList.contains('hide') };
  });
  console.log('     ' + JSON.stringify(comBarraNaTela));
  /* Sem esta primeira afirmação a segunda não vale nada: ela é o que garante
     que a medição aconteceu no estado certo. */
  ok('a barra do cartão está mesmo à vista', comBarraNaTela.barraNaTela === true,
     JSON.stringify(comBarraNaTela));
  /* O NÚMERO QUE IMPORTA: a faixa está visível MESMO com a barra do cartão na
     tela. A regra antiga a escondia nesse caso, e o efeito era a única pista
     global de que a máquina trabalha aparecer e sumir conforme a pessoa rola. */
  ok('e a faixa fica visível assim mesmo',
     comBarraNaTela.faixa === true, JSON.stringify(comBarraNaTela));

  /* AQUI HAVIA UMA TERCEIRA AFIRMAÇÃO, e ela saiu: rolava de volta ao topo e
     conferia que a faixa continuava. Só que o estado desta simulação é
     FALSIFICADO — a barra é acesa à mão —, e voltar ao topo dispara uma
     repintura do aplicativo que apaga a barra falsa e, com ela, a faixa. O
     teste reprovava o produto por um efeito do próprio teste.

     A afirmação que importa é a de cima, e ela basta: com a barra de verdade
     à vista, a faixa fica. Era esse o caso do relato. */
  await pg.close();
}

// ---------------------------------------------------------------------------
console.log('\n[4] terminou: o título pisca e a faixa dá a notícia');
{
  const pg = await (await br.newContext({ viewport: { width: 1250, height: 900 } })).newPage();
  await pg.goto('http://localhost:8957/app.html?lang=pt');
  await pg.selectOption('#modelo', 'evidencia');
  const tituloAntes = await pg.title();

  /* O REGISTRO DOS TÍTULOS é do teste, e não do produto: um `window.__titulos`
     dentro do aplicativo seria código que só existe para ser medido. Um
     observador sobre o <title> vê exatamente o que a barra de abas vê. */
  await pg.evaluate(() => {
    window.__titulosVistos = [document.title];
    new MutationObserver(() => window.__titulosVistos.push(document.title))
      .observe(document.querySelector('title'), { childList: true, characterData: true, subtree: true });
  });

  /* COM A ABA ESCONDIDA, que é o caso do relato: a pessoa foi fazer outra
     coisa. `visibilityState` é falsificado porque o Playwright não tem como
     esconder uma aba de verdade sem fechar a página. */
  await pg.evaluate(() => {
    Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
    window.__avisar();
  });
  await pg.waitForTimeout(2800);
  const piscou = await pg.evaluate(() => window.__titulosVistos || []);
  console.log('     títulos vistos: ' + JSON.stringify(piscou));
  ok('e um deles anuncia que ficou pronto', piscou.some(x => /✓/.test(x)),
     JSON.stringify(piscou));
  /* O NÚMERO QUE IMPORTA: o título VOLTOU ao original depois do aviso — é isso
     que quer dizer piscar, e é o que chama o olho numa barra de abas.

     A primeira versão desta linha afirmava `new Set(...).size >= 2`, e eu a
     verifiquei trocando o piscar por uma atribuição única de título: ela
     PASSOU. Um título que muda uma vez se perde entre quinze abas exatamente
     como o título que nunca mudou; a alternância é a mensagem inteira. */
  const iPronto = piscou.findIndex(x => /✓/.test(x));
  ok('e o título alterna, em vez de trocar uma vez só',
     iPronto >= 0 && piscou.slice(iPronto + 1).some(x => !/✓/.test(x)),
     JSON.stringify(piscou));

  const icone = await pg.evaluate(() =>
    document.querySelector("link[rel='icon'][type='image/svg+xml']").href);
  /* O ícone, porque numa janela com quinze abas o título vira seis caracteres
     e o que sobra visível é o quadradinho. Verde é o de concluído.

     A comparação é pela COR, e não pelo começo da string: os dois ícones são
     data-URL de SVG e os primeiros sessenta caracteres deles são idênticos —
     a primeira versão deste teste cortava em 90 e reprovava um ícone que tinha
     trocado direitinho. */
  ok('e o ícone da aba virou o de concluído',
     /2F9E44/i.test(icone) && !/3A3F9E/i.test(icone), icone.slice(40, 110));

  /* AO VOLTAR: para de piscar, o título volta ao que era, e a faixa conta o
     que aconteceu. Uma tela que se recompõe sozinha, sem dizer nada, faz quem
     voltou procurar o que mudou. */
  await pg.evaluate(() => {
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await pg.waitForTimeout(900);
  ok('ao voltar, o título volta ao normal', (await pg.title()) === tituloAntes,
     await pg.title());
  const faixa = await pg.evaluate(() => {
    const f = document.getElementById('faixa');
    return { visivel: !f.classList.contains('hide'), pronta: f.classList.contains('pronta'),
             texto: document.getElementById('faixaTxt').textContent };
  });
  console.log('     ' + JSON.stringify(faixa));
  ok('e a faixa conta o que ficou pronto',
     faixa.visivel && faixa.pronta && /pront/i.test(faixa.texto), JSON.stringify(faixa));

  await pg.locator('#faixaParar').click();
  await pg.waitForTimeout(600);
  ok('e o aviso se dispensa', await pg.locator('#faixa').evaluate(e => e.classList.contains('hide')));
  await pg.close();
}

// ---------------------------------------------------------------------------
console.log('\n[5] durante a espera, a tela diz o que DÁ para fazer');
{
  const pg = await (await br.newContext({ viewport: { width: 1250, height: 900 } })).newPage();
  await pg.goto('http://localhost:8957/app.html?lang=pt');
  await pg.selectOption('#modelo', 'evidencia');
  ok('parado, o convite não aparece',
     await pg.locator('#esperaDica').evaluate(e => e.classList.contains('hide')));

  await pg.evaluate(() => window.__ocupado(true));
  await pg.waitForTimeout(300);
  ok('trabalhando, ele aparece', await pg.locator('#esperaDica').isVisible());
  const txt = (await pg.locator('#esperaDica').textContent()).replace(/\s+/g, ' ');
  console.log('     ' + txt.slice(0, 130));
  ok('ele diz que a aba avisa quando terminar', /t[íi]tulo da aba/i.test(txt), txt.slice(0, 60));
  /* O CUSTO TEM QUE ESTAR DITO — em algum lugar alcançável.
     Convidar a abrir uma segunda sessão sem avisar que a máquina é dividida
     promete um paralelismo que não existe: duas transcrições terminam nas duas
     somadas, não na metade. O texto da tela encolheu a pedido, então o aviso
     desceu para o `title` do botão, que o `data-i18n-title` também publica como
     `aria-label`. O que se cobra aqui é que ele exista, e não onde. */
  const dica = (await pg.locator('#novaSessao').getAttribute('title')) || '';
  ok('e o custo de dividir a máquina continua dito', /mesma m[áa]quina|lentas/i.test(dica), dica);
  ok('e chega a quem usa leitor de tela',
     ((await pg.locator('#novaSessao').getAttribute('aria-label')) || '') === dica, dica);
  ok('o botão da sessão nova está lá', await pg.locator('#novaSessao').isVisible());

  /* E o texto ao lado não pode contradizê-lo: ele dizia "mantenha a aba
     VISÍVEL" enquanto este convida a trocar de aba. */
  const keep = (await pg.locator('#keepOpen').textContent()).replace(/\s+/g, ' ');
  ok('e o aviso vizinho não manda o contrário', !/vis[íi]vel/i.test(keep), keep.slice(0, 90));

  await pg.evaluate(() => window.__ocupado(false));
  await pg.waitForTimeout(200);
  ok('e some quando o trabalho acaba',
     await pg.locator('#esperaDica').evaluate(e => e.classList.contains('hide')));
  await pg.close();
}

// ---------------------------------------------------------------------------
console.log('\n[6] a faixa só fala de trabalho que a pessoa começou');
{
  /* O DEFEITO, relatado ao usar o botão de sessão nova: a aba recém-aberta
     mostrava a faixa de progresso sem nada rodando nela.

     A causa não era a aba nova. É o `adiantarModelo()`, que baixa o modelo
     sozinho ao abrir a página para o clique em Gravar não esperar — e esse
     download acende a MESMA barra que uma transcrição acende. A faixa, que é
     global e agora fica sempre, repetia a cortesia como se fosse tarefa.

     Aqui a cortesia é simulada acendendo a barra SEM `ocupado`, que é
     exatamente o estado em que o download adiantado deixa a página. */
  const pg = await (await br.newContext({ viewport: { width: 1250, height: 900 } })).newPage();
  await pg.goto('http://localhost:8957/app.html?lang=pt');
  await pg.selectOption('#modelo', 'evidencia');
  /* ESPERAR A CORTESIA ACABAR, antes de simular qualquer coisa.

     `adiantarModelo()` baixa o modelo sozinho ao abrir a página, e quando
     termina — ou falha — chama `prog(null)`, que APAGA `#abarWrap`. Este bloco
     acende essa barra à mão para simular a cortesia; se a cortesia de verdade
     terminar no meio, ela apaga a simulação e o teste reprova acusando a faixa
     de não aparecer, quando o que sumiu foi a barra.

     Não é hipótese: quando uma mudança em outro lugar deslocou o instante em
     que a cortesia acaba, este bloco reprovou três vezes em três — e a primeira
     leitura foi "flake", que estava errada. `__adiantouFim` existe para tirar o
     relógio da conta. */
  await pg.waitForFunction(() => window.__adiantouFim === true,
                           null, { timeout: 30000 }).catch(() => {});
  await pg.evaluate(() => {
    document.getElementById('abarWrap').classList.remove('hide');
    document.getElementById('astatus').textContent = 'baixando o modelo…';
  });
  await pg.waitForTimeout(1200);
  /* O NÚMERO QUE IMPORTA: escondida. Com a faixa aparecendo aqui, quem abre
     uma sessão nova acha que ela herdou o trabalho da outra aba. */
  ok('barra acesa por cortesia não acende a faixa',
     await pg.locator('#faixa').evaluate(e => e.classList.contains('hide')));

  /* E a outra metade: com trabalho de verdade, ela fala. Sem esta linha, o
     conserto poderia ser "nunca mostrar a faixa" e o teste passaria.

     A BARRA É REACESA AQUI, e isso não é zelo. `adiantarModelo()` — o download
     de cortesia que começa sozinho ao abrir a página — termina em algum
     instante e chama `prog(null)`, que apaga `#abarWrap`. Se ele terminar entre
     o acender de cima e esta medição, o cenário se desfaz e o teste reprova
     acusando a faixa de não aparecer, quando o que sumiu foi a barra.

     Ele reprovou exatamente assim, três vezes seguidas, quando uma mudança em
     outro lugar deslocou o instante em que a cortesia acaba — e a primeira
     leitura foi "flake", que estava errada. Reafirmar a premissa imediatamente
     antes de medir tira o relógio da conta. */
  await pg.evaluate(() => window.__ocupado(true));
  await pg.waitForTimeout(1000);
  ok('mas com trabalho de verdade ela aparece',
     !(await pg.locator('#faixa').evaluate(e => e.classList.contains('hide'))));
  await pg.close();
}

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nA espera longa: tudo passou.');
process.exit(falhas ? 1 : 0);
