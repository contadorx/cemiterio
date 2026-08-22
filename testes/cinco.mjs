/* Os cinco idiomas: as 16 páginas em cada um, o seletor, e as pontes.
 *
 * Um idioma novo num site trilíngue não é tradução: é uma tabela a mais em cada
 * lugar onde alguém escreveu ['pt','en','es'] à mão. Este arquivo procura pelos
 * sintomas disso — página que não abre, link que aponta para o idioma errado,
 * seletor que esqueceu uma sigla, e página que ficou em português.
 */
import { chromium } from 'playwright';
import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const SITE = 'http://localhost:8802';
const rotas = JSON.parse(fs.readFileSync(`${RAIZ_WS}/src/rotas.json`,'utf8'));
const { idiomas, slugs } = rotas;
const pre = (L) => (L === 'pt' ? '' : '/' + L);

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const br = await chromium.launch({ executablePath: CHROME_WS });
const pg = await (await br.newContext({ viewport: { width: 1200, height: 900 } })).newPage();

console.log('[1] os cinco idiomas estão declarados');
ok('rotas.json traz de e fr', idiomas.join(',') === 'pt,en,es,de,fr', idiomas.join(','));

console.log('\n[2] toda página abre em todo idioma');
{
  /* Por `fetch`, e não por navegação de navegador: são 80 endereços, e abrir
     80 páginas de verdade só para ler o código de resposta é lento o bastante
     para o servidor engasgar — e um teste que reprova por engasgo não diz nada
     sobre o produto. Uma segunda tentativa cobre o engasgo que sobrar. */
  const status = async (u) => {
    for (let i = 0; i < 2; i++) {
      try { const r = await fetch(SITE + u, { redirect: 'manual' }); return r.status; }
      catch (e) { await new Promise((z) => setTimeout(z, 400)); }
    }
    return 0;
  };
  let ruins = [];
  for (const L of idiomas) {
    const enderecos = [pre(L) || '/', ...Object.keys(slugs).map((pg2) => pre(L) + '/' + slugs[pg2][L])];
    for (const u of enderecos) {
      const st = await status(u);
      if (st !== 200) ruins.push(`${u} (${st || 'sem resposta'})`);
    }
  }
  ok(`${idiomas.length} idiomas × ${Object.keys(slugs).length + 1} páginas = ${idiomas.length * (Object.keys(slugs).length + 1)} endereços`,
     ruins.length === 0, ruins.slice(0, 6).join(' | '));
}

console.log('\n[3] as páginas novas estão MESMO no idioma delas');
{
  /* Uma página que existe e está em português é pior do que uma que não existe:
     ela promete e não entrega, e o buscador indexa a promessa. */
  const provas = [
    ['/de/preise', /kostenlos|Browser|Konto/],
    ['/fr/tarifs', /gratuit|navigateur|compte/],
    ['/de/hilfe', /Wissensdatenbank|Bildschirmaufnahme/],
    ['/fr/aide', /connaissances|enregistrement/],
    ['/de/informationssicherheit', /Informationssicherheit|Server/],
    ['/fr/securite-de-l-information', /sécurité|serveur/],
    ['/de/testnachweis', /Testnachweis|Nachweis/],
    ['/fr/preuve-de-test', /preuve|test/],
  ];
  for (const [u, re] of provas) {
    await pg.goto(SITE + u, { waitUntil: 'domcontentloaded' });
    const t = await pg.locator('body').innerText();
    ok(`${u} fala o idioma dele`, re.test(t), t.replace(/\s+/g, ' ').slice(0, 70));
    /* E o `lang` do documento, que é o que o leitor de tela e o buscador leem. */
    const lang = await pg.evaluate(() => document.documentElement.lang);
    ok(`  e declara lang="${u.split('/')[1]}"`, lang === u.split('/')[1], lang);
  }
}

