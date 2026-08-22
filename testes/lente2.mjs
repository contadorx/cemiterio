/* Seis acabamentos do caminho de revisão — e por que cada um não era acabamento.
 *
 * 1. O CONTADOR DA ESPERA. A transcrição terminando depois de a gravação parar
 *    é a espera mais longa da ferramenta, e era anunciada em 13px, do mesmo
 *    tamanho da dica ao lado. Quem acabou de gravar quarenta minutos fica
 *    olhando para aquela linha.
 * 2. FINALIZAR DE DENTRO DA LENTE. A revisão sabia terminar; a lente, aberta de
 *    dentro dela, não sabia que estava no meio de um percurso. No último quadro
 *    não havia como terminar sem sair da lente primeiro.
 * 3. O CAMPO DA ANOTAÇÃO. Um `input` de uma linha para 180 caracteres: cabiam
 *    umas 60 e o resto rolava para fora. O que não se relê não se corrige.
 * 4. AS AÇÕES DA IMAGEM. "Tarjar", "Destacar", "Recortar" — verbos soltos que
 *    escondem o objeto. Quem não sabe o que o botão faz não clica para
 *    descobrir no meio de uma evidência.
 * 5. O FIM DO PASSO 3. Os subpassos 1, 2 e 3 tinham um "Pronto"; o quarto não
 *    tinha nada. Conduzir até o penúltimo e largar no último é pior do que não
 *    conduzir — ensina a esperar uma mão que não vem.
 * 6. O CENÁRIO DO EXEMPLO. Quem clica em "usar vídeo de exemplo" está pedindo
 *    para VER a ferramenta funcionar, não para responder um formulário.
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
await new Promise(r => srv.listen(8957, r));

const br = await chromium.launch({
  executablePath: CHROME_WS,
  args: ['--autoplay-policy=no-user-gesture-required']
});
let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const ctx = await br.newContext({ viewport: { width: 1150, height: 980 } });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));
await pg.goto('http://localhost:8957/app.html?lang=pt');
await pg.waitForTimeout(500);

console.log('[1] o exemplo escolhe o cenário — e DIZ que escolheu');
{
  ok('nada escolhido de saída', (await pg.locator('#modelo').inputValue()) === '');
  /* O vídeo do exemplo não baixa nesta máquina de teste (não há rede para o
     arquivo), mas a escolha do cenário acontece ANTES do download — é a
     primeira coisa do clique, de propósito: travar o exemplo numa pergunta é
     perder a pessoa no primeiro clique. */
  await pg.locator('#demo').click();
  await pg.waitForTimeout(700);
  ok('o exemplo escolheu por ela', (await pg.locator('#modelo').inputValue()) === 'evidencia',
     await pg.locator('#modelo').inputValue());
  /* Escolher em silêncio seria voltar ao padrão invisível que acabou de sair.
     A caixa pisca e a tela diz o que foi escolhido e onde trocar. */
  const msg = (await pg.locator('#recMsg').textContent() || '') +
              (await pg.locator('#demoMsg').textContent() || '');
  const fonte = fs.readFileSync(ROOT + '/app.html', 'utf8');
  ok('e existe a frase que avisa', /demoCenario/.test(fonte));
  ok('com a instrução de onde trocar', /troque na etapa 1/.test(fonte));
}

console.log('\n[2] as ações da imagem dizem o objeto, e não só o verbo');
{
  const fonte = fs.readFileSync(ROOT + '/app.html', 'utf8');
  /* "Tapar" saiu: o produto inteiro chama isto de TARJA — `aplicarTarjas`,
     `tarjaauto.mjs`, "Terminar de tarjar", "Tirar as tarjas". Só o botão da
     lente dizia outra coisa, e uma ferramenta que usa dois nomes para o mesmo
     gesto faz a pessoa procurar duas vezes. */
  for (const [antes, agora] of [['o verbo solto', 'Tarjar um dado'],
                                ['Destacar', 'Apontar na imagem'],
                                ['o verbo solto', 'Cortar as bordas (todas)'],
                                ['Duplicar', 'Duplicar este passo'],
                                ['Comparar', 'Comparar com outro quadro']]) {
    ok(`"${antes}" virou "${agora}"`, fonte.includes(`'${agora}'`));
  }
  ok('e a fileira ganhou um nome', /data-i18n="lenteAcoes"/.test(fonte));
}

/* ---------------------------------------------------------------- material */
await pg.selectOption('#modelo', 'evidencia');
await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForTimeout(2600);
await pg.selectOption('#mode', 'count'); await pg.fill('#count', '3');
await pg.locator('#extract').click();
await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length >= 3,
                         null, { timeout: 40000 });
await pg.waitForTimeout(500);

