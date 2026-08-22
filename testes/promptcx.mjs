/* O prompt recolhido, e a legenda pronta que saiu de cima.
 *
 * Duas mudanças de tela com a mesma causa: o que a pessoa vê primeiro num
 * cartão devia ser o que ela faz, e não o resultado bruto que ela vai colar em
 * outro lugar sem ler.
 */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const ROOT = `${RAIZ_WS}/public`;
const html = fs.readFileSync(ROOT + '/app.html', 'utf8');
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (u.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end('') }
  if (u === '/sw.js') { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end(fs.readFileSync(ROOT+'/sw.js')) }
  r.writeHead(200, {'Content-Type':'text/html'}); r.end(html);
});
await new Promise(r => srv.listen(8909, r));

const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const ctx = await br.newContext({ viewport: { width: 1200, height: 950 } });
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', e => erros.push(e.message));
await pg.goto('http://localhost:8909/app.html?lang=pt');
// o cenário de uso passou a ser obrigatório: sem ele o botão Gravar cobra a escolha
await pg.selectOption('#modelo', 'ia').catch(() => {});
await pg.waitForTimeout(700);

/* O cartão do prompt nasce `inert` — não há documento para explicar a modelo
   nenhum antes de existir material. Para exercitá-lo é preciso dar o material
   pelo caminho de sempre: um vídeo, e uma transcrição colada. */
await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForFunction(() => !document.getElementById('prevCard').hasAttribute('inert'),
  null, { timeout: 20000 });
await pg.locator('#tr').fill('0:02  primeira fala\n0:06  segunda fala\n');
await pg.waitForFunction(() => !document.getElementById('promptCard').hasAttribute('inert'),
  null, { timeout: 20000 });
await pg.waitForTimeout(400);

console.log('[1] o prompt nasce recolhido');
{
  ok('a caixa existe', await pg.locator('#promptBox').count() === 1);
  ok('e está fechada', !(await pg.locator('#promptBox').evaluate(e => e.open)));
  ok('o texto do prompt não está ocupando a tela',
     !(await pg.locator('#promptOut').isVisible()));
  const s = (await pg.locator('#promptBox summary').textContent()).trim();
  ok('o rótulo diz o que tem dentro', /ver o prompt/i.test(s), s);
  ok('e diz o tamanho, para ninguém copiar às cegas', /caracteres|vazio/.test(s), s);
}

console.log('\n[2] a nota de como usar sobrou acima da dobra');
{
  /* Era ela que as trinta linhas do prompt empurravam para fora da vista — e é
     ela que diz para anexar o PDF junto, sem o que o modelo mistura o que viu
     com o que foi falado. */
  const y = await pg.locator('#promptCard .note').evaluate(e => e.getBoundingClientRect().top + scrollY);
  const alt = await pg.evaluate(() => document.getElementById('promptCard').getBoundingClientRect().height);
  ok('o cartão inteiro cabe em menos de 460 px', alt < 460, String(Math.round(alt)));
}

console.log('\n[3] um clique abre, e a caixa é longa');
{
  await pg.locator('#promptBox summary').click();
  await pg.waitForTimeout(300);
  ok('abriu', await pg.locator('#promptBox').evaluate(e => e.open));
  ok('o texto aparece', await pg.locator('#promptOut').isVisible());
  const max = await pg.locator('#promptOut').evaluate(e => parseFloat(getComputedStyle(e).maxHeight));
  ok('e ela é longa, não os 340 px de antes', max > 500, String(Math.round(max)));
}

/* ---- ESTA SEÇÃO MUDOU DE LADO, E O MOTIVO IMPORTA ----

   Ela cobrava que o botão de abrir uma legenda pronta ficasse DEPOIS da caixa.
   Fazia sentido enquanto ele era um botão solto: um controle avulso em cima do
   campo é ruído antes do trabalho.

   Ele deixou de ser um botão solto. Virou o bloco "Enviar arquivo de
   transcrição", com título, três caminhos (Meet/Teams/Zoom, .vtt/.srt, Drive) e
   uma frase dizendo que é o caminho mais rápido — porque é: quem já tem a
   transcrição da reunião não precisa baixar modelo de voz nenhum.

   E um atalho que só aparece depois do caminho longo é um atalho que ninguém
   pega. Ele vem antes do quadro agora, e a régua cobra isso. */
console.log('\n[4] o envio de transcrição pronta vem ANTES do quadro');
{
  const ordem = await pg.evaluate(() => {
    const todos = [...document.querySelectorAll('#trManual *')];
    return { botao: todos.indexOf(document.getElementById('pickVtt')),
             caixa: todos.indexOf(document.getElementById('tr')) };
  });
  ok('o atalho aparece antes do caminho longo', ordem.botao >= 0 && ordem.botao < ordem.caixa,
     JSON.stringify(ordem));
  ok('e continua existindo, alcançável pelo teclado',
     await pg.locator('#pickVtt').isEnabled());
  const t = await pg.locator('#trManual').textContent();
  ok('a tela diz de onde essa legenda costuma vir',
     /Teams/.test(t) && /Zoom/.test(t), (t.match(/[^.]*Teams[^.]*/) || [''])[0].trim().slice(0, 90));
  ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 140));
}

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nPrompt recolhido e legenda pronta: tudo passou.');
process.exit(falhas ? 1 : 0);
