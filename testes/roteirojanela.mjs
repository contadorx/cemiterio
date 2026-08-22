/* O ROTEIRO NA JANELINHA — saber o próximo passo sem sair da tela gravada.
 *
 * Quem cola a lista de passos está SEGUINDO uma lista. Ela morava no cartão, e
 * durante a gravação o cartão está atrás da tela compartilhada — quer dizer,
 * em lugar nenhum. Para lembrar o passo seguinte era preciso alternar de
 * janela, que é exatamente o gesto que estraga a captura.
 *
 * O que este arquivo cobra:
 *
 *   1. a janelinha diz qual é o PRÓXIMO passo, em cima de tudo e legível;
 *   2. marcar CONSOME aquela linha e mostra a seguinte — o avanço não é um
 *      segundo mecanismo, é a consequência de o título ter sido entregue;
 *   3. o título entregue chega ao DOCUMENTO como descrição do passo;
 *   4. acabada a lista, a janelinha diz que acabou em vez de mentir.
 *
 *   node testes/roteirojanela.mjs
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
await new Promise(r => srv.listen(8974, r));

function lerZip(caminho){
  const b = fs.readFileSync(caminho); const saida = {}; let i = 0;
  while ((i = b.indexOf('PK\x03\x04', i)) !== -1) {
    const nl = b.readUInt16LE(i+26), el = b.readUInt16LE(i+28), n = b.readUInt32LE(i+18);
    saida[b.subarray(i+30, i+30+nl).toString('utf8')] = b.subarray(i+30+nl+el, i+30+nl+el+n);
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
await pg.goto('http://localhost:8974/app.html?lang=pt');
await pg.selectOption('#modelo', 'evidencia').catch(() => {});
await pg.waitForTimeout(500);

const PASSOS = ['Abrir a transação FB60',
                'Preencher o centro de custo',
                'Salvar e anotar o número do documento'];

console.log('\n[1] colar o roteiro');
await pg.locator('#roteiroAbrir').click();
await pg.fill('#roteiroTxt', PASSOS.map((p, i) => (i+1) + '. ' + p).join('\n'));
await pg.locator('#roteiroUsar').click();
await pg.waitForTimeout(300);
ok('o cartão conta os passos', /3 passos/.test(await pg.locator('#roteiroConta').textContent()),
   await pg.locator('#roteiroConta').textContent());

/* ---- E AGORA O CAMINHO DE VERDADE: COLAR E NÃO CLICAR ----
   A caixa aceitava o texto e ficava com ele. Sem o clique em "Usar este
   roteiro" nada valia: janelinha sem passo, documento sem título, e nenhum
   erro para explicar — a lista estava ali, na tela, aparentemente aceita.
   Aqui a régua faz exatamente o que a pessoa fez. */
await pg.locator('#roteiroTirar').click();
await pg.waitForTimeout(200);
await pg.fill('#roteiroTxt', PASSOS.map((p, i) => (i+1) + '. ' + p).join('\n'));
await pg.waitForTimeout(150);
ok('sem clicar em Usar, o roteiro ainda não vale',
   (await pg.evaluate(() => document.getElementById('roteiroConta').textContent)) === '');

await pg.locator('#recTr').uncheck();
await pg.evaluate(() => window.__contagem(1));
await pg.locator('#rec').click();
await pg.waitForSelector('#recStop:visible', { timeout: 40000 });
await pg.waitForTimeout(2500);

