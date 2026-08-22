/* O cenário de uso: sem padrão escolhido por nós, e sem barrar a gravação.
 *
 * Dois defeitos que pareciam de acabamento e não eram.
 *
 * O PRIMEIRO: a caixa vinha com "Contexto para IA" já escolhido. Um padrão
 * invisível numa escolha irreversível é pior do que uma pergunta: quem não
 * reparou na caixa gravava quarenta minutos e recebia o documento errado.
 *
 * A caixa passou então a EXIGIR a escolha — e essa foi longe demais na direção
 * contrária: clicar em Gravar sem escolher não gravava. Quem clica em Gravar
 * tem algo acontecendo na tela agora. Hoje o vazio assume "Outro", que é o
 * documento genérico, e a gravação começa.
 *
 * O SEGUNDO: enquanto o modelo de voz baixava, a tela escrevia **0%**. Não era
 * zero: era "o servidor ainda não disse o tamanho". As duas coisas são
 * diferentes e a distância entre elas é a distância entre esperar e recarregar
 * a página. Agora esse caso é barra listrada e uma frase que diz o que está
 * acontecendo — e o número só aparece quando existe número.
 */
import { chromium } from 'playwright';
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
await new Promise(r => srv.listen(8946, r));

const br = await chromium.launch({
  executablePath: CHROME_WS,
  args: ['--autoplay-policy=no-user-gesture-required']
});
let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const ctx = await br.newContext({ viewport: { width: 1150, height: 950 } });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));

let pediuTela = 0;
await pg.addInitScript(() => {
  window.__telaPedida = 0;
  function tela(){
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const g = c.getContext('2d'); let i = 0;
    setInterval(() => { i++; g.fillStyle = ['#123','#eee','#567','#fa0'][i%4]; g.fillRect(0,0,1280,720); }, 700);
    return c.captureStream(12);
  }
  navigator.mediaDevices.getDisplayMedia = async () => { window.__telaPedida++; return tela(); };
  navigator.mediaDevices.getUserMedia = async () => { throw new Error('sem mic'); };
});

await pg.goto('http://localhost:8946/app.html?lang=pt');
await pg.waitForTimeout(600);

console.log('[1] de saída, ninguém escolheu nada');
{
  ok('a caixa está no pedido, e não num cenário',
     (await pg.locator('#modelo').inputValue()) === '',
     JSON.stringify(await pg.locator('#modelo').inputValue()));
  const txt = await pg.locator('#modelo option:checked').textContent();
  ok('e o texto é um pedido', /escolha/i.test(txt || ''), txt);
  /* Não se pode voltar a ela por engano depois de escolher: o pedido não é um
     cenário, e uma caixa que aceita "nenhum" no meio do caminho é uma caixa
     que produz documento sem formato. */
  ok('e a opção do pedido não é reescolhível',
     await pg.locator('#modelo option').first().evaluate(o => o.disabled));
  const dica = (await pg.locator('#cenDica').textContent() || '').trim();
  ok('a linha de baixo diz POR QUE a escolha importa',
     /cabeçalho|hora de relógio|prompt/i.test(dica), dica.slice(0, 70));
}

console.log('\n[2] clicar em Gravar sem escolher ASSUME "Outro" — e grava');
await pg.locator('#recTr').uncheck();
await pg.evaluate(() => window.__contagem(1));
await pg.locator('#rec').click();
await pg.waitForSelector('#recStop:visible', { timeout: 40000 });
{
  /* ISTO MUDOU, e a mudanca e o pedido literal: "quando nao colocar cenario,
     considerar o outros".
     
     Antes, clicar em Gravar sem escolher escrevia o pedido em vermelho,
     sacudia o seletor e NAO gravava. A intencao era boa — o cenario decide
     cabecalho, hora de relogio, nome do passo e prompt — e o preco era alto
     demais: quem clica em Gravar tem algo acontecendo na tela AGORA, e uma
     ferramenta que se recusa a comecar por causa de um campo de formulario
     perde justamente o que ela existia para registrar.
     
     "Outro" e o documento generico, e serve para qualquer gravacao. Trocar o
     cenario depois continua valendo. */
  ok('o cenário virou "outro" sozinho',
     (await pg.locator('#modelo').inputValue()) === 'outro',
     await pg.locator('#modelo').inputValue());
  ok('o navegador PEDIU a tela', (await pg.evaluate(() => window.__telaPedida)) === 1);
  ok('e a gravação começou', await pg.locator('#recStop').isVisible());
}
await pg.locator('#recStop').click();
await pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null, null, { timeout: 40000 });
await pg.waitForTimeout(500);

