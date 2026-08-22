/* A vitrine: a tabela de funcionalidades, o rodapé e as fichas de saída.
 *
 * O que este teste protege é uma coisa só, e ela é comercial antes de ser
 * técnica: **o site não pode prometer o que a ferramenta não faz.** Uma marca
 * de visto numa tabela de preço é uma promessa, e uma ficha "PPTX" na home é
 * outra. Aqui elas são conferidas contra o `app.html` de verdade.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import { criarProxy, exigirNext } from './proxy.mjs';
import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
await exigirNext();

const srv = criarProxy();
await new Promise((r) => srv.listen(8967, r));
const BASE = 'http://localhost:8967';
const br = await chromium.launch({ executablePath: CHROME_WS });
let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

const feats = JSON.parse(fs.readFileSync(`${RAIZ_WS}/src/features.json`, 'utf8'));
const TOTAL = feats.grupos.reduce((n, g) => n + g.itens.length, 0);
const app = fs.readFileSync(`${RAIZ_WS}/public/app.html`, 'utf8');

const ctx = await br.newContext({ viewport: { width: 1200, height: 900 } });
const pg = await ctx.newPage();
const erros = []; pg.on('pageerror', (e) => erros.push(e.message));

/* ------------------------------------------------ a tabela de funcionalidades */
console.log('[1] a lista completa está na página de preços, nos três idiomas');
const rotas = { pt: '/precos', en: '/en/precos', es: '/es/precos' };
const rotulos = {};
for (const [L, rota] of Object.entries(rotas)) {
  await pg.goto(BASE + rota);
  await pg.waitForTimeout(200);
  const linhas = await pg.locator('.listaF .fts li').count();
  ok(`${L}: as ${TOTAL} funcionalidades estão na lista`, linhas === TOTAL, `${linhas} linhas`);
  const grupos = await pg.locator('.listaF > details > summary > b').allTextContents();
  ok(`${L}: os ${feats.grupos.length} grupos têm título`,
     grupos.length === feats.grupos.length && grupos.every((g) => g.trim().length > 3), grupos.join(' | '));
  /* Os grupos nascem ABERTOS. Uma lista dobrável que nasce fechada esconde 87
     linhas atrás de doze cliques, e numa página de preço isso é a mesma coisa
     que não ter a lista. Dobrar é para quem já leu, não para quem chegou. */
  const abertos = await pg.locator('.listaF > details[open]').count();
  ok(`${L}: e nascem abertos`, abertos === feats.grupos.length, `${abertos}/${feats.grupos.length}`);
  rotulos[L] = await pg.locator('.listaF .fts li').allTextContents();
  ok(`${L}: nenhuma linha ficou sem texto`, rotulos[L].every((r) => r.trim().length > 5),
     rotulos[L].filter((r) => r.trim().length <= 5).join(' | '));
  /* O número no parágrafo é contado, não escrito à mão. Um número redondo
     digitado envelhece na primeira vez que alguém mexe na lista. */
  ok(`${L}: o parágrafo diz o número certo`,
     (await pg.locator('body').innerText()).includes(String(TOTAL)));
}

console.log('\n[2] a tradução da tabela não ficou pela metade');
for (const L of ['en', 'es']) {
  const iguais = rotulos.pt.filter((r, i) => r === rotulos[L][i] && r.length > 25);
  ok(`${L}: nenhuma linha longa ficou em português`, iguais.length === 0, iguais.slice(0, 3).join(' | '));
}

