/* A CONFERÊNCIA ABRIA SEM RESUMO, E LIMPAVA SEM VOLTA.
 *
 * Duas coisas, e a segunda é a que doía.
 *
 * 1. A etapa abria com dezoito miniaturas e sete botões do mesmo peso. A
 *    primeira pergunta de quem chega — "o que eu tenho aqui, e preciso mexer?"
 *    — só era respondida olhando, uma tela de cada vez, que é justamente o
 *    trabalho que esta etapa existe para encurtar.
 *
 * 2. NENHUMA ação em lote tinha desfazer. Quem clicava em "descartar
 *    repetidos" e se arrependia tinha duas saídas, e as duas são piores que o
 *    problema: "manter todas", que devolve também o que a pessoa havia
 *    descartado à mão, e recarregar a página, que nesta ferramenta perde a
 *    sessão inteira. A proposta de UX proíbe a segunda com todas as letras —
 *    "recarregar página não pode ser apresentado como método normal de
 *    desfazer".
 *
 * E um defeito achado no caminho: `contarRepetidos` e o `#dedup` tinham a
 * mesma regra escrita duas vezes e já discordavam — a ação pulava o quadro
 * FIXADO e o contador não. O botão prometia "descartar 3 repetidos", tirava 2,
 * e a diferença era exatamente a tela que a pessoa fixou para proteger.
 *
 * O que este arquivo cobra:
 *
 *   1. o resumo abre a etapa e conta o material;
 *   2. a limpeza recomendada diz a CONSEQUÊNCIA antes, em números;
 *   3. e some quando não há nada a limpar — botão que não faz nada é pior que
 *      botão a menos;
 *   4. desfazer devolve exatamente o que havia antes, e só o que havia antes;
 *   5. o desfazer alcança também os quatro botões de lote, e não só a faxina;
 *   6. a tela fixada não é levada pela limpeza NEM contada na promessa.
 *
 *   node testes/resumo.mjs
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
await new Promise(r => srv.listen(8955, r));

let falhas = 0;
const ok = (n, c, e) => {
  console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : ''));
  if (!c) falhas++;
};

const br = await chromium.launch({ executablePath: CHROME_WS });
const ctx = await br.newContext({ viewport: { width: 1250, height: 980 } });
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', e => erros.push(e.message));
await pg.goto('http://localhost:8955/app.html?lang=pt');
await pg.selectOption('#modelo', 'evidencia').catch(() => {});
await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length >= 3,
                         null, { timeout: 90000 });
await pg.waitForTimeout(900);

const ler = () => pg.evaluate(() => ({
  visivel: !document.getElementById('resumoRev').classList.contains('hide'),
  tit: (document.getElementById('resumoTit').textContent || '').trim(),
  conta: (document.getElementById('resumoConta').textContent || '').trim(),
  faxinaVisivel: !document.getElementById('faxina').classList.contains('hide'),
  vai: (document.getElementById('faxinaVai').textContent || '').trim(),
  linhaMsg: document.getElementById('faxinaMsg').classList.contains('hide')
    ? '' : (document.getElementById('faxinaMsgTxt').textContent || '').trim(),
  desfazerVisivel: !document.getElementById('faxinaDesfazer').classList.contains('hide'),
  mantidos: window.__quadros().filter(f => f.keep).length,
  rotuloDedup: (document.getElementById('dedup').textContent || '').trim(),
}));

/* Repetidos de mentira: a assinatura de um quadro copiada do vizinho é
   exatamente o que o detector chama de repetido, e não depende do vídeo. */
const forjarRepetidos = () => pg.evaluate(() => {
  const q = window.__quadros();
  for (let i = 1; i < q.length; i += 2) q[i].sig = q[i - 1].sig;
  q.forEach(f => { f.keep = true; f.fixo = false; });
});

console.log('[1] o resumo abre a etapa');
{
  const r = await ler();
  console.log('     ' + r.tit + '  |  ' + r.conta);
  ok('está na tela', r.visivel === true);
  ok('e diz de que ele fala', /conferência|conferencia/i.test(r.tit), r.tit);
  ok('contando o material', /\d+ telas/.test(r.conta), r.conta);
}

console.log('\n[2] sem nada a limpar, o botão não fica ali cinza');
{
  /* Assinaturas BEM distantes: o `diff` compara célula a célula e o limiar é 4,
     então [0,0,0] e [1,1,1] ainda seriam "a mesma tela". */
  await pg.evaluate(() => {
    const q = window.__quadros();
    q.forEach((f, i) => { f.sig = [i * 90, i * 90, i * 90]; f.fixo = false; });
  });
  await pg.locator('#allOn').click(); await pg.waitForTimeout(400);
  const r = await ler();
  console.log('     ' + r.vai);
  ok('o botão da limpeza some', r.faxinaVisivel === false);
  ok('e a linha diz por quê', /nada a limpar/i.test(r.vai), r.vai);
}

console.log('\n[3] a consequência vem ANTES, em números');
{
  await forjarRepetidos();
  await pg.locator('#allOn').click(); await pg.waitForTimeout(400);
  const r = await ler();
  console.log('     ' + r.vai);
  ok('o botão aparece', r.faxinaVisivel === true);
  /* "Pode sair incompleto" não deixa ninguém decidir nada. Um número, sim. */
  ok('a frase diz quantas telas saem', /\d+ telas/.test(r.vai), r.vai);
  ok('e de que tipo elas são', /repetidas/i.test(r.vai), r.vai);
  /* Sem isto a pessoa não sabe se está apagando ou escondendo — e a diferença
     é a única coisa que importa antes de um clique em lote. */
  ok('e promete que nada é apagado', /desfazer/i.test(r.vai), r.vai);
}

