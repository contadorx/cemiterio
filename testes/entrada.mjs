/* A ENTRADA — três portas do mesmo tamanho, e duas perguntas que não eram de
 * todo mundo.
 *
 * O passo 1 pedia, nesta ordem, que TODA pessoa passasse os olhos por: o
 * cenário, "já tem um documento?", "você já tem a lista de passos?" e três
 * cartões iguais — gravar, arquivo, Drive. Quem abriu para gravar a tela
 * atravessava duas perguntas que não eram dela e escolhia entre três tarefas
 * quando só havia duas.
 *
 * O que este arquivo cobra:
 *
 *   1. dois caminhos na grade, e não três: o Drive é ORIGEM dentro de "usar um
 *      arquivo", com a sinalização que faltou na primeira vez que ele morou lá;
 *   2. o roteiro só nos cenários que têm passos para roteirizar, e sempre
 *      DEPOIS do tipo de documento;
 *   3. e ele não some levando junto o que a pessoa escreveu;
 *   4. as letras das partes não têm buraco — elas são escritas pelo que está na
 *      tela, e não digitadas no HTML;
 *   5. "abrir projeto" saiu do caminho principal sem sair do produto: uma linha
 *      embaixo, um clique, e com o vocabulário do build 3;
 *   6. tamanho do download e motor são CONSEQUÊNCIA do modelo, e não uma
 *      segunda e uma terceira decisão ao lado dele;
 *   7. nada disso escondeu capacidade: os controles continuam todos alcançáveis.
 *
 *   node testes/entrada.mjs
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';

const html = fs.readFileSync(RAIZ_WS + '/public/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) {
    r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end('');
  }
  r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(html);
});
await new Promise(r => srv.listen(8951, r));

let falhas = 0;
const ok = (n, c, e) => {
  console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : ''));
  if (!c) falhas++;
};

const br = await chromium.launch({ executablePath: CHROME_WS });
const ctx = await br.newContext({ viewport: { width: 1250, height: 980 } });
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', e => erros.push(e.message));
await pg.goto('http://localhost:8951/app.html?lang=pt');
await pg.waitForTimeout(600);

console.log('[1] a grade tem dois caminhos, e o Drive não é o terceiro');
{
  const vias = await pg.evaluate(() => [...document.querySelectorAll('.caminhos > .via')]
    .filter(e => !e.classList.contains('hide')).map(e => e.id));
  console.log('     caminhos visíveis: ' + JSON.stringify(vias));
  /* Três cartões do mesmo tamanho leem-se como três TAREFAS. "Abrir do Drive"
     não é uma tarefa diferente de "usar um arquivo": é o mesmo trabalho com o
     arquivo vindo de outro lugar. */
  ok('são dois', vias.length === 2, JSON.stringify(vias));
  ok('gravar e arquivo', vias.includes('viaRec') && vias.includes('viaArq'),
     JSON.stringify(vias));
  ok('e o Drive não está entre eles', !vias.includes('viaDrive'), JSON.stringify(vias));
  /* Gravar continua sendo o que a maior parte vem fazer, e é o único com a
     borda de destaque: pesos diferentes, e não três iguais. */
  const destaque = await pg.evaluate(() => {
    const b = e => getComputedStyle(document.getElementById(e)).borderTopWidth;
    return { rec: b('viaRec'), arq: b('viaArq') };
  });
  ok('e gravar pesa mais que arquivo', destaque.rec !== destaque.arq,
     JSON.stringify(destaque));
}

console.log('\n[2] o Drive é origem DENTRO de "usar um arquivo" — e se anuncia');
{
  const d = await pg.evaluate(() => {
    const arq = document.getElementById('viaArq'), dr = document.getElementById('viaDrive');
    dr.classList.remove('hide');            // sem credenciais ele nasce escondido
    return {
      dentro: arq.contains(dr),
      depoisDoDrop: !!(document.getElementById('drop').compareDocumentPosition(dr)
                       & Node.DOCUMENT_POSITION_FOLLOWING),
      ou: (dr.querySelector('.ou').textContent || '').trim(),
      regua: getComputedStyle(dr).borderTopWidth,
      botao: (document.getElementById('drive').textContent || '').trim(),
      dica: (document.getElementById('driveMsg').textContent || '').trim(),
    };
  });
  console.log('     "' + d.ou + '"  →  [' + d.botao + ']');
  ok('mora dentro do cartão do arquivo', d.dentro === true);
  ok('e depois da zona de arraste', d.depoisDoDrop === true);
  /* ISTO É O CONSERTO DA VERSÃO 1. Ele já morou aqui dentro e falhou — um
     botão solto no fim de um cartão não se anuncia, e quem tinha o vídeo no
     Drive não descia até ele. A régua e a frase são a sinalização que faltava;
     sem elas, este build repete um erro que o projeto já pagou. */
  ok('a linha diz em palavras que o Drive é uma origem',
     /drive/i.test(d.ou) && /^ou/i.test(d.ou), d.ou);
  ok('e uma régua separa o caminho principal da alternativa',
     d.regua !== '0px', d.regua);
  ok('o botão continua se chamando pelo nome', /Google Drive/.test(d.botao), d.botao);
  /* A promessa de privacidade é curta no fluxo, e continua no fluxo. */
  ok('e a promessa de que o arquivo não passa por servidor nosso ficou',
     /servidor/i.test(d.dica), d.dica);
}