console.log('\n[3] o campo da anotação cabe o que se escreve nele');
await pg.locator('#thumbs figure .editar').first().click();
await pg.waitForTimeout(500);
{
  const cx = await pg.locator('#lenteNota').evaluate(e => ({
    tag: e.tagName, alt: Math.round(e.getBoundingClientRect().height) }));
  ok('é caixa de várias linhas', cx.tag === 'TEXTAREA', cx.tag);
  ok('e tem altura de mais de uma linha', cx.alt > 60, `${cx.alt}px`);
  /* O limite de 180 continua — a anotação vira TÍTULO do passo no documento, e
     título não é parágrafo. O que mudou é a regra estar dita. */
  ok('o limite continua 180', (await pg.locator('#lenteNota').getAttribute('maxlength')) === '180');
  await pg.locator('#lenteNota').fill('o total veio errado');
  await pg.waitForTimeout(250);
  const conta = (await pg.locator('#lenteNotaConta').textContent() || '').trim();
  ok('e a tela conta o que ainda cabe', /161/.test(conta), conta.slice(0, 60));
  ok('dizendo por que há limite', /título deste passo/i.test(conta), conta.slice(0, 70));
}
await pg.locator('#lenteFechar').click();
await pg.waitForTimeout(400);

console.log('\n[4] a lente aberta pelo Editar NÃO fala em revisão');
{
  /* Um botão dizendo "finalizar a revisão" numa lente aberta pela miniatura
     seria uma porta para um lugar onde a pessoa não está. */
  await pg.locator('#thumbs figure .editar').first().click();
  await pg.waitForTimeout(400);
  ok('o botão de voltar para a revisão está escondido',
     await pg.locator('#lenteRev').evaluate(e => e.classList.contains('hide')));
  await pg.locator('#lenteFechar').click();
  await pg.waitForTimeout(400);
}

console.log('\n[5] dentro da revisão, a lente sabe onde a pessoa está');
await pg.locator('#revisar').click();
await pg.waitForTimeout(600);
{
  await pg.locator('#revEditar').click();
  await pg.waitForTimeout(500);
  ok('o botão aparece', !(await pg.locator('#lenteRev').evaluate(e => e.classList.contains('hide'))));
  const rot = (await pg.locator('#lenteRev').textContent() || '').trim();
  ok('e no primeiro quadro ele DEVOLVE', /voltar para a revisão/i.test(rot), rot);
  await pg.locator('#lenteRev').click();
  await pg.waitForTimeout(500);
  ok('e devolveu mesmo', await pg.locator('#lente').evaluate(e => e.classList.contains('hide')));
  ok('com a revisão ainda aberta',
     !(await pg.locator('#revBox').evaluate(e => e.classList.contains('hide'))));
}

console.log('\n[6] no último quadro, a lente ENCERRA a revisão');
{
  const total = await pg.locator('#thumbs figure').count();
  for (let i = 0; i < total - 1; i++) { await pg.locator('#revIgual').click(); await pg.waitForTimeout(280); }
  await pg.locator('#revEditar').click();
  await pg.waitForTimeout(500);
  const rot = (await pg.locator('#lenteRev').textContent() || '').trim();
  ok('o botão vira um finalizar', /finalizar a revisão/i.test(rot), rot);
  ok('e ganha destaque', await pg.locator('#lenteRev').evaluate(e => e.classList.contains('destaque')));
  await pg.locator('#lenteRev').click();
  await pg.waitForTimeout(700);
  /* Fecha a lente PRIMEIRO: uma lente por cima de um painel de revisão que
     deixou de existir é uma janela órfã. */
  ok('a lente fechou', await pg.locator('#lente').evaluate(e => e.classList.contains('hide')));
  ok('e a revisão terminou', await pg.locator('#revBox').evaluate(e => e.classList.contains('hide')));
  ok('com o resumo do que aconteceu',
     /concluída/i.test(await pg.locator('#movMsg').textContent() || ''),
     await pg.locator('#movMsg').textContent());
}