const jn = ctx.pages().find(p => p !== pg);
if (!jn) { ok('a janelinha abriu', false); }
else {
  jn.on('pageerror', e => erros.push('janelinha: ' + e.message));
  const rot = () => jn.evaluate(() => {
    const cx = document.getElementById('rot');
    const t = document.getElementById('rotT');
    const cs = getComputedStyle(t);
    const corpo = getComputedStyle(document.body).fontSize;
    const px = document.getElementById('rotP');
    return { visivel: !cx.classList.contains('hide'),
             fim: cx.classList.contains('fim'),
             n: document.getElementById('rotN').textContent,
             txt: t.textContent,
             prox: px.classList.contains('hide') ? '' : px.textContent,
             fonteProx: parseFloat(getComputedStyle(px).fontSize),
             fonte: parseFloat(cs.fontSize), fonteCorpo: parseFloat(corpo),
             topo: Math.round(cx.getBoundingClientRect().top),
             topoRelogio: Math.round(document.querySelector('.top').getBoundingClientRect().top) };
  });

  console.log('\n[2] a janelinha diz qual é o próximo passo');
  {
    const r = await rot();
    console.log('     ' + r.n + '  |  ' + r.txt + '   (' + r.fonte + 'px)');
    /* Ninguém clicou em "Usar": foi o começo da gravação que adotou o texto. */
    ok('o roteiro colado passou a valer ao gravar', r.visivel === true);
    /* COMEÇA NO 1, E FICA NO 1. Ela chegou a abrir no 2, porque o quadro
       capturado sozinho ao começar consumia a primeira linha: o número andava
       sem ninguém ter feito nada. Um contador que anda sozinho não é um
       roteiro, é um relógio. */
    ok('ela começa no passo 1', /Passo 1 de 3/.test(r.n), r.n);
    ok('e mostra o texto do passo 1', r.txt === PASSOS[0], r.txt);
    /* "a primeira informação, com uma fonte um pouco maior" */
    ok('vem ANTES do relógio', r.topo < r.topoRelogio, r.topo + ' vs ' + r.topoRelogio);
    ok('e é maior que o corpo da janelinha', r.fonte > r.fonteCorpo,
       r.fonte + 'px vs ' + r.fonteCorpo + 'px');
    /* O SEGUINTE, MENOR. Descobrir o próximo passo no instante em que se
       acabou de marcar é ler no pior momento: a pessoa está mudando de tela. */
    console.log('     ' + r.prox + '   (' + r.fonteProx + 'px)');
    ok('mostra também o passo seguinte', r.prox.includes(PASSOS[1]), r.prox);
    ok('e ele é MENOR que o passo atual', r.fonteProx < r.fonte,
       r.fonteProx + 'px vs ' + r.fonte + 'px');
  }

  console.log('\n[3] marcar passa para o próximo');
  await jn.locator('#marcar').click();
  await jn.waitForTimeout(700);
  {
    const r = await rot();
    console.log('     ' + r.n + '  |  ' + r.txt);
    ok('agora é o passo 2', /Passo 2 de 3/.test(r.n), r.n);
    ok('com o texto do passo 2', r.txt === PASSOS[1], r.txt);
    /* A primeira marcação COMPLETA o passo 1 em vez de abrir o 2: a tela antes
       da ação e a tela depois dela são as duas telas do mesmo passo. Por isso
       o título foi para o PRIMEIRO quadro, e não para o que acabou de entrar. */
    const notas = await pg.evaluate(() => window.__quadros().map(f => f.nota || '').filter(Boolean));
    ok('a linha 1 foi para o primeiro quadro', notas[0] === PASSOS[0], JSON.stringify(notas));
    ok('e só ela: uma marcação, uma linha', notas.length === 1, JSON.stringify(notas));
    console.log('     seguinte: ' + JSON.stringify(r.prox));
    ok('e o "a seguir" andou junto', r.prox.includes(PASSOS[2]), r.prox);
  }
  await jn.locator('#marcar').click(); await jn.waitForTimeout(700);
  {
    const r = await rot();
    console.log('     ' + r.n + '  |  ' + r.txt);
    ok('depois da segunda marcação, o passo 3', /Passo 3 de 3/.test(r.n), r.n);
    /* No último passo não há seguinte: inventar um travessão ali só gastaria
       altura de uma janela que fica por cima do trabalho da pessoa. */
    ok('no último passo, o "a seguir" some', r.prox === '', r.prox);
  }
  await jn.locator('#marcar').click(); await jn.waitForTimeout(700);

  console.log('\n[4] acabada a lista, ela diz que acabou');
  {
    const r = await rot();
    console.log('     ' + r.n + '  |  ' + r.txt);
    ok('continua visível', r.visivel === true);
    ok('e avisa que o roteiro terminou', r.fim === true && /conclu/i.test(r.n), r.n);
  }
  /* Uma tela a mais NÃO consome linha: o título é do passo, não da tela. */
  /* A linha do roteiro custa altura numa janela que fica POR CIMA do trabalho
     da pessoa. Se ela empurrar PARAR para fora da borda, o preço da comodidade
     foi o botão irreversível — que é o pior lugar possível para cobrar. */
  {
    const m = await jn.evaluate(() => {
      /* A janelinha COM roteiro pede 486px; o navegador de teste entrega a
         página com a altura do contexto, e nessa altura tudo cabe — a régua
         mediria sempre verde. A altura de verdade é imposta aqui. */
      const ALT = 486;
      document.body.style.height = ALT + 'px';
      document.body.getBoundingClientRect();
      const fim = el => el ? el.getBoundingClientRect().bottom : 0;
      return { alt: ALT, conteudo: document.body.scrollHeight,
               parar: fim(document.getElementById('stop')),
               pausa: fim(document.getElementById('pausa')) };
    });
    console.log('     janela ' + m.alt + 'px  |  conteúdo ' + Math.round(m.conteudo) +
                '  |  PARAR termina em ' + Math.round(m.parar));
    ok('com roteiro, o conteúdo ainda cabe', m.conteudo <= m.alt + 1,
       Math.round(m.conteudo) + ' > ' + m.alt);
    ok('PARAR continua dentro da janela', m.parar > 0 && m.parar <= m.alt + 1,
       Math.round(m.parar) + ' > ' + m.alt);
    ok('PAUSAR também', m.pausa > 0 && m.pausa <= m.alt + 1,
       Math.round(m.pausa) + ' > ' + m.alt);
  }
  /* E com o PIOR texto possível: um passo de roteiro pode ser uma frase
     inteira. O corte em três linhas é o que garante o encaixe — sem ele, uma
     frase comprida empurraria PARAR para fora e o defeito só apareceria no
     computador de quem escreve roteiro detalhado. */
  {
    const m = await jn.evaluate(() => {
      const ALT = 486;
      document.body.style.height = ALT + 'px';
      const cx = document.getElementById('rot');
      cx.classList.remove('hide', 'fim');
      document.getElementById('rotT').textContent =
        'Abrir a transacao FB60 no ambiente de qualidade e conferir se o centro de custo herdado do pedido confere com o da requisicao original antes de lancar';
      const p = document.getElementById('rotP');
      p.classList.remove('hide');
      p.textContent = 'A seguir: preencher o campo de referencia com o numero do chamado e anexar o comprovante digitalizado do fornecedor';
      document.body.getBoundingClientRect();
      return { alt: ALT, parar: document.getElementById('stop').getBoundingClientRect().bottom };
    });
    console.log('     com frase longa: PARAR termina em ' + Math.round(m.parar) + ' de ' + m.alt);
    ok('mesmo com passo longo, PARAR cabe', m.parar > 0 && m.parar <= m.alt + 1,
       Math.round(m.parar) + ' > ' + m.alt);
  }
  ok('sem erro na janelinha', erros.filter(e => /janelinha/.test(e)).length === 0);
}

