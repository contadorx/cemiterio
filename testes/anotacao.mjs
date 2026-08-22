/* A ANOTAÇÃO AO VIVO — escrever no calor do momento, e ver que guardou.
 *
 * Ela já esteve na tela, saiu, e volta. O motivo da saída não era falso —
 * "confusa, e não ajuda" — e é ele que define o que este arquivo cobra: a
 * versão antiga era um campo de UMA LINHA, que não dizia sobre qual tela se
 * estava escrevendo, sem botão e sem nenhum sinal de que o texto tinha sido
 * guardado. Guardar era um ato de fé.
 *
 * As afirmações:
 *
 *   1. a caixa só aparece DEPOIS de haver o que comentar, e diz sobre o quê —
 *      "Passo 1" quando se marca um passo, "Tela 2 do Passo 1" quando se
 *      acrescenta uma tela ao passo em curso;
 *   2. o botão MUDA DE ESTADO: desligado sem texto novo, cheio com texto
 *      esperando, e "✓ Salvo" depois de guardar;
 *   3. está escrito, em palavras, que guardou e ONDE guardou;
 *   4. trocar de alvo NÃO PERDE o que estava escrito — é a única forma de perda
 *      que este produto não aceita, porque é silenciosa;
 *   5. e o texto sai no DOCUMENTO, que é a razão de tudo isto.
 *
 *   node testes/anotacao.mjs
 */
import { chromium } from './_navegador.mjs';   // abre os painéis e a gaveta das saídas
import http from 'http'; import fs from 'fs'; import path from 'path';

import { CHROME_WS } from './_caminhos.mjs';
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'public');
const CHROME = process.env.CHROME || CHROME_WS;
const html = fs.readFileSync(RAIZ + '/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (u.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end(''); }
  if (u === '/sw.js') { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end(fs.readFileSync(RAIZ+'/sw.js')); }
  r.writeHead(200, { 'Content-Type':'text/html' }); r.end(html);
});
await new Promise(r => srv.listen(8973, r));

/* Ler um zip sem biblioteca: caminhar pelos cabeçalhos locais. Os nossos vão
   sem compressão para o XML, que é o que este arquivo precisa. */