console.log('\n[7] o passo 3 tem um fim, e o fim leva ao prompt');
{
  const b = pg.locator('.sbOk[data-sb="4"]');
  ok('o subpasso 4 tem botão de encerrar', (await b.count()) === 1);
  const rot = (await b.textContent() || '').trim();
  ok('e ele fala do prompt, não de recomeçar', /prompt/i.test(rot), rot);
  await pg.evaluate(() => document.getElementById('sb4').open = true);
  await b.click();
  await pg.waitForTimeout(900);
  ok('o subpasso 4 fechou', !(await pg.locator('#sb4').evaluate(e => e.open)));
  /* E NÃO fica verde, porque nada foi gerado nesta corrida.

     Este é o ponto em que a regra do verde se mostra inteira: nos subpassos 2 e
     3 apertar "Pronto" vale, porque eles podem estar legitimamente vazios — uma
     gravação sem fala, um cenário sem identificação. No 4 não vale: "nada
     gerado" não é um passo concluído, é trabalho que falta, e uma bolinha verde
     em cima de um documento que não existe é a bolinha mentindo.

     O botão leva ao prompt de qualquer jeito — conduzir e marcar como feito são
     duas coisas diferentes. */
  ok('mas NÃO fica verde sem nada gerado',
     !(await pg.locator('#sb4').evaluate(e => e.classList.contains('feito'))));
  const cx = await pg.evaluate(() => {
    const e = document.getElementById('promptCard').getBoundingClientRect();
    return { topo: Math.round(e.top), alt: window.innerHeight };
  });
  ok('e a página foi para o cartão do prompt', cx.topo < cx.alt && cx.topo > -50,
     `topo em ${cx.topo}px de ${cx.alt}px de tela`);
}

console.log('\n[8] o contador da espera é grande');
{
  const fonte = fs.readFileSync(ROOT + '/app.html', 'utf8');
  ok('a porcentagem sai numa classe própria', /<b class="contando">' \+ pct/.test(fonte));
  ok('e sem porcentagem quem cresce é o relógio',
     /<b class="contando">' \+ duracao\(seg\)/.test(fonte));
  const tam = await pg.evaluate(() => {
    const b = document.createElement('b'); b.className = 'contando'; b.textContent = '42%';
    document.body.appendChild(b);
    const v = getComputedStyle(b).fontSize; b.remove(); return v;
  });
  ok('e é bem maior que a linha de status', parseFloat(tam) >= 20, tam);
}

/* ---- UM MODO DE CADA VEZ NA LENTE ----

   O DEFEITO: "Cortar as bordas" desenhava um retângulo em vez de cortar. O
   caminho é este — abrir "Apontar na imagem", que já entra com o retângulo
   escolhido, e depois clicar em "Cortar as bordas". O botão do corte desligava
   a tarja e esquecia o destaque, e o `pointerdown` testa `marcando()` PRIMEIRO:
   o arrasto virava desenho, e o corte não acontecia nunca.

   O NÚMERO QUE IMPORTA aqui é a LARGURA do quadro depois do arrasto. Afirmar
   "o modo do destaque desligou" mediria a variável, e não o resultado — o que
   a pessoa reclamou é que a imagem não foi cortada. */
console.log('\n[9] com o destaque ligado, "Cortar as bordas" corta — não desenha');
{
  await pg.locator('#lenteFechar').click().catch(() => {});
  await pg.waitForTimeout(300);
  await pg.locator('#thumbs figure .editar').first().click();
  await pg.waitForTimeout(500);

  const antes = await pg.evaluate(() => {
    const q = window.__quadros()[0];
    return { larg: q.img.w, marcas: (q.marcas || []).length };
  });

  // exatamente a ordem que produzia o defeito
  await pg.locator('#mkModo').click();
  await pg.waitForTimeout(250);
  ok('o destaque entrou com o retângulo escolhido',
     !(await pg.locator('#mkRet').evaluate(e => e.classList.contains('ghost')))); 
  await pg.locator('#cropModo').click();
  await pg.waitForTimeout(250);

  const cx = await pg.locator('#lenteImg').boundingBox();
  await pg.mouse.move(cx.x + cx.width * 0.25, cx.y + cx.height * 0.25);
  await pg.mouse.down();
  await pg.mouse.move(cx.x + cx.width * 0.75, cx.y + cx.height * 0.75, { steps: 12 });
  await pg.mouse.up();
  await pg.waitForTimeout(2500);

  const depois = await pg.evaluate(() => {
    const q = window.__quadros()[0];
    return { larg: q.img.w, marcas: (q.marcas || []).length };
  });
  console.log('      largura do quadro: ' + antes.larg + ' → ' + depois.larg);
  ok('a imagem foi mesmo cortada', depois.larg < antes.larg * 0.9,
     antes.larg + ' → ' + depois.larg);
  ok('e nenhum retângulo foi desenhado no lugar',
     depois.marcas === antes.marcas, antes.marcas + ' → ' + depois.marcas);
  ok('o botão de desfazer o corte apareceu',
     !(await pg.locator('#cropTirar').evaluate(e => e.classList.contains('hide'))));
  await pg.locator('#cropTirar').click();
  await pg.waitForTimeout(2000);
  await pg.locator('#lenteFechar').click().catch(() => {});
  await pg.waitForTimeout(300);
}

console.log('\n[10] nada disso quebrou o JS');
ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 170));

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nLente e fim da revisão: tudo passou.');
process.exit(falhas ? 1 : 0);