console.log('\n[3] o roteiro só onde há passos para roteirizar');
{
  const esperado = { evidencia: true, tutorial: true, usabilidade: true,
                     ata: false, ia: false, outro: false };
  const semCenario = await pg.evaluate(
    () => !document.getElementById('roteiroBloco').classList.contains('hide'));
  /* Antes de escolher o tipo de documento não dá para saber se a pergunta faz
     sentido — e a proposta põe o roteiro DEPOIS do tipo, por isso. */
  ok('antes de escolher o cenário, ele não está na tela', semCenario === false);
  for (const [cen, deve] of Object.entries(esperado)) {
    await pg.selectOption('#modelo', cen);
    await pg.waitForTimeout(120);
    const v = await pg.evaluate(
      () => !document.getElementById('roteiroBloco').classList.contains('hide'));
    ok(`${cen.padEnd(12)} → roteiro ${deve ? 'aparece' : 'não aparece'}`, v === deve);
  }
}

console.log('\n[4] as letras são escritas pelo que está na tela');
{
  /* "a" e "c" fixos no HTML deixavam um buraco no meio sempre que o bloco do
     meio não estava lá — e uma sequência com buraco manda procurar o que
     falta, que é o oposto do que esconder um bloco deveria conseguir. */
  await pg.selectOption('#modelo', 'ata'); await pg.waitForTimeout(120);
  const semRot = await pg.evaluate(() => [...document.querySelectorAll('#cardVideo .sbN')]
    .map(e => e.textContent).filter(Boolean));
  await pg.selectOption('#modelo', 'tutorial'); await pg.waitForTimeout(120);
  const comRot = await pg.evaluate(() => [...document.querySelectorAll('#cardVideo .sbN')]
    .map(e => e.textContent).filter(Boolean));
  console.log('     sem roteiro: ' + JSON.stringify(semRot) +
              '   com roteiro: ' + JSON.stringify(comRot));
  ok('sem o roteiro, uma letra só', semRot.join(',') === 'a', JSON.stringify(semRot));
  ok('com o roteiro, a e b — e nunca a e c',
     comRot.join(',') === 'a,b', JSON.stringify(comRot));
}

console.log('\n[5] e ele não some levando junto o que a pessoa escreveu');
{
  await pg.selectOption('#modelo', 'tutorial'); await pg.waitForTimeout(120);
  await pg.locator('#roteiroAbrir').click(); await pg.waitForTimeout(200);
  await pg.fill('#roteiroTxt', 'abrir o portal\ninformar o fornecedor\nsalvar');
  await pg.locator('#roteiroUsar').click(); await pg.waitForTimeout(250);
  const antes = await pg.evaluate(
    () => (document.getElementById('roteiroConta').textContent || '').trim());
  /* Trocar para um cenário que normalmente NÃO mostra o roteiro. Esconder um
     bloco vazio é limpeza; esconder um bloco com o trabalho de alguém dentro é
     perda — e perda silenciosa, que é a pior. */
  await pg.selectOption('#modelo', 'ata'); await pg.waitForTimeout(250);
  const depois = await pg.evaluate(() => ({
    visivel: !document.getElementById('roteiroBloco').classList.contains('hide'),
    conta: (document.getElementById('roteiroConta').textContent || '').trim(),
  }));
  console.log('     antes: "' + antes + '"   depois de virar ata: ' + JSON.stringify(depois));
  ok('o bloco fica, mesmo num cenário que não o mostraria', depois.visivel === true);
  ok('e os passos continuam lá', depois.conta === antes && /3/.test(depois.conta),
     depois.conta);
  await pg.locator('#roteiroTirar').click(); await pg.waitForTimeout(250);
  ok('tirando o roteiro, aí sim ele recolhe', await pg.evaluate(
     () => document.getElementById('roteiroBloco').classList.contains('hide')));
}