function lerZip(caminho){
  const b = fs.readFileSync(caminho);
  const saida = {};
  let i = 0;
  while ((i = b.indexOf('PK\x03\x04', i)) !== -1) {
    const nl = b.readUInt16LE(i+26), el = b.readUInt16LE(i+28), n = b.readUInt32LE(i+18);
    const nome = b.subarray(i+30, i+30+nl).toString('utf8');
    saida[nome] = b.subarray(i+30+nl+el, i+30+nl+el+n);
    i = i+30+nl+el+n;
  }
  return saida;
}

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const br = await chromium.launch({ executablePath: CHROME,
  args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await br.newContext({ viewport: { width: 1250, height: 980 }, acceptDownloads: true });
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', e => erros.push(e.message));
await pg.route('**/rpc/*stamp_*', r => r.fulfill({ status:200, headers:{'access-control-allow-origin':'*'}, body:'null' }));
await pg.addInitScript(() => {
  function tela(){
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const g = c.getContext('2d'); let i = 0;
    setInterval(() => { i++; g.fillStyle = ['#123','#eee','#567','#fa0','#0af'][i%5];
                        g.fillRect(0,0,1280,720); }, 700);
    return c.captureStream(12);
  }
  navigator.mediaDevices.getDisplayMedia = async () => tela();
  navigator.mediaDevices.getUserMedia = async () => { throw new Error('sem mic'); };
});
await pg.goto('http://localhost:8973/app.html?lang=pt');
await pg.selectOption('#modelo', 'evidencia').catch(() => {});
await pg.waitForTimeout(600);

const estado = () => pg.evaluate(() => {
  const cx = document.getElementById('anotCx');
  const bt = document.getElementById('anotSalvar');
  return {
    visivel: !!cx && !cx.classList.contains('hide'),
    rotulo: (document.getElementById('anotLbl')||{}).textContent || '',
    texto: (document.getElementById('anotTxt')||{}).value || '',
    btTexto: (bt||{}).textContent || '',
    btLigado: !!bt && !bt.disabled,
    btSalvo: !!bt && bt.classList.contains('salvo'),
    msg: (document.getElementById('anotMsg')||{}).textContent || '',
    linhas: (document.getElementById('anotTxt')||{}).rows || 0,
  };
});

console.log('\n[1] a caixa nasce fechada e abre quando há o que comentar');
{
  const e = await estado();
  ok('a caixa nasce escondida', e.visivel === false);
}

await pg.locator('#recTr').uncheck();
await pg.evaluate(() => window.__contagem(1));
await pg.locator('#rec').click();
await pg.waitForSelector('#recStop:visible', { timeout: 40000 });
await pg.waitForTimeout(2500);
{
  /* MUDOU, e para melhor. O primeiro quadro é capturado sozinho ao começar e
     abre o passo 1 do documento — quer dizer, já HÁ o que comentar, e a tela
     inicial não tinha como ser descrita a não ser depois, na grade. A caixa
     aponta para ele. */
  const e = await estado();
  ok('com a gravação rolando, ela já aponta para o passo 1', e.visivel === true);
  ok('e diz que é do Passo 1', /passo 1/i.test(e.rotulo), e.rotulo);
  ok('vazia, com o botão desligado', e.texto === '' && e.btLigado === false);
}

console.log('\n[2] marcar um passo abre a caixa, e ela diz sobre o quê');
await pg.locator('#recMark').click();
await pg.waitForTimeout(700);
{
  const e = await estado();
  console.log('     rótulo: ' + e.rotulo);
  ok('a caixa apareceu', e.visivel === true);
  /* A pergunta sem resposta da versão antiga: sobre qual tela eu escrevo? */
  ok('e diz que é do PASSO', /passo/i.test(e.rotulo), e.rotulo);
  /* Uma linha ENSINA a escrever pouco. Descrever o que aconteceu não cabe em
     quarenta caracteres. */
  ok('é uma caixa de texto, e não um campo de uma linha', e.linhas >= 3, String(e.linhas));
  ok('o botão nasce desligado: não há nada novo para salvar', e.btLigado === false);
  /* ---- O APERTO ----
     Ela mora dentro de um `.row` que é flex. Sem ocupar a linha inteira, ela
     dividia a largura com os botões de gravação: a caixa encolhia, o campo
     encolhia junto e o botão de salvar era empurrado para fora da vista pela
     mensagem ao lado. A régua é geométrica porque a queixa era geométrica. */
  const g = await pg.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect();
                      return { x:b.x, y:b.y, w:b.width, h:b.height, r:b.right, b:b.bottom }; };
    return { cx: r(document.getElementById('anotCx')),
             tx: r(document.getElementById('anotTxt')),
             bt: r(document.getElementById('anotSalvar')),
             via: r(document.getElementById('viaRec')) };
  });
  console.log('     caixa ' + Math.round(g.cx.w) + 'px  |  campo ' + Math.round(g.tx.w) +
              'px  |  botão ' + Math.round(g.bt.w) + 'x' + Math.round(g.bt.h));
  ok('a caixa ocupa a largura do cartão, e não uma fatia dele',
     g.cx.w > g.via.w * 0.85, Math.round(g.cx.w) + ' de ' + Math.round(g.via.w));
  ok('o campo de texto acompanha', g.tx.w > 300, String(Math.round(g.tx.w)));
  ok('o botão tem tamanho de botão', g.bt.w > 90 && g.bt.h > 24,
     Math.round(g.bt.w) + 'x' + Math.round(g.bt.h));
  ok('e cabe dentro da caixa, sem transbordar',
     g.bt.r <= g.cx.r + 1, Math.round(g.bt.r) + ' > ' + Math.round(g.cx.r));
  /* Clicável DE VERDADE: nada por cima, e dentro da janela. */
  ok('e o clique chega nele', await pg.locator('#anotSalvar').isVisible());
}