console.log('\n[4] o seletor de idioma oferece os cinco, e leva à mesma página');
{
  await pg.goto(SITE + '/de/preise', { waitUntil: 'domcontentloaded' });
  const links = await pg.locator('header nav a').evaluateAll((as) =>
    as.map((a) => ({ txt: a.textContent.trim(), href: a.getAttribute('href') })));
  const siglas = links.filter((l) => /^(PT|EN|ES|DE|FR)$/i.test(l.txt));
  ok('as cinco siglas estão no cabeçalho', siglas.length === 5, siglas.map((s) => s.txt).join(' '));
  const fr = siglas.find((s) => /fr/i.test(s.txt));
  ok('e o FR leva à MESMA página, não à home', (fr?.href || '').includes('/fr/tarifs'), fr?.href);
}

console.log('\n[5] o rodapé e o hreflang não ficaram para trás');
{
  await pg.goto(SITE + '/fr/aide', { waitUntil: 'domcontentloaded' });
  const alt = await pg.locator('link[rel=alternate]').evaluateAll((ls) =>
    ls.map((l) => l.getAttribute('hreflang')));
  /* O português sai como `pt-BR`, com região, porque é o que ele é. */
  for (const L of idiomas)
    ok(`  hreflang ${L}`, alt.includes(L === 'pt' ? 'pt-BR' : L), alt.join(' '));
  const mapa = fs.readFileSync(`${RAIZ_WS}/public/sitemap-paginas.xml`, 'utf8');
  for (const u of ['/de/hilfe', '/fr/aide', '/de/preise', '/fr/tarifs'])
    ok(`  o sitemap conhece ${u}`, mapa.includes(u));
}

console.log('\n[6] o preço grande é na moeda de quem lê');
{
  /* Um alemão lendo "R$ 149" não sabe se é caro. A conversão existe na linha de
     baixo desde sempre; o que estava errado era QUAL delas ficava grande — o
     real era o número grande nos cinco idiomas, inclusive nos que não pagam em
     real. */
  const PRIM = { pt: 'R$', en: 'US$', es: 'US$', de: '€', fr: '€' };
  for (const L of idiomas) {
    await pg.goto(SITE + pre(L) + '/' + slugs.precos[L], { waitUntil: 'domcontentloaded' });
    const grandes = await pg.locator('.plan .price').allTextContents();
    const p = PRIM[L];
    ok(`${L}: o número grande é em ${p}`,
       grandes.length === 3 && grandes.every((t) => t.trim().startsWith(p + ' ')),
       grandes.map((t) => t.trim().split(' ').slice(0, 2).join(' ')).join(' · '));
    /* E as outras duas continuam ali embaixo, para a conversão ser possível. */
    const linhas = await pg.locator('.plan .moedas').allTextContents();
    ok(`  e as outras duas moedas continuam na linha de baixo`,
       linhas.length === 3 && linhas.every((t) => !t.includes(p) && (t.match(/·/g) || []).length === 1),
       linhas[1]);
  }
}

console.log('\n[7] o vídeo da home carrega em todo idioma');
{
  /* O tour foi gravado em pt, en e es. Alemão e francês entraram no site e não
     no estúdio — e um `<video>` apontando para um arquivo que não existe não é
     "vídeo faltando": é uma caixa preta vazia no alto da home, que é a primeira
     coisa que a pessoa vê. Cai no inglês até serem gravados. */
  for (const L of idiomas) {
    await pg.goto(SITE + (pre(L) || '') + '/?lang=' + L, { waitUntil: 'domcontentloaded' });
    const fontes = await pg.locator('figure.tour source').evaluateAll(
      (ss) => ss.map((s2) => s2.getAttribute('src')));
    const poster = await pg.locator('figure.tour video').getAttribute('poster');
    const alvos = [...fontes, poster].filter(Boolean);
    const ruins = [];
    for (const u of alvos) {
      const r = await fetch(SITE + u).catch(() => null);
      if (!r || r.status !== 200) ruins.push(`${u}=${r ? r.status : 'x'}`);
    }
    ok(`${L}: o vídeo e o pôster existem`, ruins.length === 0, ruins.join(' '));
  }
}

await br.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nCinco idiomas: tudo passou.');
process.exit(falhas ? 1 : 0);
