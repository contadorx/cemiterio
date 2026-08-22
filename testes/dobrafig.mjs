/* A dobra principal da home, nos cinco idiomas.
 *
 * O que se cobra aqui, e por quê:
 *
 *   - a figura existe e está DENTRO da dobra, e não perdida no meio da página;
 *   - ela tem rótulo de acessibilidade NO IDIOMA da página. Uma figura sem
 *     rótulo é invisível para leitor de tela, e uma figura com rótulo em
 *     português numa página em alemão é pior do que sem rótulo;
 *   - ela é SVG embutido, e não `<img>`. Isso não é preciosismo: é o que faz a
 *     cor acompanhar o modo escuro, e é a diferença entre dois quilobytes e
 *     duzentos;
 *   - **nenhuma cor fixa dentro dela**, que é a regressão que este arquivo
 *     existe para impedir. Bastava alguém escrever `fill="#fff"` de novo e a
 *     figura voltaria a acender no escuro sem ninguém perceber — porque no
 *     claro fica igual;
 *   - o vídeo do tour continua na dobra, e continua DEPOIS da figura. A figura
 *     entrou para somar, não para tomar o lugar dele;
 *   - e no telefone o desenho vem DEPOIS do botão. Ilustração acima do texto
 *     numa tela de 667px empurra o botão para fora da primeira tela — a dobra
 *     deixaria de ter dobra, que é o oposto do que se quis fazer.
 */
import { chromium } from 'playwright';

import { CHROME_WS } from './_caminhos.mjs';
const BASE = 'http://localhost:8802';
/* `?lang=pt` na home, e não `/` puro. A home em português É a raiz, e a raiz
 * roda o detector de idioma: num navegador configurado em inglês — que é o
 * caso deste, e o caso da maioria das máquinas de teste — `/` manda a pessoa
 * para `/en` antes de a página assentar. Sem isto o teste compararia o rótulo
 * inglês com o rótulo inglês e diria que o português está errado.
 *
 * O `?lang=pt` também grava a escolha, então as visitas a `/` mais abaixo
 * ficam em português sem precisar repetir a query. */
const IDIOMAS = [
  ['pt', '?lang=pt'],
  ['en', '/en'],
  ['es', '/es'],
  ['de', '/de'],
  ['fr', '/fr'],
];

let falhas = 0;
const ok = (n, c, e) => {
  console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : ''));
  if (!c) falhas++;
};

const br = await chromium.launch({
  executablePath: CHROME_WS,
});
const ctx = await br.newContext({ viewport: { width: 1200, height: 900 } });
const pg = await ctx.newPage();

console.log('[1] a figura está na dobra, nos cinco idiomas, com rótulo próprio');
const rotulos = new Map();
for (const [L, caminho] of IDIOMAS) {
  await pg.goto(BASE + caminho);
  await pg.waitForTimeout(150);   // o detector de idioma da home decide aqui
  const fig = pg.locator('.heroDuo .figDobra');
  ok(`${L}: a figura está dentro da dobra`, (await fig.count()) === 1);

  const t = (await pg.locator('.figDobra svg title').textContent() || '').trim();
  ok(`${L}: tem rótulo de acessibilidade`, t.length > 40, t.slice(0, 46));
  rotulos.set(L, t);

  /* SVG embutido, não `<img>`: é o que deixa a variável de CSS alcançar a
     figura. Um `<img src="...svg">` seria um documento separado e as cores
     ficariam congeladas. */
  ok(`${L}: é SVG embutido`, (await pg.locator('.figDobra svg rect').count()) > 20,
     String(await pg.locator('.figDobra svg rect').count()));
  ok(`${L}: e não uma imagem carregada`, (await pg.locator('.figDobra img').count()) === 0);
}

console.log('\n[2] os cinco rótulos são cinco textos diferentes');
{
  const vistos = new Set(rotulos.values());
  ok('nenhum idioma repetiu o rótulo do outro', vistos.size === 5, `${vistos.size} textos`);
  /* A prova de que o alemão não está em português: procurar uma palavra que só
     existe na tradução. Vale mais do que "são diferentes", porque dois textos
     podem diferir e ainda estar os dois no idioma errado. */
  ok('o alemão fala alemão', /Schritte|Dokument/.test(rotulos.get('de')),
     rotulos.get('de').slice(0, 40));
  ok('o francês fala francês', /étapes|capture/.test(rotulos.get('fr')),
     rotulos.get('fr').slice(0, 40));
  ok('o espanhol fala espanhol', /pasos|captura/.test(rotulos.get('es')),
     rotulos.get('es').slice(0, 40));
}