console.log('\n[3] o botão muda de estado, e a tela diz que guardou');
await pg.fill('#anotTxt', 'Cliquei em Salvar e o sistema devolveu a mensagem 4711.');
await pg.waitForTimeout(200);
{
  const e = await estado();
  console.log('     ' + e.btTexto.trim() + '   |   ' + e.msg.trim());
  ok('com texto novo, o botão liga', e.btLigado === true);
  ok('e a tela avisa que ainda não salvou', /não salvo|nao salvo/i.test(e.msg), e.msg);
}
await pg.locator('#anotSalvar').click();
await pg.waitForTimeout(400);
{
  const e = await estado();
  console.log('     ' + e.btTexto.trim() + '   |   ' + e.msg.trim());
  /* O ESTADO DO BOTÃO É A RESPOSTA para "ele salvou?". */
  ok('o botão vira "Salvo"', /salvo/i.test(e.btTexto), e.btTexto);
  ok('e muda de aparência, não só de texto', e.btSalvo === true);
  ok('e desliga: não há mais nada novo para guardar', e.btLigado === false);
  /* Está ESCRITO que guardou, e onde. */
  ok('a mensagem diz que salvou', /salva/i.test(e.msg), e.msg);
  ok('e diz em qual passo', /passo/i.test(e.msg), e.msg);
}

console.log('\n[4] mais uma tela: o rótulo muda, e o texto anterior não se perde');
await pg.locator('#recTela').click();
await pg.waitForTimeout(700);
{
  const e = await estado();
  console.log('     rótulo: ' + e.rotulo);
  ok('agora fala da TELA, e não do passo', /tela/i.test(e.rotulo), e.rotulo);
  ok('e a caixa vem vazia para a tela nova', e.texto === '', e.texto);
}
/* A perda silenciosa: digitar e marcar de novo sem apertar Salvar. */
await pg.fill('#anotTxt', 'A segunda tela mostra o número do documento gerado.');
await pg.waitForTimeout(150);
await pg.locator('#recMark').click();
await pg.waitForTimeout(700);
{
  const guardadas = await pg.evaluate(() => (window.__quadros ? window.__quadros() : [])
    .map(f => f.nota || '').filter(Boolean));
  console.log('     anotações guardadas: ' + guardadas.length);
  ok('o texto não salvo foi guardado ao trocar de alvo', guardadas.length === 2,
     JSON.stringify(guardadas));
  ok('e o primeiro continua lá', guardadas.some(x => /4711/.test(x)), JSON.stringify(guardadas));
  ok('e o segundo também', guardadas.some(x => /documento gerado/.test(x)), JSON.stringify(guardadas));
}

