/* A MATRIZ DE MARCA: um lugar decide, e todos os formatos obedecem.
 *
 * O ACHADO que criou este arquivo: numa auditoria de quatro documentos reais
 * do mesmo material, o PPTX, o Markdown e o índice do `.zip` saíram SEM marca
 * de cliente nenhuma, enquanto o PDF, o HTML e o Word saíam com ela. Três de
 * dez formatos. Ninguém percebeu por meses, porque cada renderizador tinha o
 * seu próprio pedacinho de lógica de marca — e um formato esquecido não
 * levanta erro nenhum: ele só sai errado.
 *
 * A regra que fecha isso não é "lembrar de todos". É `marcaDoDoc()` ser a
 * ÚNICA fonte, e este arquivo cobrar isso de duas maneiras:
 *
 *   [A] no código-fonte — todo renderizador de documento chama `marcaDoDoc()`,
 *       e a lista dos renderizadores é DERIVADA do arquivo, não escrita aqui.
 *       Um formato novo entra na cobrança sozinho no dia em que nasce;
 *
 *   [B] no navegador — sem plano, nenhum formato inventa marca de cliente, e o
 *       seletor de classificação não existe. A classificação é o campo mais
 *       fácil de vazar para o plano errado: uma tarja de "Confidencial" que
 *       qualquer um escreve num produto gratuito ensina que a palavra não vale.
 *
 * O que ESTE arquivo não consegue cobrar: o comportamento com licença Personal
 * e Team de verdade. A licença é assinada com Ed25519, e a chave privada não
 * viaja no pacote — `testes/licenca.mjs` é quem faz isso, na máquina onde o
 * emissor vive. Aqui se cobra a estrutura e o nível grátis.
 *
 *   node testes/matriz.mjs
 */
import { chromium } from './_navegador.mjs';
import http from 'http';
import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const RAIZ = `${RAIZ_WS}`;
const fonte = fs.readFileSync(RAIZ + '/src/template.html', 'utf8');
const html = fs.readFileSync(RAIZ + '/public/app.html', 'utf8');

let falhas = 0;
const ok = (n, c, e) => {
  console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : ''));
  if (!c) falhas++;
};

