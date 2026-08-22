/* PARAR SEM PERDER — a espera longa que não tinha porta de saída.
 *
 * O RELATO é o da própria interface: ela convida a deixar rodando ("pode
 * deixar em segundo plano"), e não oferecia jeito nenhum de encerrar ficando
 * com o que já saiu. As duas saídas eram esperar até o fim ou fechar a aba — e
 * fechar a aba perde tudo. Numa reunião de quarenta minutos em que os dez
 * primeiros já respondem a pergunta, isso custa meia hora por nada.
 *
 * O botão de parar EXISTIA, e era da varredura. Ele nem aparecia durante a
 * transcrição, e o pouco que aparecia era pior do que nada: a varredura corre
 * JUNTO da transcrição de propósito, e quando ela terminava — dez segundos ao
 * lado de quarenta minutos — escondia o botão à mão, por cima de um trabalho
 * que continuava correndo.
 *
 * O que este arquivo cobra:
 *
 *   1. durante a transcrição existe um botão de parar, e ele diz o que faz:
 *      "ficar com o que já está pronto", e não só "Parar";
 *   2. a varredura terminando NÃO leva esse botão embora;
 *   3. o clique não promete o impossível: a inferência em curso termina, e o
 *      rótulo passa a dizer "parando após este trecho";
 *   4. a transcrição realmente para antes do fim, e o texto que já saiu FICA;
 *   5. o que falta é dito em minutos de gravação, e não em "pode sair
 *      incompleto";
 *   6. a linha de estado está partida em cinco — etapa, progresso, previsão,
 *      motor recolhido e ação — e não numa frase só;
 *   7. o leitor de tela ouve começo, mudança relevante e fim; NÃO ouve cada
 *      ponto percentual;
 *   8. o painel de conclusão não chama de completa uma fala que a pessoa
 *      interrompeu.
 *
 *   node testes/parar.mjs
 */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';

const html = fs.readFileSync(RAIZ_WS + '/public/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) {
    r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end('');
  }
  r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(html);
});
await new Promise(r => srv.listen(8949, r));

let falhas = 0;
const ok = (n, c, e) => {
  console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : ''));
  if (!c) falhas++;
};

/* A biblioteca falsificada, como em `modelo.mjs` e `quedaplaca.mjs`: o Whisper
   de verdade não sobe numa esteira, e o que precisa rodar aqui é o CICLO DE
   VIDA do laço de transcrição — que é onde mora tudo que este arquivo cobra.
 *
 * ELA PARA QUANDO O TESTE MANDA, e não depois de um número de milissegundos.
 * A primeira versão dava 1,5 s a cada inferência e lia a tela no meio da
 * corrida — e a corrida era com a esteira, que roda dois testes por vez numa
 * máquina de dois núcleos. Ela reprovava o rótulo do botão porque a
 * transcrição tinha acabado antes do clique: um teste que mede o relógio da
 * máquina de quem o roda não mede o produto.
 *
 * Com `__pausado`, a inferência em curso ESTACIONA. O teste lê a tela, roda
 * uma varredura por cima, pede a parada — tudo com um trecho despachado e
 * pendurado, que é exatamente o estado que o produto promete tratar — e só
 * então solta. Sem relógio, e cobrando mais: dá para afirmar que NENHUMA
 * inferência começou depois do pedido, e não só que houve poucas. */
const BIBLIOTECA_FALSA = `
globalThis.__reg = { chamadas: [] };
globalThis.__pausado = false;
export const env = {
  allowLocalModels: true, allowRemoteModels: true,
  backends: { onnx: { wasm: { numThreads: 1, wasmPaths: undefined } } }
};
export async function pipeline(tarefa, modelo, opcoes){
  const p = async (dados) => {
    const n = globalThis.__reg.chamadas.length;
    globalThis.__reg.chamadas.push({ amostras: dados ? dados.length : 0, em: Date.now() });
    while (globalThis.__pausado) await new Promise(r => setTimeout(r, 50));
    /* 1,2 s por trecho: rápido o bastante para o teste não demorar, e lento o
       bastante para haver ritmo medido — a previsão só aparece quando ela vale
       mais de três segundos, e uma inferência instantânea não produz previsão
       nenhuma para conferir. */
    await new Promise(r => setTimeout(r, 1200));
    /* Texto DIFERENTE a cada trecho: a peneira de repetição do produto
       descarta fala idêntica que chega perto demais, e um teste que caísse
       nela estaria medindo a peneira, não a parada. */
    return { text: 'trecho numero ' + (n + 1), chunks: [] };
  };
  p.dispose = async () => {};
  return p;
}
`;