console.log('\n[3] nenhuma cor fixa — é isto que faz o modo escuro funcionar');
await pg.goto(BASE + '/');
{
  const fixas = await pg.evaluate(() => {
    const svg = document.querySelector('.figDobra svg');
    /* Uma cor VALE se for `var(--x)`, uma `color-mix` das nossas, `none`, ou o
       vermelho do ponto de gravação — vermelho é vermelho nos dois modos.
       Qualquer outra coisa é defeito, e "qualquer outra coisa" inclui o caso
       que a primeira versão deste teste deixou passar: `fill=FIG_PAPEL`, sem
       aspas e sem interpolação, que o navegador ignora e pinta de PRETO.
       Procurar só por `#hex` não pegava isso — não tem `#` nenhum. */
    const VALE = (v) => /^(var\(--[a-z-]+\)|color-mix\(in srgb, var\(--[a-z-]+\) \d+%, transparent\)|none|#EF6E6E)$/i.test(v);
    const ruins = [];
    for (const el of svg.querySelectorAll('*')) {
      for (const a of ['fill', 'stroke']) {
        const v = el.getAttribute(a);
        // `#EF6E6E` é o vermelho do ponto de gravação, e vermelho é vermelho
        // nos dois modos. Qualquer outra cor fixa é defeito.
        if (v && !VALE(v)) ruins.push(a + '=' + v);
      }
    }
    return ruins;
  });
  ok('a figura da dobra não tem cor escrita à mão', fixas.length === 0,
     fixas.slice(0, 5).join(' '));

  /* E as figuras que já estavam publicadas — o motivo de o modo escuro estar
     errado havia meses sem ninguém reclamar. */
  await pg.goto(BASE + '/evidencia-de-teste');
  const fixasDoc = await pg.evaluate(() => {
    /* Uma cor VALE se for `var(--x)`, uma `color-mix` das nossas, `none`, ou o
       vermelho do ponto de gravação — vermelho é vermelho nos dois modos.
       Qualquer outra coisa é defeito, e "qualquer outra coisa" inclui o caso
       que a primeira versão deste teste deixou passar: `fill=FIG_PAPEL`, sem
       aspas e sem interpolação, que o navegador ignora e pinta de PRETO.
       Procurar só por `#hex` não pegava isso — não tem `#` nenhum. */
    const VALE = (v) => /^(var\(--[a-z-]+\)|color-mix\(in srgb, var\(--[a-z-]+\) \d+%, transparent\)|none|#EF6E6E)$/i.test(v);
    const ruins = [];
    for (const el of document.querySelectorAll('.figDoc svg *')) {
      for (const a of ['fill', 'stroke']) {
        const v = el.getAttribute(a);
        if (v && !VALE(v)) ruins.push(a + '=' + v);
      }
    }
    return ruins;
  });
  ok('a figura do caso de uso também não', fixasDoc.length === 0,
     fixasDoc.slice(0, 5).join(' '));

  await pg.goto(BASE + '/');
  const fixasFluxo = await pg.evaluate(() => {
    /* Uma cor VALE se for `var(--x)`, uma `color-mix` das nossas, `none`, ou o
       vermelho do ponto de gravação — vermelho é vermelho nos dois modos.
       Qualquer outra coisa é defeito, e "qualquer outra coisa" inclui o caso
       que a primeira versão deste teste deixou passar: `fill=FIG_PAPEL`, sem
       aspas e sem interpolação, que o navegador ignora e pinta de PRETO.
       Procurar só por `#hex` não pegava isso — não tem `#` nenhum. */
    const VALE = (v) => /^(var\(--[a-z-]+\)|color-mix\(in srgb, var\(--[a-z-]+\) \d+%, transparent\)|none|#EF6E6E)$/i.test(v);
    const ruins = [];
    for (const el of document.querySelectorAll('.figFluxo svg *')) {
      for (const a of ['fill', 'stroke']) {
        const v = el.getAttribute(a);
        if (v && !VALE(v)) ruins.push(a + '=' + v);
      }
    }
    return ruins;
  });
  ok('e a do fluxo também não', fixasFluxo.length === 0, fixasFluxo.slice(0, 5).join(' '));
}

console.log('\n[4] no escuro a figura acompanha, em vez de acender');
{
  const escuro = await br.newContext({ viewport: { width: 1200, height: 900 }, colorScheme: 'dark' });
  const pe = await escuro.newPage();
  await pe.goto(BASE + '/');
  const cor = await pe.evaluate(() => {
    const folha = document.querySelector('.figDobra svg rect');
    return getComputedStyle(folha).fill;
  });
  // `var(--panel)` no escuro é #1a1d24. Se voltar branco, a variável não chegou.
  const [r, g, b] = (cor.match(/\d+/g) || ['255', '255', '255']).map(Number);
  ok('a folha do documento é escura no modo escuro', r < 80 && g < 80 && b < 90, cor);
  await escuro.close();
}

console.log('\n[5] a figura somou ao vídeo do tour, não tomou o lugar dele');
{
  await pg.goto(BASE + '/');
  ok('o vídeo do tour continua na dobra', (await pg.locator('.tour video').count()) === 1);
  const ordem = await pg.evaluate(() => {
    const f = document.querySelector('.figDobra');
    const v = document.querySelector('.tour');
    return f.compareDocumentPosition(v) & Node.DOCUMENT_POSITION_FOLLOWING ? 'figura antes' : 'video antes';
  });
  ok('e vem depois da figura', ordem === 'figura antes', ordem);
}

console.log('\n[6] no telefone o desenho cai depois do botão');
{
  const tel = await br.newContext({ viewport: { width: 390, height: 667 } });
  const pt = await tel.newPage();
  await pt.goto(BASE + '/');
  const cxBotao = await pt.locator('.heroDuo .btn').boundingBox();
  const cxFig = await pt.locator('.figDobra').boundingBox();
  ok('o botão está acima do desenho', cxBotao.y + cxBotao.height <= cxFig.y + 4,
     `botão termina em ${Math.round(cxBotao.y + cxBotao.height)}, desenho começa em ${Math.round(cxFig.y)}`);
  /* E a parte que importa de verdade: o botão cabe na primeira tela. */
  ok('e cabe na primeira tela do telefone', cxBotao.y + cxBotao.height < 667,
     `termina em ${Math.round(cxBotao.y + cxBotao.height)}px de 667`);
  ok('uma coluna só, e não duas espremidas',
     (await pt.evaluate(() => getComputedStyle(document.querySelector('.heroDuo')).gridTemplateColumns
       .split(' ').length)) === 1);
  await tel.close();
}

await br.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nDobra principal: tudo passou.');
process.exit(falhas ? 1 : 0);
