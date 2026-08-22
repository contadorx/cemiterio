/* O ÍNDICE QUE OMITIA PASSOS — e discordava do próprio documento.
 *
 * O RELATO, de produção: "o passo 1, que não tem ação por botão, não fica no
 * índice". A causa não era o passo 1 em particular: era o ENXUGAMENTO do
 * índice, que enxugava o passo em vez do texto.
 *
 * A regra existia por um motivo bom. Um índice que reimprime a narração — a
 * mesma frase que aparece três centímetros abaixo, embaixo da imagem — não
 * indexa nada: dobra o documento e não ajuda a achar coisa alguma. Então,
 * havendo passos com anotação, o índice passava a listar SÓ esses.
 *
 * O furo: "listar só esses" TIRAVA os outros da lista. Bastava um passo ter
 * nome para todos os sem nome sumirem. E há um sem nome quase sempre — o
 * quadro automático do começo da gravação, que ninguém marcou e que, sem
 * roteiro, não recebe título. Os seguintes, marcados no botão, recebem.
 *
 * Medido antes do conserto: quatro passos no documento, TRÊS linhas no índice,
 * começando no Passo 2. O corpo continuava mostrando o Passo 1 — o índice e o
 * documento discordavam sobre quantos passos existem, e quem confere uma
 * evidência confere pelo índice.
 *
 * O que este arquivo cobra:
 *
 *   1. o índice tem uma linha por passo do documento, SEMPRE — com nome, sem
 *      nome, com um só nomeado ou com nenhum;
 *   2. o enxugamento continua fazendo o que devia: havendo títulos de verdade,
 *      o passo sem título entra com o travessão, e não com a narração repetida;
 *   3. sem título nenhum, a narração volta a ser o texto — ali ela é tudo o
 *      que há;
 *   4. o índice e o documento contam o mesmo número de passos.
 *
 *   node testes/indice.mjs
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
await new Promise(r => srv.listen(8953, r));

let falhas = 0;
const ok = (n, c, e) => {
  console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : ''));
  if (!c) falhas++;
};

const br = await chromium.launch({ executablePath: CHROME_WS });
const ctx = await br.newContext({ viewport: { width: 1250, height: 980 } });
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', e => erros.push(e.message));
await pg.goto('http://localhost:8953/app.html?lang=pt');
await pg.selectOption('#modelo', 'evidencia').catch(() => {});
await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length >= 3,
                         null, { timeout: 90000 });
await pg.waitForTimeout(800);

/* Escreve as notas direto nos quadros — é onde a anotação mora de verdade
   (`f.nota`), e é de lá que a grade, o PDF, o Word e o índice leem. */
const cenario = (quais) => pg.evaluate((quais) => {
  const kept = window.__quadros().filter(f => f.keep);
  kept.forEach((f, i) => { f.nota = quais.includes(i) ? 'acao ' + (i + 1) : ''; });
  const idx = window.__indice();
  return { passos: kept.length, linhas: idx.length,
           idx: idx.map(l => ({ n: l.n, texto: l.texto })) };
}, quais);

console.log('[1] um passo sem nome no meio de passos com nome');
{
  /* O caso do relato: o primeiro não foi marcado, os outros foram. */
  const todos = await pg.evaluate(() => window.__quadros().filter(f => f.keep).length);
  const r = await cenario([...Array(todos).keys()].slice(1));
  console.log('     passos: ' + r.passos + '   linhas: ' + r.linhas);
  console.log('     ' + JSON.stringify(r.idx));
  /* O NÚMERO QUE IMPORTA. Antes do conserto: 4 passos, 3 linhas. */
  ok('o índice tem uma linha por passo', r.linhas === r.passos,
     r.linhas + ' linhas para ' + r.passos + ' passos');
  ok('e o passo 1 está lá', r.idx.some(l => l.n === 1), JSON.stringify(r.idx.map(l => l.n)));
  /* O enxugamento continua valendo: sem título, travessão — e não a narração,
     que é a repetição que a regra existe para evitar. */
  const p1 = r.idx.find(l => l.n === 1);
  ok('sem nome, ele entra com o travessão', p1 && p1.texto === '—', p1 && p1.texto);
  ok('e os nomeados entram com o nome',
     r.idx.filter(l => l.n > 1).every(l => /^acao /.test(l.texto)),
     JSON.stringify(r.idx));
}

console.log('\n[2] um só passo nomeado, e todos os outros sem nome');
{
  /* O caso extremo da mesma regra: com o filtro antigo, o índice inteiro virava
     UMA linha. */
  const r = await cenario([2]);
  console.log('     passos: ' + r.passos + '   linhas: ' + r.linhas);
  ok('o índice continua com uma linha por passo', r.linhas === r.passos,
     r.linhas + ' para ' + r.passos);
  ok('nenhum passo ficou de fora',
     r.idx.map(l => l.n).join(',') === [...Array(r.passos).keys()].map(i => i + 1).join(','),
     JSON.stringify(r.idx.map(l => l.n)));
}

console.log('\n[3] nenhum passo nomeado: a narração volta a ser o texto');
{
  const r = await cenario([]);
  console.log('     passos: ' + r.passos + '   linhas: ' + r.linhas);
  ok('uma linha por passo', r.linhas === r.passos, r.linhas + ' para ' + r.passos);
  /* Sem título nenhum, a fala é tudo o que há — e o `—` aparece só onde não há
     nem fala. O que não pode acontecer é a lista encolher. */
  ok('e todo passo tem algum texto', r.idx.every(l => (l.texto || '').length > 0),
     JSON.stringify(r.idx));
}

console.log('\n[4] todos nomeados: nada muda, e nada some');
{
  const todos = await pg.evaluate(() => window.__quadros().filter(f => f.keep).length);
  const r = await cenario([...Array(todos).keys()]);
  ok('uma linha por passo', r.linhas === r.passos, r.linhas + ' para ' + r.passos);
  ok('e todos com o nome escrito',
     r.idx.every(l => /^acao /.test(l.texto)), JSON.stringify(r.idx));
}

console.log('\n[5] o índice e o documento contam o mesmo');
{
  /* A pergunta que o relato fez sem fazer: se o índice diz três e o corpo
     mostra quatro, qual dos dois está certo? Nenhum documento pode obrigar
     alguém a essa pergunta. */
  const todos = await pg.evaluate(() => window.__quadros().filter(f => f.keep).length);
  await cenario([...Array(todos).keys()].slice(1));
  const conta = await pg.evaluate(() => ({
    noIndice: window.__indice().length,
    noDoc: window.__quadros().filter(f => f.keep).length,
  }));
  console.log('     índice: ' + conta.noIndice + '   documento: ' + conta.noDoc);
  ok('o mesmo número de passos nos dois', conta.noIndice === conta.noDoc,
     JSON.stringify(conta));
}

console.log(erros.length ? '\nerros de JS: ' + erros.join(' | ') : '\nsem erro de JS');
if (erros.length) falhas++;
await br.close(); srv.close();
console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTodas as verificações passaram.');
process.exit(falhas ? 1 : 0);
