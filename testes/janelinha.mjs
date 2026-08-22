/* A janelinha de controle: o tamanho dela.
 *
 * Ela fica POR CIMA da tela que está sendo gravada. Cada pixel dela é um pixel
 * a menos do trabalho que a pessoa está documentando — e ainda aparece nos
 * quadros capturados. Então o tamanho não é gosto: é o custo dela.
 *
 * O `documentPictureInPicture` não existe no navegador de teste, então o que se
 * faz aqui é montar o MESMO CSS e o MESMO corpo que o produto monta, numa
 * página do tamanho exato que ele pede, e medir se o conteúdo cabe. É o CSS do
 * produto, lido do arquivo gerado — não uma réplica escrita à mão.
 */
import { chromium } from 'playwright';
import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const app = fs.readFileSync(`${RAIZ_WS}/public/app.html`, 'utf8');
let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

/* O tamanho pedido, o CSS e o corpo, tirados do próprio arquivo. */
/* A altura passou a depender do roteiro: com lista de passos colada, a
   janelinha ganha a linha do passo atual e a do seguinte. Então o arquivo
   declara as DUAS, e a régua mede a menor — a que vale para quem não colou
   roteiro nenhum, que é o caso comum e o mais apertado por quadro de tela. */
const med = app.match(/width: (\d+), height: roteiro\.length \? (\d+) : (\d+)/);
ok('a janelinha declara um tamanho', !!med, med ? med[0] : '(não achei)');
const [LARG, ALT, ALT_ROT] = med ? [ +med[1], +med[3], +med[2] ] : [250, 392, 486];

const css = app.slice(app.indexOf('const PIP_CSS = `') + 17).split('`;')[0];
ok('o CSS dela foi encontrado', css.length > 400, String(css.length));

/* O corpo: as linhas de `d.body.innerHTML = ...` concatenadas. */
const corpoSrc = app.slice(app.indexOf('d.body.innerHTML ='));
const corpo = (corpoSrc.slice(0, corpoSrc.indexOf(';\n')).match(/'([^']*)'/g) || [])
  .map((x) => x.slice(1, -1)).join('');
ok('e o corpo também', /class="top"/.test(corpo) && /id="stop"/.test(corpo), corpo.slice(0, 60));

const br = await chromium.launch({ executablePath: CHROME_WS });
const pg = await (await br.newContext({ viewport: { width: LARG, height: ALT } })).newPage();
await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>` +
                    `<body>${corpo}</body></html>`);
await pg.waitForTimeout(200);

const medir = () => pg.evaluate(() => ({
  precisa: document.body.scrollHeight, cabe: document.documentElement.clientHeight,
  vaza: [...document.querySelectorAll('body *')]
    .filter((e) => e.getBoundingClientRect().bottom > innerHeight + 1)
    .map((e) => e.tagName + (e.id ? '#' + e.id : '')).slice(0, 4),
}));

console.log(`\n[1] gravando: cabe em ${LARG}×${ALT}`);
{
  /* Os rótulos são preenchidos pelo JavaScript do produto; aqui eles entram com
     um texto de tamanho realista, que é o que decide se cabe. */
  await pg.evaluate(() => {
    document.body.classList.add('gravando');
    document.querySelector('.txt').textContent = 'Gravando… clique em Parar quando terminar.';
    for (const [id, txt] of [['marcar','Marcar este passo'],['pausa','Pausar'],['stop','Parar']]) {
      const b = document.getElementById(id); if (b) { b.textContent = txt; b.disabled = false; }
    }
    /* O bloco da anotação com o texto que ele REALMENTE tem: rótulo cheio,
       campo com duas linhas escritas, botão rotulado e a confirmação de que
       salvou. Medi-lo vazio media outra janela — e a janela que transborda é
       sempre a de quem está usando. */
    const n = document.getElementById('nota');
    if (n) { n.disabled = false; n.value = 'Cliquei em Salvar e o sistema devolveu a mensagem 4711.'; }
    const nl = document.getElementById('notaLbl');
    if (nl) nl.textContent = 'Tela 2 do Passo 3';
    const nk = document.getElementById('notaOk');
    if (nk) { nk.disabled = false; nk.textContent = 'Salvar anotação'; }
    const nm = document.getElementById('notaMsg');
    if (nm) nm.textContent = '✓ salvo neste quadro';
  });
  await pg.waitForTimeout(150);
  const m = await medir();
  ok('o conteúdo cabe na altura pedida', m.precisa <= m.cabe + 1, `${m.precisa} de ${m.cabe}`);
  ok('e nada fica para fora', m.vaza.length === 0, m.vaza.join(' '));
  /* O TETO, e o histórico dele — porque a próxima subida precisa de um motivo
     tão bom quanto os anteriores:

       282 → 300  o segundo botão de marcação;
       300 → 392  a caixa de anotação ganhou rótulo, campo de duas linhas,
                  botão e confirmação. Com 300 o corpo tinha `height:100vh` e
                  `justify-content:center`: o conteúdo maior era cortado nas
                  DUAS pontas, e a de baixo é onde ficam PAUSAR e PARAR. Não
                  era estética — era o botão irreversível fora da janela;
       392 → 486  só quando há roteiro, para a linha do passo atual e a do
                  seguinte. Sem roteiro a janelinha continua nos 392.

     Cada pixel daqui é um pixel a menos do trabalho que a pessoa está
     documentando, e ainda aparece nos quadros. A largura nunca subiu. */
  ok('a largura não passa de 250', LARG <= 250, String(LARG));
  ok('sem roteiro, a altura fica em 392', ALT <= 392, String(ALT));
  ok('com roteiro ela sobe, e só até 486', ALT_ROT > ALT && ALT_ROT <= 486,
     `${ALT} → ${ALT_ROT}`);

  /* O botão de calar nasce escondido, e `.hide` mora no CSS da ABA — a
     janelinha é outro documento. Sem a regra lá dentro ele aparecia como uma
     caixa vazia de 28px: um botão que não faz nada, ocupando tela da pessoa. */
  ok('e o botão escondido está mesmo escondido',
     await pg.evaluate(() => document.getElementById('calar').offsetParent === null));
  const sobra = await pg.evaluate(() => document.body.scrollHeight);
  ok('sem folga desperdiçada nem estouro', Math.abs(sobra - ALT) <= 12, `${sobra} para ${ALT}`);
}

console.log('\n[2] contando: só o número, e ele é grande');
{
  await pg.evaluate(() => {
    document.body.classList.add('contando');
    const t = document.querySelector('.txt');
    t.classList.add('contando'); t.textContent = '3';
  });
  await pg.waitForTimeout(150);
  const m = await medir();
  const n = await pg.evaluate(() => {
    const t = document.querySelector('.txt');
    return { fs: parseFloat(getComputedStyle(t).fontSize), h: t.getBoundingClientRect().height };
  });
  ok('o número é enorme', n.fs >= 56, String(n.fs));
  ok('e mesmo assim cabe', m.precisa <= m.cabe + 1, `${m.precisa} de ${m.cabe}`);
  const escondidos = await pg.evaluate(() => ['.top', '.vus', '.pe', '.notaCx', '#marcar', '#pausa']
    .filter((s) => { const e = document.querySelector(s); return e && e.offsetParent !== null; }));
  ok('e o resto some — é o que deixa o número ser enorme sem a janela crescer',
     escondidos.length === 0, escondidos.join(' '));
  ok('menos o Parar, que vale desde o primeiro segundo',
     await pg.evaluate(() => document.getElementById('stop').offsetParent !== null));
}

await br.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nJanelinha de controle: tudo passou.');
process.exit(falhas ? 1 : 0);