const br = await chromium.launch({ executablePath: CHROME_WS });
const ctx = await br.newContext({ viewport: { width: 1250, height: 980 }, acceptDownloads: true });
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', e => erros.push(e.message));

/* O que o leitor de tela OUVIU, na ordem. É a única maneira de provar a
   diferença entre "anuncia o que importa" e "anuncia cada porcentagem": o
   segundo caso não é um texto errado, é uma LISTA longa demais. */
await pg.addInitScript(() => {
  window.__ditos = [];
  const ligar = () => {
    const el = document.getElementById('trFala'); if (!el) return false;
    new MutationObserver(() => {
      const v = (el.textContent || '').trim();
      if (v && window.__ditos[window.__ditos.length - 1] !== v) window.__ditos.push(v);
    }).observe(el, { childList: true, characterData: true, subtree: true });
    return true;
  };
  if (!ligar()) document.addEventListener('DOMContentLoaded', ligar);
});
const medidos = [];
await pg.route('**/rpc/walkstamp_evento', r => {
  try { medidos.push(JSON.parse(r.request().postData() || '{}')); } catch (e) {}
  r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: 'null' });
});
await pg.route('**/@huggingface/transformers**', r => r.fulfill({
  status: 200, headers: { 'content-type': 'text/javascript' }, body: BIBLIOTECA_FALSA }));

await pg.goto('http://localhost:8949/app.html?lang=pt');
await pg.selectOption('#modelo', 'evidencia').catch(() => {});
/* A varredura automática em modo cena faria 120 saltos num vídeo de dois
   minutos e meio. Ela não é o assunto aqui: três quadros bastam para o
   documento existir, e mexer nos controles já cancela o agendamento dela. */
await pg.selectOption('#mode', 'count');
await pg.fill('#count', '3');
/* A fala automática fica DESLIGADA aqui. Com ela ligada, a transcrição começa
   sozinha quando a varredura acaba — e o clique no `#auto` logo abaixo, achando
   o botão travado, esperaria a primeira terminar para disparar uma SEGUNDA. O
   teste mediria a segunda achando que media a primeira. */
await pg.locator('#recTr').uncheck();
await pg.waitForTimeout(300);

await pg.setInputFiles('#file', '/tmp/fala-longa.webm');
await pg.waitForFunction(() => !document.getElementById('extract').disabled,
                         null, { timeout: 60000 });
await pg.locator('#extract').click();
await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length >= 3,
                         null, { timeout: 120000 });
await pg.waitForFunction(() => document.getElementById('barWrap').classList.contains('hide'),
                         null, { timeout: 60000 });

const estado = () => pg.evaluate(() => {
  const c = document.getElementById('cancel');
  const a = document.getElementById('astatus');
  const m = document.getElementById('trMotorLinha');
  return {
    pararVisivel: !!c && !c.classList.contains('hide'),
    pararTxt: (c ? c.textContent : '').trim(),
    pararTravado: !!c && c.disabled,
    etapa: ((a.querySelector('.trEtapa') || {}).textContent || '').trim(),
    pct: ((a.querySelector('.trPct') || {}).textContent || '').trim(),
    eta: ((a.querySelector('.trEta') || {}).textContent || '').trim(),
    astatus: (a.textContent || '').trim(),
    astatusVivo: a.getAttribute('aria-live'),
    motorVisivel: !!m && !m.classList.contains('hide'),
    motorAberto: (document.getElementById('trMotorBtn') || {}).getAttribute
                 ? document.getElementById('trMotorBtn').getAttribute('aria-expanded') : null,
    motorTxt: (document.getElementById('trMotorCx').textContent || '').trim(),
    motorEscondido: document.getElementById('trMotorCx').classList.contains('hide'),
    faixaTxt: (document.getElementById('faixaTxt') || {}).textContent || '',
  };
});

console.log('[1] a transcrição corre, e agora existe um jeito de parar');
await pg.locator('#auto').click();
/* Três despachos: dois trechos terminados — que é o mínimo para haver ritmo
   medido, e portanto previsão — e o terceiro em curso. */
await pg.waitForFunction(() => (globalThis.__reg && globalThis.__reg.chamadas.length) >= 3,
                         null, { timeout: 120000 });
/* E daqui em diante o trecho em curso fica pendurado: o teste lê a tela sem
   correr contra o relógio da máquina em que ele está rodando. */