console.log('\n[3] o selo do plano bate com o que o arquivo de dados declara');
{
  await pg.goto(BASE + '/precos');
  /* A regra nova da lista: sem selo = gratuito. O que se mede aqui é
     exatamente essa regra, item por item, contra o `features.json`. Se alguém
     trancar uma funcionalidade atrás de um plano e esquecer do site — ou o
     contrário, e o site prometer de graça o que é pago — cai aqui. */
  const selos = await pg.locator('.listaF .fts li').evaluateAll((lis) =>
    lis.map((li) => {
      const p = li.querySelector('.pl');
      if (!p) return '';
      /* O "só no" existe só para quem ouve a página; o nome do plano é o que
         se vê. Ler os dois juntos aqui compararia maçã com laranja. */
      const so = p.querySelector('.soLeitor');
      return p.textContent.replace(so ? so.textContent : '', '').trim();
    }));
  const esperado = feats.grupos.flatMap((g) => g.itens).map((i) =>
    i.planos.includes('f') ? '' : (i.planos.includes('p') ? 'Personal' : 'Team'));
  const difere = selos.findIndex((m, i) => m !== esperado[i]);
  ok('o selo de cada linha é o que o dado diz', difere < 0,
     difere < 0 ? '' : `linha ${difere}: tela="${selos[difere]}" dado="${esperado[difere]}"`);
  ok('e o gratuito é o silêncio — a maioria não tem selo',
     selos.filter((x) => !x).length === esperado.filter((x) => !x).length,
     `${selos.filter((x) => !x).length} sem selo`);
  /* "Personal" sozinho é ambíguo para quem ouve a página: pode ser o nome de um
     plano ou o nome da funcionalidade. A palavra que falta vai junto, escondida. */
  const semPalavra = await pg.locator('.listaF .pl').evaluateAll((pls) =>
    pls.filter((p) => !p.querySelector('.soLeitor')).length);
  ok('todo selo diz "só no" para leitor de tela', semPalavra === 0, String(semPalavra));
  /* O selo do TÍTULO só pode existir quando o grupo inteiro é do mesmo plano.
     Um "PERSONAL" em cima de um grupo que tem duas linhas Team promete de
     menos justamente onde o preço é maior. */
  const tituloSelo = await pg.locator('.listaF > details').evaluateAll((ds) => ds.map((d) => {
    const p = d.querySelector('summary .pl');
    const itens = [...d.querySelectorAll('.fts li')];
    return { selo: p ? p.textContent.replace(/^.*?(Personal|Team)$/s, '$1') : '',
             planos: [...new Set(itens.map((li) => {
               const s2 = li.querySelector('.pl');
               return s2 ? s2.textContent.replace(/^.*?(Personal|Team)$/s, '$1') : 'Free';
             }))] };
  }));
  const errados = tituloSelo.filter((g) => g.selo && (g.planos.length > 1 || g.planos[0] !== g.selo));
  ok('o selo do grupo só aparece quando o grupo inteiro é do mesmo plano',
     errados.length === 0, JSON.stringify(errados.slice(0, 2)));

  /* A regra tem que estar escrita, e não só implícita no desenho. */
  ok('e a página explica a regra em uma frase',
     /sem|não têm marca|no mark|ninguna marca/i.test(await pg.locator('.tpRegra').innerText()),
     await pg.locator('.tpRegra').innerText());
}

console.log('\n[4] o que está no Free é o que a ferramenta faz sem licença');
{
  /* A tese do produto, medida: a licença destrava UMA coisa dentro do app — a
     marca do cliente no documento. Se um dia alguém trancar mais coisa atrás do
     plano sem mexer no site, esta conta muda e o teste avisa. */
  const pagos = feats.grupos.flatMap((g) => g.itens).filter((i) => !i.planos.includes('f'));
  ok(`${pagos.length} funcionalidades são pagas, de ${TOTAL}`, pagos.length > 0 && pagos.length < TOTAL / 3,
     `${pagos.length}/${TOTAL}`);
  const travas = (app.match(/temTime\(\)/g) || []).length;
  ok('e a ferramenta tem poucas travas de licença mesmo', travas <= 8, `${travas} usos de temTime()`);
  /* A licença do Personal precisa ser aceita: ela existe na Stripe, e uma
     ferramenta que só aceita 'time' faria a pessoa pagar e não destravar nada. */
  ok('a ferramenta aceita a licença do Personal, não só a do Team',
     /p !== 'time' && dados\.p !== 'personal'/.test(app), 'a checagem de plano mudou de forma');
}

/* ---------------------------------------------------------------- as fichas */
console.log('\n[5] cada ficha de saída na home existe como botão na ferramenta');
{
  await pg.goto(BASE + '/?lang=pt');
  await pg.waitForTimeout(300);
  const fichas = await pg.locator('.saidas .saida b').allTextContents();
  ok('a home lista os formatos', fichas.length >= 10, fichas.join(' '));
  const provas = {
    PDF: 'id="go"', DOCX: 'id="docx"', PPTX: 'id="pptx"', HTML: 'id="html"',
    MD: 'id="md"', SCORM: 'id="scorm"', CSV: 'id="csv"', JSON: 'id="json"',
    /* VTT e SRT não têm botão próprio: eles viajam DENTRO do .zip, como
       `legenda.vtt` e `legenda.srt`. Os botões de baixar legenda solta saíram
       da tela — eram mais três arquivos numa ferramenta que já entrega quinze.
       O formato continua existindo, e é isso que a home promete. */
    ZIP: 'id="zip"', VTT: "nome: 'legenda.vtt'", SRT: "nome: 'legenda.srt'",
    'Google Docs': 'id="gdocs"', Jira: 'id="jira"',
  };
  for (const f of fichas) {
    const prova = provas[f];
    ok(`"${f}" tem botão de verdade no app.html`, !!prova && app.includes(prova),
       prova ? 'não achei ' + prova : 'ficha sem prova declarada no teste');
  }
}

