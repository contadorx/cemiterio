/* O QUE UMA GRAVAÇÃO REAL FAZ, E O DETECTOR PRECISA AGUENTAR E O DETECTOR PRECISA AGUENTAR.
 *
 * 1. ROLAR UMA LISTA e parar. Relatado com o Gmail: rolar a caixa de entrada e
 *    não sair quadro. O cenário aqui é uma caixa de entrada de verdade — as
 *    linhas ANDAM em pixel, com avatar colorido e assunto de comprimento
 *    variável. A primeira versão deste teste renumerava um texto PARADO, o que
 *    o Gmail não faz, e falhava por causa do cenário: quase me fez mexer num
 *    detector que estava certo.
 *
 * 2. A GAGUEIRA. Diante de ruído sem fala, o Whisper entra em laço e devolve a
 *    mesma palavra centenas de vezes dentro de UM trecho. A trava antiga
 *    comparava trechos vizinhos e não via nada: para ela era um trecho só, com
 *    um texto comprido. O laço mora dentro do trecho.
 *
 * 3. UMA REGIÃO QUE PARA. Metade da tela é vídeo tocando e enche a máscara de
 *    movimento; quando ela congela numa imagem nova, o que mudou está dentro da
 *    máscara. O que salva é o desmanche dela — e este bloco existe para que o
 *    desmanche não possa ser desligado sem alguém ficar sabendo.
 */
import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT = `${RAIZ_WS}/public`;
const html = fs.readFileSync(ROOT + '/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end('') }
  r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(html);
});
await new Promise(r => srv.listen(8937, r));

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const br = await chromium.launch({
  executablePath: CHROME_WS,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
         '--auto-accept-this-tab-capture'],
});