await pg.evaluate(() => { globalThis.__pausado = true; });
await pg.waitForTimeout(600);
{
  const e = await estado();
  const plano = await pg.evaluate(() => window.__ultimoPlano || {});
  console.log('     janelas do plano: ' + JSON.stringify(plano));
  console.log('     botão: "' + e.pararTxt + '"');
  ok('o botão de parar está na tela durante a transcrição', e.pararVisivel === true);
  /* "Parar", sozinho, é o rótulo da varredura e não responde a pergunta de
     quem está no minuto doze de quarenta: perco o que já saiu? */
  ok('e ele diz que o trabalho feito FICA',
     /ficar com o que já está pronto/i.test(e.pararTxt), e.pararTxt);
  /* Um vídeo de uma janela não prova nada sobre parar entre janelas. */
  ok('a amostra tem trechos suficientes para haver um "próximo"',
     (plano.total || 0) >= 3, String(plano.total));
}

console.log('\n[2] a linha de estado está partida em cinco, e não numa frase só');
{
  const e = await estado();
  console.log('     etapa="' + e.etapa + '"  progresso="' + e.pct + '"  previsão="' + e.eta + '"');
  console.log('     motor: "' + e.motorTxt + '" (recolhido: ' + e.motorEscondido + ')');
  ok('ETAPA tem lugar próprio', /transcrevendo/i.test(e.etapa), e.etapa);
  ok('PROGRESSO tem lugar próprio', /^\d+\s*%$/.test(e.pct), e.pct);
  ok('MOTOR aparece, e recolhido',
     e.motorVisivel === true && e.motorEscondido === true && e.motorAberto === 'false',
     JSON.stringify({ v: e.motorVisivel, esc: e.motorEscondido, exp: e.motorAberto }));
  /* A faixa fixa continua se descrevendo pelo #astatus: partir a linha em
     partes com nome não pode ter criado um segundo lugar onde mora a frase —
     nem colado os três fatos numa palavra só, que foi o que aconteceu na
     primeira tentativa, com o separador no CSS. */
  ok('e a faixa fixa continua lendo a mesma linha',
     e.faixaTxt.includes(e.etapa) && e.faixaTxt.includes(e.pct), e.faixaTxt);
  ok('com os fatos separados, e não colados',
     /Transcrevendo\s*·\s*\d+\s*%/.test(e.faixaTxt), e.faixaTxt);
}

console.log('\n[2b] a previsão aparece quando o ritmo já foi medido');
{
  /* Antes de dois trechos no mesmo modo não há ritmo, e uma previsão sobre uma
     amostra só é chute. Ela nasce vazia de propósito — e tem de nascer. */
  const e = await estado();
  console.log('     previsão="' + e.eta + '"');
  ok('PREVISÃO tem lugar próprio', /faltam/i.test(e.eta), e.eta);
}

console.log('\n[3] o motor abre, e diz onde a coisa está correndo');
{
  await pg.locator('#trMotorBtn').click();
  await pg.waitForTimeout(200);
  const e = await estado();
  console.log('     ' + e.motorTxt);
  ok('a gaveta abriu', e.motorEscondido === false && e.motorAberto === 'true');
  ok('e nomeia o motor', /processador|placa/i.test(e.motorTxt), e.motorTxt);
  ok('com o trecho em curso dentro, e não na linha de cima',
     /\d+\s+de\s+\d+/.test(e.motorTxt) && !/\d+\s+de\s+\d+/.test(e.etapa), e.motorTxt);
}

console.log('\n[4] uma varredura que termina NÃO leva o botão de parar embora');
{
  /* O defeito de origem, e a razão de o botão ter deixado de ser mostrado e
     escondido à mão: os dois trabalhos correm juntos, e o primeiro a terminar
     apagava o estado do outro. */
  await pg.locator('#extract').click();
  await pg.waitForFunction(() => document.getElementById('barWrap').classList.contains('hide'),
                           null, { timeout: 120000 });
  await pg.waitForTimeout(200);
  const e = await estado();
  const indo = await pg.evaluate(() => (window.__trabalhos ? window.__trabalhos() : []));
  console.log('     trabalhando: ' + JSON.stringify(indo));
  ok('a transcrição ainda está correndo', indo.includes('transcricao'), JSON.stringify(indo));
  ok('a varredura já saiu', !indo.includes('varredura'), JSON.stringify(indo));
  ok('e o botão de parar continua lá', e.pararVisivel === true);
}