console.log('\n[3] escolhendo o cenário à mão, ele manda');
await pg.selectOption('#modelo', 'evidencia');
await pg.waitForTimeout(400);
{
  const dica = (await pg.locator('#cenDica').textContent() || '').trim();
  ok('a linha de baixo passa a explicar o cenário escolhido',
     /hora de relógio|evidência/i.test(dica), dica.slice(0, 70));
  ok('e para de se destacar',
     !(await pg.locator('#cenDica').evaluate(e => e.classList.contains('pede'))));
}
await pg.locator('#rec').click();
await pg.waitForSelector('#recStop:visible', { timeout: 40000 });
{
  ok('a tela foi pedida de novo', (await pg.evaluate(() => window.__telaPedida)) === 2);
  ok('e a gravação está rolando', await pg.locator('#recStop').isVisible());
  ok('com o cenário que a pessoa escolheu, e não o assumido',
     (await pg.locator('#modelo').inputValue()) === 'evidencia');
}
await pg.locator('#recStop').click();
await pg.waitForFunction(() => document.getElementById('rec').offsetParent !== null,
  null, { timeout: 60000 });
await pg.waitForTimeout(800);

console.log('\n[4] enviar um vídeo também cobra o cenário');
{
  /* A porta do arquivo produz o mesmo documento errado que a da gravação. A
     única porta que NÃO cobra é a de reabrir um documento — e ela não precisa,
     porque o cenário vem escrito dentro do arquivo. */
  const fonte = fs.readFileSync(ROOT + '/app.html', 'utf8');
  ok('a função de carregar vídeo passa pela mesma trava',
     /function load\(f, origem\)\{[\s\S]{0,400}?exigirCenario\(\)/.test(fonte));
  ok('e reabrir um documento NÃO passa por ela — o cenário vem no arquivo',
     /\$\('modelo'\)\.value = d\.cenario/.test(fonte));
}

console.log('\n[5] a barra do modelo mora no passo 1, e não no cartão do áudio');
{
  const fonte = fs.readFileSync(ROOT + '/app.html', 'utf8');
  ok('existe uma barra dentro do cartão de gravar', /id="recBarWrap"/.test(fonte));
  ok('e ela fica junto do botão de gravar, e não no passo 2',
     fonte.indexOf('id="recBarWrap"') < fonte.indexOf('id="abarWrap"'));
  ok('o download pinta as duas', /prog\(pct\); progRec\(pct\)/.test(fonte));
}

console.log('\n[6] "não sei o tamanho" não vira 0%');
{
  /* O defeito exato: `tt === 0` virava `pct = 0` e a tela escrevia 0%, que se
     lê como travado. Agora esse caso é barra listrada e uma frase própria. */
  const fonte = fs.readFileSync(ROOT + '/app.html', 'utf8');
  /* As DUAS barras ficam listradas. Antes `prog(null)` escondia a de cima e só
     a do passo 1 andava — quem estava olhando para o cartão 2 via uma tela
     parada. `prog` ganhou o terceiro estado que o `progRec` já tinha. */
  ok('sem tamanho, as duas barras ficam indeterminadas',
     /if \(!tt\) \{\s*\n?\s*prog\('\?'\); progRec\(null\);/.test(fonte));
  ok('e a frase é outra, não a de porcentagem',
     /modelDlInicio/.test(fonte));
  ok('a barra indeterminada é listrada e anda', /\.bar\.indef>i\{/.test(fonte));

  /* E o número, quando existe, vem com o quanto FALTA. Porcentagem sozinha
     responde "quanto já foi"; quem está parado esperando quer a outra. */
  ok('com tamanho, a tela diz quanto falta', /modelDlFalta/.test(fonte));

  const pintado = await pg.evaluate(() => {
    const w = document.getElementById('recBarWrap');
    return { some: w.classList.contains('hide') };
  });
  ok('e fora do download a barra não fica na tela', pintado.some);
}

console.log('\n[7] os cinco idiomas têm as frases novas');
for (const L of ['pt', 'en', 'es', 'de', 'fr']) {
  const p2 = await ctx.newPage();
  await p2.goto('http://localhost:8946/app.html?lang=' + L);
  await p2.waitForTimeout(400);
  const opt = (await p2.locator('#modelo option:checked').textContent() || '').trim();
  ok(`${L}: o pedido está traduzido`, opt.length > 6 && opt !== '', opt);
  const dica = (await p2.locator('#cenDica').textContent() || '').trim();
  ok(`${L}: e a explicação também`, dica.length > 30, dica.slice(0, 40));
  await p2.close();
}

console.log('\n[8] nada disso quebrou o JS');
ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 170));

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nCenário obrigatório e barra do modelo: tudo passou.');
process.exit(falhas ? 1 : 0);