console.log('\n[6] "abrir projeto" saiu do caminho, e não do produto');
{
  const r = await pg.evaluate(() => {
    const b = document.getElementById('recupBloco');
    const cam = document.querySelector('.caminhos');
    return {
      depoisDosCaminhos: !!(cam.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING),
      ehParte: b.classList.contains('cenario'),
      temLetra: !!b.querySelector('.sbN'),
      visivel: !b.classList.contains('hide'),
      rotulo: (b.querySelector('[data-i18n="reabrirLbl"]').textContent || '').trim(),
      botao: (document.getElementById('reabrir').textContent || '').trim(),
      dica: (document.getElementById('reabrirMsg').textContent || '').trim(),
      aceita: document.getElementById('reabrirArq').accept,
    };
  });
  console.log('     "' + r.rotulo + '"  [' + r.botao + ']');
  ok('desceu para depois dos caminhos', r.depoisDosCaminhos === true);
  ok('deixou de ser uma parte numerada do passo 1',
     r.ehParte === false && r.temLetra === false,
     JSON.stringify({ cenario: r.ehParte, letra: r.temLetra }));
  /* Esconder complexidade, nunca esconder capacidade: continua a um clique. */
  ok('mas continua na tela, e a um clique', r.visivel === true && r.botao.length > 0);
  ok('e continua aceitando os mesmos arquivos',
     /json/.test(r.aceita) && /zip/.test(r.aceita), r.aceita);
  /* O vocabulário do build 3: o que se reabre é um PROJETO. Chamar de
     "documento" o que se reabre e também o arquivo final faz a mesma palavra
     valer duas coisas — e foi a confusão que o painel de conclusão existe para
     desfazer. */
  ok('e chama a coisa pelo nome do build 3: projeto',
     /projeto/i.test(r.botao) && !/documento/i.test(r.botao), r.botao);
  /* O detalhe técnico continua embaixo, e não no nome principal. */
  ok('com a extensão dita embaixo, e não no rótulo', /\.json|\.zip/.test(r.dica), r.dica);
}

console.log('\n[7] tamanho e motor são consequência do modelo, não decisões ao lado');
{
  await pg.locator('#ajustesBtn').click();
  await pg.waitForTimeout(300);
  const m = await pg.evaluate(() => {
    const sel = document.getElementById('model');
    const cx = document.querySelector('.consequencia');
    return {
      temSize: !!(cx && cx.contains(document.getElementById('modelSize'))),
      temGpu: !!(cx && cx.contains(document.getElementById('gpu'))),
      depoisDoModelo: !!(cx && (sel.compareDocumentPosition(cx) & Node.DOCUMENT_POSITION_FOLLOWING)),
      mesmaLinha: sel.parentElement === (document.getElementById('gpu') || {}).parentElement,
      rotulos: [...sel.options].map(o => o.textContent.trim()),
      gpuClicavel: !document.getElementById('gpu').disabled,
    };
  });
  console.log('     rótulos do modelo: ' + JSON.stringify(m.rotulos));
  ok('o tamanho do download desceu para a consequência', m.temSize === true);
  ok('o motor também', m.temGpu === true);
  ok('e ela vem DEPOIS da escolha que a causa', m.depoisDoModelo === true);
  ok('nenhum dos dois disputa a fileira do modelo', m.mesmaLinha === false);
  /* Os três rótulos falam por intenção, e não por nome de modelo. */
  ok('o modelo é escolhido por intenção',
     m.rotulos.every(r => /rápido|preciso|precisão/i.test(r)), JSON.stringify(m.rotulos));
  /* Quem tem uma placa que não dá conta precisa poder desmarcá-la — a queda da
     placa (`quedaplaca.mjs`) depende disso. */
  ok('e a placa continua clicável, não virou enfeite', m.gpuClicavel === true);
}

console.log('\n[8] nada foi escondido de verdade');
{
  /* A lista do que a proposta manda tirar do caminho principal — e que ela
     manda, na mesma frase, NÃO tirar do produto. */
  const alcance = await pg.evaluate(() => {
    const ids = ['reabrir', 'reabrirArq', 'drive', 'driveStop', 'roteiroAbrir',
                 'roteiroTxt', 'model', 'gpu', 'recMic', 'lang', 'limparModelo',
                 'spkMicNome', 'spkSysNome', 'demo'];
    return ids.filter(i => !document.getElementById(i));
  });
  ok('todos os controles continuam existindo', alcance.length === 0,
     JSON.stringify(alcance));
}

console.log('\n[9] os cinco idiomas, sem chave crua na tela');
{
  for (const L of ['pt', 'en', 'es', 'de', 'fr']) {
    const p2 = await ctx.newPage();
    await p2.goto('http://localhost:8951/app.html?lang=' + L);
    await p2.waitForTimeout(500);
    const v = await p2.evaluate(() => {
      const dr = document.getElementById('viaDrive');
      dr.classList.remove('hide');
      return {
        ou: (dr.querySelector('.ou').textContent || '').trim(),
        botao: (document.getElementById('reabrir').textContent || '').trim(),
        cru: /\b(viaDriveOu|reabrirLbl|reabrirBtn)\b/.test(document.body.innerText),
      };
    });
    console.log('     ' + L + ': "' + v.ou + '"  |  [' + v.botao + ']');
    ok(L + ': a linha do Drive está traduzida', v.ou.length > 0 && /drive/i.test(v.ou), v.ou);
    ok(L + ': e o botão do projeto também', v.botao.length > 0);
    ok(L + ': nenhuma chave crua', v.cru === false);
    await p2.close();
  }
}

console.log(erros.length ? '\nerros de JS: ' + erros.join(' | ') : '\nsem erro de JS');
if (erros.length) falhas++;
await br.close(); srv.close();
console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTodas as verificações passaram.');
process.exit(falhas ? 1 : 0);