console.log('\n[5] o clique não promete cortar o que já foi despachado');
let feitasAoParar = 0;
{
  /* O pedido chega com um trecho JÁ DESPACHADO ao modelo — o estado que o
     produto promete tratar, e o que ele não pode prometer é cortá-lo. */
  const aindaIndo = await pg.evaluate(
    () => (window.__trabalhos ? window.__trabalhos() : []).includes('transcricao'));
  ok('a transcrição está de pé, com um trecho pendurado', aindaIndo === true);
  feitasAoParar = await pg.evaluate(() => globalThis.__reg.chamadas.length);
  await pg.locator('#cancel').click();
  await pg.waitForTimeout(200);
  const e = await estado();
  console.log('     botão: "' + e.pararTxt + '"  travado: ' + e.pararTravado);
  ok('o rótulo passa a dizer que a parada é DEPOIS deste trecho',
     /após este trecho/i.test(e.pararTxt), e.pararTxt);
  /* Um botão que continua clicável depois do pedido convida ao segundo
     clique, e o segundo clique não tem o que fazer. */
  ok('e ele não pede o mesmo duas vezes', e.pararTravado === true);
  /* E o pedido, sozinho, não desfaz nem adianta nada: o trecho pendurado
     continua pendurado, e nenhum novo entrou. */
  ok('e nada foi despachado por causa do pedido',
     await pg.evaluate(() => globalThis.__reg.chamadas.length) === feitasAoParar);
}

console.log('\n[6] ela para de verdade, e o que já saiu fica');
{
  /* Solto o trecho pendurado. Daqui em diante quem decide é o produto. */
  await pg.evaluate(() => { globalThis.__pausado = false; });
  await pg.waitForFunction(() => !document.getElementById('auto').disabled,
                           null, { timeout: 120000 });
  await pg.waitForTimeout(400);
  const r = await pg.evaluate(() => ({
    chamadas: globalThis.__reg.chamadas.length,
    plano: window.__ultimoPlano || {},
    texto: document.getElementById('tr').value,
    st: (document.getElementById('astatus').textContent || '').trim(),
  }));
  const cues = (r.texto.match(/-->/g) || []).length;
  console.log('     inferências: ' + r.chamadas + ' de ' + r.plano.total + ' trechos');
  console.log('     texto: ' + cues + ' falas');
  console.log('     ' + r.st);
  ok('parou antes do fim', r.chamadas < r.plano.total,
     r.chamadas + '/' + r.plano.total);
  /* O número EXATO, e não "poucos": nenhuma inferência começou depois do
     pedido. Ela não corta o trecho em curso — e também não deixa entrar o
     seguinte, que é a outra metade da promessa. */
  ok('nenhum trecho novo entrou depois do pedido', r.chamadas === feitasAoParar,
     r.chamadas + ' vs ' + feitasAoParar);
  /* E o trecho que estava pendurado foi APROVEITADO, e não jogado fora: parar
     é ficar com o que já está pronto, inclusive com o que acabou de ficar. */
  ok('e o trecho pendurado entrou no texto', cues === feitasAoParar,
     cues + ' falas para ' + feitasAoParar + ' trechos');
  /* "Ficar com o que já está pronto" é o nome do botão. Se o texto sumisse,
     o botão seria uma mentira com rótulo simpático. */
  ok('o texto transcrito até ali FICOU', cues >= 2, String(cues));
  ok('e ele é WEBVTT de verdade', /^WEBVTT/.test(r.texto.trim()));
  /* "Pode sair incompleto" não deixa ninguém decidir nada. Minutos, sim. */
  ok('a tela diz que fui EU que parei', /parei a seu pedido/i.test(r.st), r.st);
  ok('e quanto de gravação ficou de fora, em minutos',
     /cerca de .*(min|s)\b/i.test(r.st) || /não falta fala nenhuma/i.test(r.st), r.st);
  ok('o campo destravou para correção', await pg.evaluate(
     () => !document.getElementById('tr').readOnly));
  ok('e a medição registrou a parada',
     medidos.some(m => m.p_nome === 'parou_fala'),
     JSON.stringify(medidos.map(m => m.p_nome)));
}

console.log('\n[7] o botão sai da tela quando não há mais o que parar');
{
  const e = await estado();
  ok('parar sumiu', e.pararVisivel === false);
  ok('e o motor recolhido também', e.motorVisivel === false);
}