console.log('[1] rolar uma lista e parar tem que virar quadro');
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 950 } });
  const pg = await ctx.newPage();
  const erros = []; pg.on('pageerror', e => erros.push(e.message));
  await pg.goto('http://localhost:8937/app.html?lang=pt');
  await pg.waitForTimeout(400);
  await pg.selectOption('#modelo', 'outro');   // vira "equilibrado" sozinho
  await pg.locator('#recTr').uncheck();
  await pg.evaluate(() => window.__contagem(1));
  /* UMA CAIXA DE ENTRADA DE VERDADE.
     A primeira versão deste teste renumerava um texto parado em vez de rolar
     pixel — e um texto parado que troca de dígito não é o que o Gmail faz. Ele
     falhava por causa do cenário, não do produto, e teria me feito "consertar"
     um detector que estava certo. Aqui as linhas ANDAM: avatar colorido,
     assunto de comprimento variável, remetente em negrito quando não lido. */
  await pg.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 900; c.height = 600;
    const cx = c.getContext('2d');
    const P = ['relatório','proposta','contrato','reunião','fatura',
               'pedido','entrega','revisão','orçamento','convite'];
    const ASSUNTOS = [];
    for (let i = 0; i < 60; i++) {
      let t = ''; const n = 3 + (i * 7) % 9;
      for (let k = 0; k < n; k++) t += P[(i * 3 + k) % 10] + ' ';
      ASSUNTOS.push(t.trim());
    }
    window.__scroll = 0;
    const LIN = 44;
    setInterval(() => {
      const s = window.__scroll, off = s % LIN, i0 = Math.floor(s / LIN);
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, 900, 600);
      for (let r = 0; r < 15; r++) {
        const idx = (i0 + r) % 60, y = 20 + r * LIN - off;
        cx.fillStyle = idx % 3 === 0 ? '#f6f8fc' : '#fff';
        cx.fillRect(0, y - 16, 900, LIN - 2);
        cx.fillStyle = ['#c0392b','#2980b9','#27ae60','#8e44ad','#d35400'][idx % 5];
        cx.beginPath(); cx.arc(34, y + 2, 13, 0, 7); cx.fill();
        cx.fillStyle = '#15171C';
        cx.font = (idx % 4 === 0 ? 'bold ' : '') + '15px sans-serif';
        cx.fillText('Remetente ' + idx, 62, y + 7);
        cx.fillStyle = '#3c4043'; cx.font = '15px sans-serif';
        cx.fillText(ASSUNTOS[idx], 230, y + 7);
      }
    }, 60);
    navigator.mediaDevices.getDisplayMedia = async () => c.captureStream(30);
  });

  await pg.locator('#rec').click();
  await pg.waitForSelector('#recStop:visible', { timeout: 40000 });
  await pg.waitForTimeout(2500);
  const antes = await pg.evaluate(() => document.querySelectorAll('#thumbs figure').length);

  /* O gesto do relato: ROLAR SEM PARAR tempo bastante para a máscara de
     movimento se formar (a janela é de doze amostras, ~8,4 s) e só então
     parar. É esse "e só então parar" que a máscara cegava: o conteúdo novo
     está justamente nas células que ela mandou ignorar. */
  for (let volta = 0; volta < 2; volta++) {
    await pg.evaluate(() => {
      clearInterval(window.__rol);
      window.__rol = setInterval(() => { window.__scroll += 6; }, 60);
    });
    await pg.waitForTimeout(12000);                       // rolando
    await pg.evaluate(() => clearInterval(window.__rol)); // parou
    await pg.waitForTimeout(5000);                        // lendo
  }

  const mascarou = await pg.evaluate(() => (window.__motivos || {}).mascaradas | 0);
  await pg.locator('#recStop').click();
  await pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null,
                           null, { timeout: 60000 });
  await pg.waitForTimeout(1500);
  const n = await pg.locator('#thumbs figure').count();
  console.log(`      quadros: ${n}  células mascaradas ao fim: ${mascarou}`);
  console.log('      motivos:', await pg.evaluate(() => JSON.stringify(window.__motivos || null)));
  /* Sem afirmar que a máscara ENCHEU não há teste nenhum: sem máscara o caso
     do relato nem acontece, e o teste passaria verde sobre um produto cego. */
  ok('a máscara de movimento chegou a se formar', mascarou >= 12, String(mascarou));
  /* Abertura e fechamento são forçadas. O que se afirma é que as duas PARADAS
     viraram quadro, mais os quadros de válvula durante a rolagem. */
  ok('rolar e parar virou quadro', n >= 4, String(n));
  ok('e não virou flipbook', n <= 12, String(n));
  ok('sem erro de JavaScript', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

console.log('\n[2] a gagueira do modelo não entra na transcrição');
{
  const ctx = await br.newContext();
  const pg = await ctx.newPage();
  await pg.goto('http://localhost:8937/app.html?lang=pt');
  await pg.waitForTimeout(300);
  const casos = await pg.evaluate(() => {
    const f = window.__semGagueira;
    return {
      ruido: f('Vem, ' + Array(170).fill('vim').join(', ')),
      grupo: f(Array(40).fill('obrigado pessoal').join(' ')),
      fala:  f('Então a gente clica aqui e o sistema mostra a tela de compras'),
      humano: f('não, não, não, isso aí não é o que eu queria mostrar agora'),
      curto: f('sim sim'),
    };
  });
  ok('o laço de uma palavra vira nada', casos.ruido === '', JSON.stringify(casos.ruido));
  ok('o laço de um grupo também', casos.grupo === '', JSON.stringify(casos.grupo));
  /* O estrago maior seria cortar fala de verdade: gente repete. */
  ok('fala normal passa intacta',
     casos.fala === 'Então a gente clica aqui e o sistema mostra a tela de compras');
  ok('e a repetição humana continua lá',
     /não, não, não/.test(casos.humano), casos.humano);
  ok('frase curta não é tocada', casos.curto === 'sim sim', casos.curto);
  await ctx.close();
}

console.log('\n[3] a máscara se desmancha quando a região para');
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 950 } });
  const pg = await ctx.newPage();
  const erros = []; pg.on('pageerror', e => erros.push(e.message));
  await pg.goto('http://localhost:8937/app.html?lang=pt');
  await pg.waitForTimeout(400);
  await pg.selectOption('#modelo', 'outro');
  /* A máscara é da REUNIÃO e só dela: no ritmo de todo dia ela deixava uma
     página de vídeo com um quadro em 36 segundos. Então é aqui que se escolhe
     o ritmo em que ela existe, senão este bloco testa o nada. */
  await pg.selectOption('#ritmo', 'reuniao');
  await pg.locator('#recTr').uncheck();
  await pg.evaluate(() => window.__contagem(1));
  /* Metade da tela é um vídeo tocando; a outra metade fica parada. O vídeo
     enche a máscara de movimento. Depois ele CONGELA numa imagem diferente da
     que estava quando o último quadro foi guardado — e o que mudou está
     inteiramente dentro da máscara.

     Quem resolve é o desmanche: a janela é de doze amostras com teto de 60%,
     então cinco amostras depois de parar as células saem da máscara sozinhas e
     a comparação volta a enxergá-las. Se alguém alargar a janela ou subir o
     teto sem perceber, é aqui que aparece. */
  await pg.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 960; c.height = 540;
    const cx = c.getContext('2d');
    let n = 0;
    window.__tocando = true;
    setInterval(() => {
      if (window.__tocando) n++;
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, 960, 540);
      // a metade parada
      cx.fillStyle = '#15171C'; cx.font = 'bold 34px sans-serif';
      cx.fillText('Painel', 30, 60);
      cx.fillStyle = '#e8eaf0'; cx.fillRect(20, 90, 420, 420);
      // a metade que toca
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          cx.fillStyle = `hsl(${(n * 37 + x * 23 + y * 41) % 360} 70% 55%)`;
          cx.fillRect(490 + x * 56, 90 + y * 52, 54, 50);
        }
    }, 90);
    navigator.mediaDevices.getDisplayMedia = async () => c.captureStream(30);
  });

  await pg.locator('#rec').click();
  await pg.waitForSelector('#recStop:visible', { timeout: 40000 });
  await pg.waitForTimeout(14000);          // tocando: a máscara se forma
  const pico = await pg.evaluate(() => (window.__motivos || {}).mascaradas | 0);
  const antes = await pg.evaluate(() => (window.__motivos || {}).guardados | 0);
  await pg.evaluate(() => { window.__tocando = false; });   // congelou
  await pg.waitForTimeout(20000);
  const depois = await pg.evaluate(() => (window.__motivos || {}).guardados | 0);
  console.log(`      máscara no pico: ${pico}  quadros antes: ${antes}  depois: ${depois}`);
  console.log('      motivos:', await pg.evaluate(() => JSON.stringify(window.__motivos || null)));
  ok('a máscara cobriu boa parte da tela', pico >= 100, String(pico));
  ok('congelar virou quadro mesmo dentro da máscara', depois > antes, `${antes} → ${depois}`);
  /* E rápido: o desmanche são cinco amostras de 700 ms. Se passar de nove
     segundos, o que guardou foi outra coisa (a válvula), não o desmanche. */
  ok('sem erro de JavaScript', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

console.log('\n[4] a frase do fim ensina qual botão apertar');
{
  /* "Dá para não esperar" não dizia COMO, e aparecia até quando não dava. A
     contagem e o convite viraram duas frases: a contagem sempre, o convite só
     quando o botão que o cumpre está na tela — e nomeando esse botão, em cada
     idioma. Aqui se lê o arquivo entregue, que é o que chega em quem usa. */
  const pega = (k) => [...html.matchAll(new RegExp(k + ":\\s*'((?:[^'\\\\]|\\\\.)*)'", 'g'))]
                        .map(m => m[1]);
  const conta = pega('recTailN'), convite = pega('recTailPular'), botao = pega('recStopBtn');
  ok('a contagem existe nos cinco idiomas', conta.length === 5, String(conta.length));
  ok('o convite existe nos cinco idiomas', convite.length === 5, String(convite.length));
  ok('o botão tem nome nos cinco idiomas', botao.length === 5, String(botao.length));
  ok('a contagem não promete pular sozinha',
     conta.every(v => !/n[aã]o esperar|skip|no esperar|nicht warten|ne pas attendre/i.test(v)),
     conta.join(' | '));
  ok('o convite nomeia o botão em todos',
     convite.length === 5 && convite.every(v => v.includes('{0}')), convite.join(' | '));
  /* E a frase só é montada quando o botão está visível: se esta condição sumir
     do código, o convite volta a aparecer para quem não tem como cumpri-lo. */
  ok('o convite só sai com o botão na tela',
     /podePular\s*=\s*\$\('recStop'\)/.test(html) &&
     /podePular\s*\?\s*' '\s*\+\s*t\('recTailPular'/.test(html));
}

console.log('\n[5] uma página de vídeo não pode terminar com um quadro só');
{
  const ctx = await br.newContext({ viewport: { width: 1280, height: 950 } });
  const pg = await ctx.newPage();
  const erros = []; pg.on('pageerror', e => erros.push(e.message));
  await pg.goto('http://localhost:8937/app.html?lang=pt');
  await pg.waitForTimeout(400);
  await pg.selectOption('#modelo', 'tutorial');   // vira "equilibrado" sozinho
  await pg.locator('#recTr').uncheck();
  await pg.evaluate(() => window.__contagem(1));
  /* O YouTube: o vídeo ocupa metade da tela e nunca para; em volta, título,
     sugestões e um painel — tudo parado. A cena do vídeo troca três vezes.

     Com a máscara de movimento ligada neste ritmo, o vídeo inteiro entrava na
     máscara e quem decidia era a moldura parada: 36 segundos, três trocas de
     cena, UM quadro. É o relato "gravei com o YouTube e ficou pouco sensível".
     A máscara pergunta "o que se mexe sempre?" e responde "o vídeo" — certo
     numa chamada, onde o vídeo é moldura; errado num tutorial, onde ele é o
     assunto. */
  await pg.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1000; c.height = 620;
    const cx = c.getContext('2d');
    let n = 0; window.__cena = 0;
    setInterval(() => {
      n++;
      cx.fillStyle = '#0f0f0f'; cx.fillRect(0, 0, 1000, 620);
      const base = [200, 40, 120, 280][window.__cena % 4];
      for (let y = 0; y < 10; y++) for (let x = 0; x < 16; x++) {
        cx.fillStyle = `hsl(${(base + n * 7 + x * 11 + y * 17) % 360} 60% ${30 + ((x + y + window.__cena * 3) % 5) * 8}%)`;
        cx.fillRect(20 + x * 42, 20 + y * 34, 41, 33);
      }
      cx.fillStyle = '#fff'; cx.font = 'bold 26px sans-serif';
      cx.fillText('Como configurar o ambiente — parte 3', 20, 400);
      cx.fillStyle = '#aaa'; cx.font = '16px sans-serif';
      for (let i = 0; i < 6; i++) cx.fillText('Sugestão de vídeo número ' + i + ' do canal', 20, 440 + i * 28);
      cx.fillStyle = '#222'; cx.fillRect(720, 20, 260, 580);
    }, 80);
    navigator.mediaDevices.getDisplayMedia = async () => c.captureStream(30);
  });

  await pg.locator('#rec').click();
  await pg.waitForSelector('#recStop:visible', { timeout: 40000 });
  for (let i = 1; i <= 3; i++) {
    await pg.waitForTimeout(9000);
    await pg.evaluate(() => { window.__cena++; });
  }
  await pg.waitForTimeout(9000);
  await pg.locator('#recStop').click();
  await pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null,
                           null, { timeout: 60000 });
  await pg.waitForTimeout(1500);
  const n = await pg.locator('#thumbs figure').count();
  console.log(`      quadros em ~36 s de vídeo: ${n}`);
  ok('a página de vídeo rendeu mais de um quadro', n >= 3, String(n));
  /* E nem por isso vira flipbook: a tela nunca assenta, então quem manda é a
     válvula de 10 s — um quadro a cada dez segundos, não um por segundo. */
  ok('e não virou flipbook', n <= 8, String(n));
  ok('sem erro de JavaScript', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

await br.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\ntudo certo');
process.exit(falhas ? 1 : 0);
