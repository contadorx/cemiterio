/* A aba flutuante e a base de conhecimento.
 *
 * "Avisar um problema" morava no rodapé do app, e rodapé é onde a pessoa chega
 * depois de rolar a página inteira — ou seja, nunca, porque quem está com
 * problema para de rolar exatamente onde o problema aconteceu.
 *
 * São dois botões e não um, porque são duas perguntas diferentes: "como isso
 * funciona?" tem resposta escrita, e "isso está errado" precisa de gente. Um
 * botão só forçaria quem quer a primeira a mandar recado para descobrir.
 *
 * O que este arquivo cobra:
 *   - a aba existe, nas duas larguras, sem tapar controle nenhum;
 *   - o botão de recado continua sendo o mesmo `#avisar` de sempre e continua
 *     abrindo o mesmo modal — a mudança é de lugar, não de caminho;
 *   - o link da base vai para o endereço DO IDIOMA em que a pessoa está;
 *   - e a base existe nos três, com os nove temas.
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
await new Promise(r => srv.listen(8915, r));

const SITE = 'http://localhost:8802';   // o Next que a regressão já sobe
const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

/* O mesmo probe do `tapado.mjs`: `elementFromPoint` no centro do elemento. Um
   botão que existe e está coberto é um botão que não existe. */
const alcancavel = (pg, id) => pg.evaluate((sel) => {
  const b = document.getElementById(sel);
  if (!b) return { ok: false, motivo: 'ausente' };
  const r = b.getBoundingClientRect();
  if (!r.width || !r.height) return { ok: false, motivo: 'sem área' };
  const topo = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
  const desc = e => !e ? '(nada)' : e.tagName.toLowerCase() + (e.id ? '#' + e.id : '');
  return { ok: topo === b || b.contains(topo), motivo: 'tapado por ' + desc(topo) };
}, id);

for (const [larg, alt, nome] of [[1400, 900, 'tela larga'], [1000, 900, 'tela estreita']]) {
  console.log(`[1·${nome}] a aba está lá, e alcançável`);
  const ctx = await br.newContext({ viewport: { width: larg, height: alt } });
  const pg = await ctx.newPage();
  const erros = []; pg.on('pageerror', e => erros.push(e.message));
  await pg.goto('http://localhost:8915/app.html?lang=pt');
  await pg.waitForTimeout(800);

  ok('a aba aparece', await pg.locator('#abaLado').isVisible());
  const a = await alcancavel(pg, 'avisar');
  ok('o botão de recado está alcançável', a.ok, a.motivo);
  const k = await alcancavel(pg, 'abaKb');
  ok('o da base também', k.ok, k.motivo);

  /* A aba é fixa. Numa tela estreita ela desce para o canto, e o canto é onde
     moram botões de saída — se ela cobrisse um deles, a troca seria péssima. */
  const conflito = await pg.evaluate(() => {
    const aba = document.getElementById('abaLado').getBoundingClientRect();
    const maus = [];
    for (const b of document.querySelectorAll('button, a.btn, select, input')) {
      if (b.closest('#abaLado')) continue;
      const r = b.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.left < aba.right && r.right > aba.left && r.top < aba.bottom && r.bottom > aba.top)
        maus.push(b.id || b.textContent.trim().slice(0, 24));
    }
    return maus;
  });
  ok('e não cobre controle nenhum da tela', conflito.length === 0, conflito.join(' | '));

  console.log(`[2·${nome}] o recado continua sendo o mesmo caminho de antes`);
  await pg.locator('#avisar').click();
  await pg.waitForTimeout(400);
  ok('o modal abriu', await pg.locator('#fbModal').isVisible());
  const tipos = await pg.locator('#fbTipos .fbTipo').allTextContents();
  ok('com os três tipos: problema, ideia e elogio', tipos.length === 3, tipos.join(' · '));
  await pg.locator('#fbFechar').click();
  await pg.waitForTimeout(250);
  ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 140));
  await ctx.close();
}