console.log('\n[8] o leitor de tela ouviu o que importa, e só');
{
  const ditos = await pg.evaluate(() => window.__ditos || []);
  ditos.forEach((d, i) => console.log('     ' + (i + 1) + '. ' + d));
  ok('anunciou o começo', ditos.some(d => /começada/i.test(d)), JSON.stringify(ditos));
  ok('anunciou o pedido de parada',
     ditos.some(d => /vou parar depois deste trecho/i.test(d)), JSON.stringify(ditos));
  ok('anunciou o fim, com o número', ditos.some(d => /parada a seu pedido/i.test(d)),
     JSON.stringify(ditos));
  /* O NÚMERO é o teste. Cinco trechos poderiam virar cinco anúncios de
     porcentagem, e num vídeo de quarenta minutos seriam oitenta — um leitor
     de tela lendo "47%… 48%…" por quarenta minutos atropela quem está
     tentando fazer outra coisa na mesma tela. */
  ok('e não narrou trecho a trecho', ditos.length <= 8, String(ditos.length));
  const e = await estado();
  /* A linha visual NÃO pode ser região viva: é ela que muda o tempo todo. */
  ok('a linha de progresso não é região viva', !e.astatusVivo, String(e.astatusVivo));
  ok('a região que fala é polida', await pg.evaluate(
     () => document.getElementById('trFala').getAttribute('aria-live')) === 'polite');
}

console.log('\n[9] o documento não chama de completa a fala que eu interrompi');
{
  const dl = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#docx').click();
  const d = await dl; await d.saveAs('/tmp/parar.docx');
  await pg.waitForTimeout(600);
  const resumo = await pg.evaluate(
    () => (document.getElementById('fimResumo') || {}).textContent || '');
  console.log('     ' + resumo);
  ok('o painel de conclusão apareceu', await pg.evaluate(
     () => !document.getElementById('fimCx').classList.contains('hide')));
  ok('e a fala está marcada como parcial', /parcial/i.test(resumo), resumo);
  ok('com o motivo dito: fui eu que parei', /parou antes do fim/i.test(resumo), resumo);
}

console.log('\n[10] carregar uma legenda de fora desfaz a marca de parcial');
{
  /* O texto deixou de ser o nosso parcial: veio inteiro, de outro lugar. */
  await pg.setInputFiles('#vttFile', {
    name: 'reuniao.vtt', mimeType: 'text/vtt',
    buffer: Buffer.from('WEBVTT\n\n00:00:00.000 --> 00:00:09.000\nabri o portal de compras\n\n' +
                        '00:02:20.000 --> 00:02:28.000\ne conferi a nota fiscal\n') });
  await pg.waitForTimeout(700);
  const dl = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#docx').click();
  const d = await dl; await d.saveAs('/tmp/parar2.docx');
  await pg.waitForTimeout(600);
  const resumo = await pg.evaluate(
    () => (document.getElementById('fimResumo') || {}).textContent || '');
  console.log('     ' + resumo);
  ok('a fala volta a ser contada sem ressalva', !/parcial/i.test(resumo), resumo);
}

console.log('\n[11] a segunda transcrição não nasce parada');
{
  /* O pedido é DESTA transcrição. Um pedido que sobrevivesse mataria a
     próxima no primeiro trecho — a ferramenta desistindo sozinha de um
     trabalho que a pessoa acabou de mandar começar. */
  await pg.locator('#auto').click();
  await pg.waitForFunction(() => (globalThis.__reg && globalThis.__reg.chamadas.length) >= 1,
                           null, { timeout: 120000 });
  await pg.waitForTimeout(200);
  const e = await estado();
  console.log('     botão: "' + e.pararTxt + '"  travado: ' + e.pararTravado);
  ok('o botão volta a convidar a parar, e não a dizer que já está parando',
     /ficar com o que já está pronto/i.test(e.pararTxt) && e.pararTravado === false,
     e.pararTxt);
  await pg.locator('#cancel').click();
  await pg.waitForFunction(() => !document.getElementById('auto').disabled,
                           null, { timeout: 120000 });
}

console.log('\n[12] os cinco idiomas têm o rótulo, e nenhum mostra chave crua');
{
  for (const L of ['en', 'es', 'de', 'fr']) {
    const p2 = await ctx.newPage();
    await p2.goto('http://localhost:8949/app.html?lang=' + L);
    await p2.waitForTimeout(400);
    /* O rótulo do parar não vem de `data-i18n`: ele tem dois textos e um
       terceiro estado, e por isso é escrito à mão. Uma chave esquecida aqui
       apareceria como texto cru na tela — em quatro idiomas de uma vez. */
    const cru = await p2.evaluate(() =>
      /\b(trPararBtn|trParando|trEtapaFala|trMotorVer|fimFalaParcial)\b/.test(document.body.innerText));
    ok(L + ': nenhuma chave crua na tela', cru === false);
    await p2.close();
  }
}

console.log(erros.length ? '\nerros de JS: ' + erros.join(' | ') : '\nsem erro de JS');
if (erros.length) falhas++;
await br.close(); srv.close();
console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTodas as verificações passaram.');
process.exit(falhas ? 1 : 0);