// ---------------------------------------------------------------------------
console.log('[A] no código: uma fonte só, e todo renderizador bebe dela');
{
  const decls = (fonte.match(/function marcaDoDoc\s*\(/g) || []).length;
  /* Duas declarações com o mesmo nome no mesmo escopo se substituem em
     silêncio — foi assim que `passos()` sumiu uma vez neste projeto, sem um
     erro no console. */
  ok('marcaDoDoc() é declarada uma vez só', decls === 1, String(decls));

  /* A LISTA DOS RENDERIZADORES É DERIVADA. Escrevê-la aqui à mão seria a
     segunda lista ao lado da lista de verdade — e a segunda é a que fica
     desatualizada. Um `montarPdf` que nasça amanhã já entra cobrado.

     TRÊS RÉGUAS ERRADAS antes desta, e as três mediram sem avisar. Vale a pena
     ler, porque é a mesma armadilha três vezes:

       1. **fronteira só nas funções** — o corpo de `montarDocx` invadia o
          handler do PDF, que chama `marcaDoDoc()`. Passou com o conserto
          desligado. Um teste que passa com o conserto desligado não é teste;
       2. **contagem de chaves** — este arquivo escreve OOXML dentro de template
          literals, cheios de `{` e `}` em texto. A conta não fecha;
       3. **comentário contando a história** — o conserto no `montarDocx` veio
          com um comentário explicando o defeito, e o comentário dizia
          "…em vez de `marcaDoDoc()`". A varredura achou a chamada DENTRO do
          texto que narrava a ausência dela, e passou de novo.

     Daí as duas defesas abaixo: os comentários saem antes de medir, e a régua
     se confere — se o corpo de um renderizador encostar no do seguinte, a
     fronteira vazou e tudo o que vem depois mede errado. */
  const semComentario = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  const ANCORA = /\n  (?:(?:async )?function \w+\s*\(|\$\(|const \w+ = |let \w+ = )/g;
  const corpos = {};
  const re = /(?:async\s+)?function\s+(montar[A-Z]\w*)\s*\(/g;
  let m;
  while ((m = re.exec(fonte))) {
    const resto = fonte.slice(re.lastIndex);
    ANCORA.lastIndex = 0;
    const prox = ANCORA.exec(resto);
    corpos[m[1]] = semComentario(prox ? resto.slice(0, prox.index) : resto);
  }
  /* A régua se confere: nenhum corpo pode conter a declaração de outro
     renderizador. Se contiver, a fronteira vazou e tudo abaixo mede errado. */
  const vazou = Object.keys(corpos).filter(n =>
    Object.keys(corpos).some(o => o !== n && new RegExp('function ' + o + '\\s*\\(').test(corpos[n])));
  ok('a régua não vaza de um renderizador para o seguinte', vazou.length === 0,
     vazou.join(', ') || '—');
  /* SÓ OS QUE PRODUZEM DOCUMENTO, e a distinção é derivada, não escrita: um
     renderizador de documento é o que imprime o TÍTULO do documento. É a
     mesma pergunta que a marca responde — "de quem é isto e do que trata" —,
     então quem responde uma tem que responder a outra. `montarCsv` (uma
     planilha), `montarLegenda` e `montarBarraDaConta` (tela) ficam de fora
     por si mesmos, sem uma lista de exceções para alguém manter. */
  const docs = Object.keys(corpos).filter(n => /tituloDoDoc\(\)/.test(corpos[n]));
  console.log('     renderizadores encontrados: ' + docs.join(', '));
  ok('a varredura achou pelo menos quatro renderizadores de documento',
     docs.length >= 4, String(docs.length));

  const semMarca = docs.filter(n => !/marcaDoDoc\(\)/.test(corpos[n]));
  /* O NÚMERO QUE IMPORTA: zero. Com o defeito de origem, esta lista trazia
     montarPptx e montarMd. */
  ok('todos chamam marcaDoDoc()', semMarca.length === 0, semMarca.join(', ') || '—');

  /* O PDF e o índice do .zip não são `montar*` — moram dentro dos handlers dos
     botões. Eles entram pela mesma pergunta, feita ao trecho deles. */
  const pdf = semComentario(fonte.slice(fonte.indexOf("$('go').onclick")));
  ok('o PDF lê a marca da mesma função', /marcaDoDoc\(\)/.test(pdf));
  const zip = semComentario(fonte.slice(fonte.indexOf("$('zip').onclick"), fonte.indexOf("$('zip').onclick") + 4000));
  ok('o índice do .zip também', /marcaDoDoc\(\)/.test(zip));

  /* A CLASSIFICAÇÃO SAI EM TODA PÁGINA. Uma tarja de confidencialidade que só
     aparece na capa não protege nada: quem imprime a folha 30 leva uma folha
     sem marca. No PDF isso quer dizer estar dentro de `foot()`, que é o que
     roda por página — e não solto na capa. */
  const foot = pdf.slice(pdf.indexOf('const foot'), pdf.indexOf('const foot') + 1800);
  ok('e a classificação é desenhada dentro do rodapé de toda página',
     /classificacao/.test(foot), foot ? 'achou foot()' : 'não achou foot()');

  /* O EMISSOR É O NOME DA CONTA, e nunca um e-mail. Carimbar o e-mail pessoal
     de quem gerou no rodapé de uma evidência entregue ao cliente é uma decisão
     de privacidade que não é nossa para tomar. */
  const corpoMarca = fonte.slice(fonte.indexOf('function marcaDoDoc'),
                                 fonte.indexOf('function totalDePassosDe'));
  ok('o emissor vem do nome da conta, não de e-mail',
     /emissor:.*licenca && licenca\.q/.test(corpoMarca) && !/emissor:.*mail/i.test(corpoMarca),
     (corpoMarca.match(/emissor:.*/) || [''])[0].slice(0, 70));
}

// ---------------------------------------------------------------------------
console.log('\n[B] no navegador: sem plano, nenhum formato inventa marca de cliente');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) {
    r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end('');
  }
  r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(html);
});
await new Promise(r => srv.listen(8953, r));

const br = await chromium.launch({
  executablePath: CHROME_WS,
});
const ctx = await br.newContext({ acceptDownloads: true, viewport: { width: 1250, height: 980 } });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));
await pg.goto('http://localhost:8953/app.html?lang=pt');
await pg.selectOption('#modelo', 'evidencia');

{
  ok('a caixa da marca do cliente está escondida', !(await pg.locator('#marcaBox').isVisible()));
  /* O seletor de classificação é de Team, e só dele. */
  ok('e o seletor de classificação também',
     await pg.locator('#clsRow').evaluate(e => e.classList.contains('hide')));

  const nivel = await pg.evaluate(() => {
    const s = document.getElementById('docClass');
    return s ? s.value : '(sem seletor)';
  });
  ok('nenhuma classificação está escolhida', nivel === '', nivel);
}

console.log('\n[C] o documento grátis leva a NOSSA marca, e não um buraco');
await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForTimeout(2600);
await pg.selectOption('#mode', 'count');
await pg.fill('#count', '3');
await pg.locator('#extract').click();
await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length >= 3,
                         null, { timeout: 40000 });
await pg.waitForTimeout(400);
{
  const dl = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#html').click();
  const saida = fs.readFileSync(await (await dl).path(), 'utf8');
  /* O ALTO DO DOCUMENTO DIZ DE QUEM ELE É. No grátis ele estava VAZIO, com a
     plataforma aparecendo só no rodapé — um documento sem cabeça. */
  ok('o HTML grátis abre com a banda da marca', /class="abre"/.test(saida));
  ok('e não inventa bloco de cliente nenhum', !/class="cls"/.test(saida));

  const dl2 = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#md').click();
  const md = fs.readFileSync(await (await dl2).path(), 'utf8');
  ok('o Markdown grátis não sai com classificação', !/Confidencial|Restrito|Interno/.test(md),
     (md.match(/Confidencial|Restrito|Interno/) || ['—'])[0]);
  ok('mas leva a nossa marca no rodapé', /Walkstamp/i.test(md));
}

ok('sem erro de JavaScript', erros.length === 0, erros.join(' | ').slice(0, 200));

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nMatriz de marca: tudo passou.');
process.exit(falhas ? 1 : 0);