console.log('\n[3] o link da base vai para o endereço do idioma');
{
  const ctx = await br.newContext({ viewport: { width: 1400, height: 900 } });
  const pg = await ctx.newPage();
  for (const [lang, fim] of [['pt', '/ajuda'], ['en', '/en/help'], ['es', '/es/ayuda']]) {
    await pg.goto('http://localhost:8915/app.html?lang=' + lang);
    await pg.waitForTimeout(500);
    const href = await pg.locator('#abaKb').getAttribute('href');
    ok(`${lang}: ${fim}`, (href || '').endsWith(fim), href);
  }
  /* O mesmo defeito existia nos links do rodapé: apontavam para o endereço em
     português em qualquer idioma, e "Information security" levava a uma página
     que, em inglês, tem outro endereço. */
  await pg.goto('http://localhost:8915/app.html?lang=en');
  await pg.waitForTimeout(600);
  /* O rodape da ferramenta era uma linha com tres links marcados por
     `data-rota`. Ele virou o MESMO rodape do site — tres colunas, dezesseis
     links —, montado a partir da tabela que o `build.py` injeta. Entao a
     pergunta deixou de ser "aquele link aprendeu" e passou a ser a que importa:
     NENHUM deles ficou em portugues numa tela em ingles. */
  const doRodape = await pg.locator('.rodapeCols a').evaluateAll(
    (as) => as.map((a) => a.getAttribute('href')).filter((h) => h && h.startsWith('http')));
  ok('o rodapé tem os links do site', doRodape.length >= 12, String(doRodape.length));
  const forasteiros = doRodape.filter((h) => !/\/en\//.test(h));
  ok('e todos foram para o inglês', forasteiros.length === 0, forasteiros.join(' '));
  ok('inclusive a página de segurança',
     doRodape.some((h) => h.endsWith('/en/security')), doRodape.join(' '));
  await ctx.close();
}

console.log('\n[4] a base existe nos três idiomas, com os nove temas');
{
  /* O NÚMERO VEM DA FONTE, e não escrito aqui à mão.
     Ele estava assim: `blocos === 44`. Bastou acrescentar um bloco à base para
     os três idiomas falharem juntos — e o teste apontava para o lugar errado,
     porque o defeito que ele existe para pegar é UM idioma ficar para trás dos
     outros, não a base crescer. Contando o português, a afirmação volta a ser
     a que importa: os idiomas têm a MESMA quantidade de blocos. */
  const ESPERADO = (fs.readFileSync(`${RAIZ_WS}/src/site/bodies/ajuda.pt.html`, 'utf8')
    .match(/<details>/g) || []).length;
  const ctx = await br.newContext({ viewport: { width: 1200, height: 900 } });
  const pg = await ctx.newPage();
  for (const [u, titulo] of [['/ajuda', 'Base de conhecimento'],
                             ['/en/help', 'Knowledge base'],
                             ['/es/ayuda', 'Base de conocimiento']]) {
    const r = await pg.goto(SITE + u, { waitUntil: 'domcontentloaded' }).catch(() => null);
    if (!r || r.status() !== 200) { ok(`${u} abre`, false, r ? String(r.status()) : 'sem resposta'); continue; }
    ok(`${u} abre`, true);
    ok(`  o título é "${titulo}"`, (await pg.locator('h1').first().textContent()).trim() === titulo,
       (await pg.locator('h1').first().textContent()).trim());
    const temas = await pg.locator('.doc h2').count();
    const blocos = await pg.locator('.faq details').count();
    ok('  nove temas', temas === 9, String(temas));
    ok(`  e os mesmos ${ESPERADO} blocos dos outros idiomas`, blocos === ESPERADO, String(blocos));
    /* Um <details> fechado é conteúdo escondido; escondido do buscador seria
       uma base de conhecimento que ninguém acha. O texto está no HTML. */
    const cru = await pg.content();
    ok('  o texto está no HTML, e não só depois de um clique', cru.length > 18000,
       String(cru.length));
    ok('  o rodapé tem o link para ela',
       (await pg.locator('footer a[href*="ajuda"], footer a[href*="help"], footer a[href*="ayuda"]').count()) > 0);
  }
  await ctx.close();
}

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nAba flutuante e base de conhecimento: tudo passou.');
process.exit(falhas ? 1 : 0);