/* ---------------------------------------------------------------- o rodapé */
console.log('\n[6] o rodapé tem os casos de uso, nos três idiomas');
{
  const casos = {
    pt: ['/evidencia-de-teste', '/instrucao-de-trabalho', '/ata-de-reuniao', '/teste-de-usabilidade', '/contexto-para-ia'],
    en: ['/en/test-evidence', '/en/work-instruction', '/en/meeting-minutes', '/en/usability-test', '/en/context-for-ai'],
    es: ['/es/evidencia-de-prueba', '/es/instruccion-de-trabajo', '/es/acta-de-reunion', '/es/prueba-de-usabilidad', '/es/contexto-para-ia'],
  };
  const conta = { pt: '/conta', en: '/en/account', es: '/es/cuenta' };
  for (const [L, rota] of Object.entries({ pt: '/precos', en: '/en/precos', es: '/es/precos' })) {
    await pg.goto(BASE + rota);
    const links = await pg.locator('footer a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    const faltam = casos[L].filter((c) => !links.includes(c));
    ok(`${L}: os cinco casos de uso estão no rodapé`, faltam.length === 0, faltam.join(' '));
    ok(`${L}: e a área do cliente também`, links.includes(conta[L]), links.join(' '));
    const titulos = await pg.locator('footer .rodapeCols h3').allTextContents();
    ok(`${L}: três colunas com nome`, titulos.length === 3 && titulos.every((t) => t.trim()), titulos.join(' | '));
    /* Endereço de outro idioma no rodapé é o erro clássico de site traduzido:
       a pessoa clica e cai numa página que não fala a língua dela. */
    const forasteiros = links.filter((h) => h && h.startsWith('/') &&
      (L === 'pt' ? /^\/(en|es)\//.test(h) : !h.startsWith(`/${L}/`) && h !== `/${L}` && !h.startsWith('/app')));
    ok(`${L}: nenhum link do rodapé vai para outro idioma`, forasteiros.length === 0, forasteiros.join(' '));
  }
}

console.log('\n[7] a lista não estoura o telefone');
{
  const pg2 = await (await br.newContext({ viewport: { width: 380, height: 800 } })).newPage();
  await pg2.goto(BASE + '/precos');
  await pg2.waitForTimeout(300);
  /* A tabela rola por dentro; quem não pode rolar é a PÁGINA. Rolagem
     horizontal no corpo inteiro é o defeito que faz o texto fugir do dedo.

     A pergunta é feita EMPURRANDO a página, não lendo `scrollWidth`: o
     `scrollWidth` da raiz conta a largura intrínseca de quem rola por dentro e
     acusa 548 numa página que não anda um pixel. Medir a intenção do navegador
     em vez do que a pessoa sente foi o que quase me fez "consertar" o que não
     estava quebrado. */
  const rolou = await pg2.evaluate(() => { window.scrollTo(400, 0); return window.scrollX; });
  ok('a página não anda para o lado', rolou === 0, String(rolou));
  /* A tabela rolava por dentro porque tinha 560px de largura mínima. A lista
     não tem: ela quebra a linha. Então a pergunta agora é mais simples e mais
     forte — NADA pode passar da borda, nem a lista nem o resto. */
  const vazando = await pg2.evaluate(() => [...document.querySelectorAll('body *')]
    .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
    .map((el) => el.tagName + '.' + (el.className || '').toString().slice(0, 20)).slice(0, 4));
  ok('e nada fica pendurado para fora da tela', vazando.length === 0, vazando.join(' '));
  /* Duas colunas num telefone de 380px dariam 160px de largura por coluna, que
     é onde "Gravar a tela ali mesmo" vira seis linhas de duas palavras. */
  const colunas = await pg2.locator('.fts').first().evaluate((e) => getComputedStyle(e).columnCount);
  ok('e a lista vira uma coluna só no telefone', colunas === '1', colunas);
  const largo = await (await br.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  await largo.goto(BASE + '/precos');
  const c2 = await largo.locator('.fts').first().evaluate((e) => getComputedStyle(e).columnCount);
  ok('e duas no computador — 87 linhas numa coluna só é uma corrida de rolagem', c2 === '2', c2);
  await largo.context().close();
  await pg2.context().close();
}

ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 160));
await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nVitrine: tudo passou.');
process.exit(falhas ? 1 : 0);