console.log('\n[5] os títulos saem no documento');
await pg.locator('#recStop').click();
await pg.waitForTimeout(2500);
{
  const dl = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#docx').click();
  const d = await dl; await d.saveAs('/tmp/rot.docx');
  const doc = lerZip('/tmp/rot.docx')['word/document.xml'].toString('utf8');
  PASSOS.forEach((p, i) => ok('passo ' + (i+1) + ' no documento', doc.includes(p), p));
  /* ---- E NO CABEÇALHO, JUNTO DO NÚMERO ----
     "Passo 1 de 3" sozinho obriga a ler o corpo inteiro para saber o que cada
     passo é. O nome do passo pertence ao cabeçalho, e não a um parágrafo
     solto abaixo dele — isso valia só no passo a passo, e agora vale em
     todos os modelos. */
  const texto = doc.replace(/<[^>]+>/g, '');
  const total = (texto.match(/Passo \d+ de (\d+)/) || [])[1];
  console.log('     o documento tem ' + total + ' passos; o roteiro tinha ' + PASSOS.length);
  /* UMA CONTAGEM SÓ. A janelinha dizia "Passo 1 de 3" e o documento chamava o
     mesmo passo de "Passo 2 de 4", porque o quadro capturado sozinho no
     início abria um passo sem título. Quem confere evidência confere pelo
     número — dois números para a mesma coisa é defeito, não detalhe. */
  ok('o documento tem um passo por linha do roteiro', total === String(PASSOS.length), total);
  PASSOS.forEach((p, i) => {
    const alvo = 'Passo ' + (i+1) + ' de ' + PASSOS.length + '  —  ' + p;
    ok('o cabeçalho do passo ' + (i+1) + ' traz o nome', texto.includes(alvo), alvo);
  });
}
ok('sem erro de página', erros.length === 0, erros[0]);

await br.close(); srv.close();
console.log(falhas ? `\n  ${falhas} falha(s)` : '\n  tudo certo');
process.exit(falhas ? 1 : 0);