console.log('\n[4] desfazer devolve o que havia, e só o que havia');
let antes = 0;
{
  antes = (await ler()).mantidos;
  /* Uma tela descartada À MÃO antes da limpeza: ela tem de continuar
     descartada depois do desfazer. "Manter todas" devolveria essa também — e é
     por isso que "manter todas" não é desfazer. */
  await pg.evaluate(() => { const q = window.__quadros(); q[q.length - 1].keep = false; });
  await pg.locator('#dedup').click(); await pg.waitForTimeout(300);
  await pg.locator('#faxinaDesfazer').click(); await pg.waitForTimeout(400);
  const r = await ler();
  const ultima = await pg.evaluate(() => {
    const q = window.__quadros(); return q[q.length - 1].keep;
  });
  console.log('     mantidos depois de desfazer: ' + r.mantidos + '   (antes da limpeza: ' + (antes - 1) + ')');
  ok('o que a limpeza tirou voltou', r.mantidos === antes - 1,
     r.mantidos + ' vs ' + (antes - 1));
  ok('e o que EU tinha descartado continua fora', ultima === false);
  ok('a linha diz que desfez', /desfeito/i.test(r.linhaMsg), r.linhaMsg);
  ok('e o botão de desfazer sai', r.desfazerVisivel === false);
}

console.log('\n[5] o desfazer alcança os botões de lote, e não só a faxina');
{
  /* Eles guardavam memória e não ofereciam volta: um desfazer que a pessoa não
     tem como alcançar é o mesmo que desfazer nenhum. */
  for (const botao of ['dedup', 'allOn', 'soMarcados']) {
    const existe = await pg.locator('#' + botao).count()
      && !(await pg.locator('#' + botao).evaluate(e => e.classList.contains('hide')));
    if (!existe) { console.log('     (' + botao + ' não está na tela neste estado)'); continue; }
    await pg.locator('#' + botao).click(); await pg.waitForTimeout(300);
    const r = await ler();
    ok('depois de ' + botao + ', dá para desfazer', r.desfazerVisivel === true,
       r.linhaMsg);
  }
}

console.log('\n[6] a tela fixada não é levada, nem prometida');
{
  await forjarRepetidos();
  await pg.locator('#allOn').click(); await pg.waitForTimeout(300);
  const semFixo = await ler();
  /* Fixa justamente uma das que seriam descartadas. */
  await pg.evaluate(() => {
    const q = window.__quadros();
    for (let i = 1; i < q.length; i += 2) { q[i].fixo = true; break; }
  });
  await pg.locator('#allOn').click(); await pg.waitForTimeout(300);
  const comFixo = await ler();
  console.log('     sem fixar: ' + semFixo.rotuloDedup + '   |   fixando uma: ' + comFixo.rotuloDedup);
  /* O NÚMERO QUE IMPORTA. O contador não pulava o fixado e a ação pulava: o
     botão prometia um a mais do que entregava, e o extra era exatamente a tela
     que a pessoa protegeu. */
  ok('a promessa do botão encolhe junto', comFixo.rotuloDedup !== semFixo.rotuloDedup,
     comFixo.rotuloDedup);
  const mantidosAntes = comFixo.mantidos;
  await pg.locator('#dedup').click(); await pg.waitForTimeout(400);
  const fixaFicou = await pg.evaluate(() => {
    const q = window.__quadros(); const f = q.find(x => x.fixo); return f ? f.keep : null;
  });
  const depois = await ler();
  ok('a fixada continua incluída depois da limpeza', fixaFicou === true);
  /* E a conta bate: o que o rótulo prometeu é o que saiu. */
  const prometido = parseInt((comFixo.rotuloDedup.match(/\d+/) || [0])[0], 10);
  ok('o que o botão prometeu é o que saiu',
     mantidosAntes - depois.mantidos === prometido,
     (mantidosAntes - depois.mantidos) + ' saíram, ' + prometido + ' prometidos');
}

console.log('\n[7] os cinco idiomas, sem chave crua');
{
  for (const L of ['pt', 'en', 'es', 'de', 'fr']) {
    const p2 = await ctx.newPage();
    await p2.goto('http://localhost:8955/app.html?lang=' + L);
    await p2.waitForTimeout(500);
    const v = await p2.evaluate(() => ({
      faxina: (document.getElementById('faxina').textContent || '').trim(),
      revisar: (document.getElementById('resumoRevisar').textContent || '').trim(),
      cru: /\b(faxinaBtn|revResumoTit|faxinaVai|faxinaDesfazerBtn)\b/.test(document.body.innerText),
    }));
    ok(L + ': os rótulos estão traduzidos', v.faxina.length > 0 && v.revisar.length > 0,
       v.faxina + ' | ' + v.revisar);
    ok(L + ': nenhuma chave crua', v.cru === false);
    await p2.close();
  }
}

console.log(erros.length ? '\nerros de JS: ' + erros.join(' | ') : '\nsem erro de JS');
if (erros.length) falhas++;
await br.close(); srv.close();
console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTodas as verificações passaram.');
process.exit(falhas ? 1 : 0);