console.log('\n[5] a anotação sai no documento');
await pg.fill('#anotTxt', 'Terceiro passo: a tela de confirmação.');
await pg.locator('#anotSalvar').click();
await pg.waitForTimeout(300);
await pg.locator('#recStop').click();
await pg.waitForTimeout(2500);
{
  const e = await estado();
  ok('ao parar, a caixa se recolhe', e.visivel === false);
  const naGrade = await pg.evaluate(() =>
    [...document.querySelectorAll('.thumbs .nota')].map(i => i.value).filter(Boolean));
  console.log('     na grade: ' + naGrade.length + ' anotações');
  ok('as anotações estão na grade', naGrade.length >= 3, JSON.stringify(naGrade));
  /* O QUE IMPORTA: o texto sai no DOCUMENTO. O `.docx` é o caminho mais curto
     para provar isso sem interpretar PDF — `word/document.xml` é texto puro, e
     é o mesmo `f.nota` que o PDF e o .zip leem. */
  const dl = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#docx').click();
  const d = await dl;
  await d.saveAs('/tmp/anot.docx');
  const doc = lerZip('/tmp/anot.docx')['word/document.xml'].toString('utf8');
  ok('o documento traz a mensagem 4711', doc.includes('4711'));
  ok('e a segunda tela', /documento gerado/.test(doc));
  ok('e a terceira', /confirma/.test(doc));
}
console.log('\n[6] a janelinha não corta os botões');
{
  /* A caixa entrou na janelinha também, e ela tem 250px de largura e altura
     fixa. Um corpo mais alto do que a janela, centrado, era cortado nas DUAS
     pontas — e a de baixo é onde ficam PAUSAR e PARAR. */
  await pg.locator('#rec').click().catch(() => {});
  await pg.waitForSelector('#recStop:visible', { timeout: 40000 });
  await pg.waitForTimeout(2500);
  const jn = ctx.pages().find(x => x !== pg);
  if (!jn) { ok('a janelinha abriu', false, 'sem janelinha neste navegador'); }
  else {
    await jn.locator('#marcar').click();
    await jn.waitForTimeout(500);
    const m = await jn.evaluate(() => {
      /* A janelinha real tem 392px de altura; o navegador de teste entrega a
         página com a altura do contexto, e nessa altura tudo cabe — a régua
         mediria sempre verde. Então a altura de verdade é IMPOSTA aqui, e o
         que se mede é a geometria que a pessoa vê. */
      const ALT = 392;
      document.body.style.height = ALT + 'px';
      document.body.getBoundingClientRect();
      const alt = ALT;
      const fim = el => el ? el.getBoundingClientRect().bottom : 0;
      return { alt, corpo: document.body.scrollHeight,
               parar: fim(document.getElementById('stop')),
               pausa: fim(document.getElementById('pausa')),
               nota: !!document.getElementById('nota'),
               notaOn: !document.getElementById('nota').disabled };
    });
    console.log('     janela ' + m.alt + 'px  |  conteúdo ' + m.corpo +
                'px  |  PARAR termina em ' + Math.round(m.parar));
    ok('a caixa de anotação está na janelinha', m.nota);
    ok('e liga quando há passo marcado', m.notaOn);
    ok('o conteúdo cabe na janela', m.corpo <= m.alt + 1, m.corpo + ' > ' + m.alt);
    ok('PARAR está dentro da janela', m.parar > 0 && m.parar <= m.alt + 1,
       Math.round(m.parar) + ' > ' + m.alt);
    ok('PAUSAR também', m.pausa > 0 && m.pausa <= m.alt + 1,
       Math.round(m.pausa) + ' > ' + m.alt);

    /* ---- DIGITAR NA JANELINHA, COM TECLADO DE VERDADE ----
       Aqui morava o defeito que impedia de escrever: a regra lia SEMPRE o
       campo do cartão, e durante a gravação o cartão está atrás da tela
       compartilhada. Cada tecla digitada na janelinha era sobrescrita pelo
       vazio do outro campo — o botão acendia, dizia "ainda não salvo", e
       salvava nada. `fill()` não pegaria: ele atribui o valor de uma vez, e o
       defeito estava no caminho de UMA TECLA. */
    await jn.locator('#nota').click();
    await jn.keyboard.type('digitado na janelinha 9182');
    await jn.waitForTimeout(250);
    const v = await jn.evaluate(() => document.getElementById('nota').value);
    ok('o que se digita na janelinha FICA no campo', v === 'digitado na janelinha 9182', v);
    await jn.locator('#notaOk').click();
    await jn.waitForTimeout(400);
    const gv = await pg.evaluate(() => window.__quadros().map(f => f.nota || '').filter(Boolean));
    ok('e chega ao quadro ao salvar', gv.some(x => /janelinha 9182/.test(x)), JSON.stringify(gv));
    /* Os dois campos contam a mesma história: dois textos diferentes sobre o
       mesmo quadro seria pior do que não ter o segundo campo. */
    const naAba = await pg.evaluate(() => document.getElementById('anotTxt').value);
    ok('e o campo do cartão mostra o mesmo texto', /janelinha 9182/.test(naAba), naAba);
  }
  await pg.locator('#recStop').click().catch(() => {});
  await pg.waitForTimeout(1200);
}

ok('sem erro de página', erros.length === 0, erros[0]);

await br.close(); srv.close();
console.log(falhas ? `\n  ${falhas} falha(s)` : '\n  tudo certo');
process.exit(falhas ? 1 : 0);
