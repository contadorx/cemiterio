/* O PASSO COM VÁRIAS TELAS — e o roteiro que a pessoa já tem.
 *
 * DE ONDE ISTO VEIO. Primeira conversa de campo: implantação de S/4HANA, 780
 * cenários, e o documento com os passos escritos JÁ CHEGA PRONTO — uma IA
 * genérica gerou. O que sobrou de humano é tirar o print e encaixar no passo
 * certo. Duas consequências, e as duas estão cobradas aqui:
 *
 *   1. UM QUADRO NÃO É UM PASSO. "Abrir a tela e logar" são duas telas. O
 *      modelo antigo obrigava a escolher entre dois erros: marcar as duas e uma
 *      ação virar "Passo 5" e "Passo 6", ou marcar uma e perder metade da
 *      prova.
 *   2. GERAR MAIS UM DOCUMENTO É COMPETIR com um documento que já existe. O
 *      roteiro da pessoa entra aqui e vira o título dos passos.
 *
 * E a afirmação que mais importa neste arquivo é a quarta: OS FORMATOS NÃO SE
 * CONTRADIZEM. Agrupar no HTML e esquecer o PDF faria a mesma imagem ser o
 * "Passo 3" num arquivo e o "Passo 5" no outro, dentro do mesmo .zip. Uma
 * evidência que discorda de si mesma não vale nada — e é o tipo de defeito que
 * só aparece na mesa de quem cobra a evidência, meses depois.
 *
 *   node testes/passomulti.mjs
 */
import { chromium } from './_navegador.mjs';   // abre os painéis e a gaveta das saídas
import http from 'http';
import fs from 'fs';
import { execSync } from 'child_process';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const RAIZ = `${RAIZ_WS}`;
const html = fs.readFileSync(RAIZ + '/public/app.html', 'utf8');
const jspdf = fs.readFileSync(RAIZ + '/vendor/jspdf.umd.min.js', 'utf8');
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) {
    r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end('');
  }
  r.writeHead(200, { 'Content-Type': 'text/html' }); r.end(html);
});
await new Promise(r => srv.listen(8946, r));

let falhas = 0;
const ok = (n, c, e) => {
  console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : ''));
  if (!c) falhas++;
};

const br = await chromium.launch({
  executablePath: CHROME_WS,
});
const ctx = await br.newContext({ acceptDownloads: true, viewport: { width: 1250, height: 980 } });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', e => erros.push(e.message));
await pg.route('**/jspdf**', r => r.fulfill({
  status: 200, headers: { 'content-type': 'text/javascript' }, body: jspdf }));
await pg.goto('http://localhost:8946/app.html?lang=pt');
await pg.selectOption('#modelo', 'evidencia');

/* Um redesenho pelo caminho da pessoa: descartar e devolver o mesmo quadro. Não
   há gancho de teste para `render()` de propósito — um atalho que só o teste
   percorre não prova nada sobre o caminho de quem usa. */
const redesenhar = async () => {
  await pg.locator('#thumbs .toque').first().click();
  await pg.waitForTimeout(150);
  await pg.locator('#thumbs .toque').first().click();
  await pg.waitForTimeout(350);
};
const legendas = () => pg.locator('#thumbs figcaption .passo').allTextContents();

// ---------------------------------------------------------------------------
console.log('[1] o roteiro que a pessoa já tem entra antes de gravar');
{
  await pg.locator('#roteiroAbrir').click();
  await pg.fill('#roteiroTxt',
    '1. Abrir a ME21N\n2. Preencher o cabecalho do pedido\n3. Lancar o item e salvar');
  await pg.locator('#roteiroUsar').click();
  await pg.waitForTimeout(300);
  const msg = await pg.locator('#roteiroMsg').textContent();
  ok('a lista foi lida', /3 passos/.test(msg), msg.slice(0, 60));
  /* A numeração de quem colou "1." não vira parte do título: o documento
     numera sozinho, e "Passo 1 — 1. Abrir a ME21N" numera duas vezes. */
  ok('a numeração da lista dele não entra no título',
     !/^\d/.test(await pg.evaluate(() => document.getElementById('roteiroTxt').value.split('\n')[0].replace(/^\d+\.\s*/, ''))));
}

// ---------------------------------------------------------------------------
console.log('\n[2] sem tocar em nada, um quadro continua sendo um passo');
await pg.setInputFiles('#file', '/tmp/amostra.webm');
await pg.waitForTimeout(2600);
await pg.selectOption('#mode', 'count');
await pg.fill('#count', '5');
await pg.locator('#extract').click();
await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length >= 5,
                         null, { timeout: 40000 });
await pg.waitForTimeout(500);
{
  const l = await legendas();
  console.log('     ' + JSON.stringify(l));
  /* A REGRA QUE TORNA ISTO SEGURO: quem nunca agrupar nada tem que receber
     exatamente o que recebia ontem. É por isso que a bandeira é `junto` e não
     `novoPasso` — a ausência dela já quer dizer a coisa certa, e todo `.json`
     já gerado volta certo sem conversão nenhuma. */
  ok('cinco quadros, cinco passos', l.length === 5 && /Passo 5/.test(l[4]), l.join(' | '));
  ok('e nenhum deles fala em "de N telas"', !l.some(x => /\//.test(x)), l.join(' | '));
}

// ---------------------------------------------------------------------------
console.log('\n[3] agrupando: um passo com três telas');
{
  await pg.evaluate(() => {
    const q = window.__quadros();
    q[1].junto = true; q[2].junto = true; q[4].junto = true;
    q[0].nota = 'Abrir a ME21N';
    q[3].nota = 'Preencher o cabecalho do pedido';
  });
  await redesenhar();
  const l = await legendas();
  console.log('     ' + JSON.stringify(l));
  ok('as três primeiras telas são o passo 1',
     /Passo 1 · 1\/3/.test(l[0]) && /Passo 1 · 2\/3/.test(l[1]) && /Passo 1 · 3\/3/.test(l[2]),
     l.slice(0, 3).join(' | '));
  /* O NÚMERO QUE IMPORTA: a quarta tela é o passo DOIS, e não o quatro. Se
     fosse quatro, o agrupamento seria só enfeite na legenda. */
  ok('e a quarta tela é o passo 2, não o 4', /Passo 2 · 1\/2/.test(l[3]), l[3]);
  ok('a tela que continua um passo é marcada na grade',
     (await pg.locator('#thumbs figure.juntoAoAnterior').count()) === 3,
     String(await pg.locator('#thumbs figure.juntoAoAnterior').count()));
}

// ---------------------------------------------------------------------------
console.log('\n[4] o HTML sai com um título e N imagens');
let htmlSaida = '';
{
  const dl = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#html').click();
  await (await dl).saveAs('/tmp/pm.html');
  htmlSaida = fs.readFileSync('/tmp/pm.html', 'utf8');
  const blocos = (htmlSaida.match(/<section class="passo/g) || []).length;
  const segue = (htmlSaida.match(/<section class="passo segue"/g) || []).length;
  const titulos = (htmlSaida.match(/<h2>Passo /g) || []).length;
  console.log('     blocos: ' + blocos + '   dos quais continuação: ' + segue +
              '   títulos: ' + titulos);
  ok('cinco imagens', blocos === 5, String(blocos));
  /* O CABEÇALHO NÃO SE REPETE. Repetir "Passo 3" em três blocos seguidos é
     exatamente a mentira que o agrupamento veio desfazer: o leitor conta três
     ações onde houve uma. */
  ok('mas só dois títulos de passo', titulos === 2, String(titulos));
  ok('e três blocos marcados como continuação', segue === 3, String(segue));
  ok('o título do roteiro chegou ao documento', /Abrir a ME21N/.test(htmlSaida));
  ok('e o documento fecha a própria conta', /Passo 1 de 2/.test(htmlSaida),
     (htmlSaida.match(/Passo \d+ de \d+/) || ['(não achou)'])[0]);
}

// ---------------------------------------------------------------------------
console.log('\n[5] OS FORMATOS NÃO SE CONTRADIZEM');
{
  /* A pergunta é uma só, e vale mais que todas as outras deste arquivo: a
     ÚLTIMA imagem é o passo 2 em todo lugar? Ela é a quinta da lista — quem
     numerar pela posição vai dizer 5. */
  const dl = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#csv').click();
  await (await dl).saveAs('/tmp/pm.csv');
  const csv = fs.readFileSync('/tmp/pm.csv', 'utf8').trim().split(/\r?\n/);
  const ultima = csv[csv.length - 1];
  console.log('     última linha da planilha: ' + ultima.slice(0, 60));
  ok('a planilha diz 2 na última imagem', /(^|;|,)"?2"?(;|,)/.test(ultima), ultima.slice(0, 60));

  const dl2 = pg.waitForEvent('download', { timeout: 60000 });
  await pg.locator('#json').click();
  await (await dl2).saveAs('/tmp/pm.json');
  const j = JSON.parse(fs.readFileSync('/tmp/pm.json', 'utf8'));
  const qs = j.frames || j.quadros || [];
  ok('o JSON guarda a bandeira do agrupamento',
     qs.filter(q => q.junto).length === 3,
     String(qs.filter(q => q.junto).length) + ' de ' + qs.length);

  const dl3 = pg.waitForEvent('download', { timeout: 90000 });
  await pg.locator('#go').click();
  await (await dl3).saveAs('/tmp/pm.pdf');
  ok('o PDF saiu', fs.existsSync('/tmp/pm.pdf') && fs.statSync('/tmp/pm.pdf').size > 20000,
     (fs.statSync('/tmp/pm.pdf').size / 1024).toFixed(0) + ' KB');
  /* O texto do PDF é comprimido; o que dá para afirmar sem descomprimir é que
     ele saiu inteiro. A concordância de número é cobrada acima, na planilha e
     no HTML, que saem da MESMA régua que o PDF usa. */
}

// ---------------------------------------------------------------------------
console.log('\n[5b] o PowerPoint é um slide por PASSO, não um por tela');
{
  /* O DEFEITO, visto num deck real: uma reunião de 119 quadros virou 120
     slides de UMA imagem cada. Quem apresenta passa vinte minutos clicando em
     "próximo" para mostrar a mesma tarefa vista de quatro ângulos.

     O NÚMERO QUE IMPORTA: cinco telas em dois passos têm que dar TRÊS slides
     (capa + 2), e não seis. Se der seis, o agrupamento não chegou ao PPTX e o
     deck contradiz o HTML do mesmo pacote. */
  const dl = pg.waitForEvent('download', { timeout: 90000 });
  await pg.locator('#pptx').click();
  await (await dl).saveAs('/tmp/pm.pptx');
  const lista = execSync('unzip -Z1 /tmp/pm.pptx', { encoding: 'utf8' }).trim().split('\n');
  const nSlides = lista.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length;
  const nImgs = lista.filter(n => /^ppt\/media\//.test(n)).length;
  console.log('     slides: ' + nSlides + '   imagens: ' + nImgs);
  ok('capa + um slide por passo = 3', nSlides === 3, String(nSlides));
  ok('e as cinco telas continuam todas no arquivo', nImgs === 5, String(nImgs));

  const s2 = execSync('unzip -p /tmp/pm.pptx ppt/slides/slide2.xml', { encoding: 'utf8' });
  const pics = (s2.match(/<p:pic>/g) || []).length;
  ok('o slide do passo 1 leva as TRÊS telas dele lado a lado', pics === 3, String(pics));
  ok('e o cabeçalho dele diz o passo, não a posição na lista',
     /Passo 1/.test(s2), (s2.match(/Passo \d+/) || ['(não achou)'])[0]);

  /* Cada imagem na sua proporção — a mesma régua que o PDF passou a usar.
     Três telas iguais lado a lado têm que sair com caixas de razão igual. */
  /* Só as caixas de IMAGEM: `<a:ext>` também aparece em caixa de texto, e uma
     régua que mede o cabeçalho junto passa a dizer qualquer coisa. */
  const razoes = [...s2.matchAll(/<p:pic>[\s\S]*?<\/p:pic>/g)]
    .map(b => b[0].match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/))
    .filter(Boolean)
    .map(m => Math.round((+m[2] / +m[1]) * 100) / 100);
  const daTelaP = await pg.evaluate(() => (window.__quadros() || [])
    .filter(f => f.keep).slice(0, 3).map(f => Math.round((f.img.h / f.img.w) * 100) / 100));
  console.log('     razão das caixas do slide 2: ' + JSON.stringify(razoes) +
              '   das telas: ' + JSON.stringify(daTelaP));
  ok('cada caixa saiu com a proporção da sua imagem',
     razoes.length === 3 && razoes.every((r, i) => Math.abs(r - daTelaP[i]) < 0.02),
     JSON.stringify(razoes));

  const rel2 = execSync('unzip -p /tmp/pm.pptx ppt/slides/_rels/slide2.xml.rels', { encoding: 'utf8' });
  const alvos = [...rel2.matchAll(/Target="\.\.\/media\/([^"]+)"/g)].map(m => m[1]);
  /* Com um rId fixo por slide, três imagens no mesmo slide apontariam todas
     para o mesmo arquivo — o slide sairia com a mesma tela repetida três
     vezes, e nada no tamanho do .pptx denunciaria isso. */
  ok('as três apontam para arquivos DIFERENTES',
     new Set(alvos).size === alvos.length && alvos.length === 3, JSON.stringify(alvos));
}

// ---------------------------------------------------------------------------
console.log('\n[5c] o índice lista passos anotados, e não repete a narração');
{
  /* Item 11 do levantamento: o índice reimprimia a mesma fala que aparece três
     centímetros abaixo, embaixo da imagem. E o PDF tinha uma CÓPIA da conta da
     fala escrita à mão enquanto o Word chamava `falaDoFrame` — duas verdades
     para a mesma pergunta, dentro do mesmo pacote. */
  const linhas = await pg.evaluate(() => window.__indice().map(l => l.n + '|' + l.texto));
  console.log('     ' + JSON.stringify(linhas));
  /* O NÚMERO QUE IMPORTA: dois passos anotados, duas linhas — e não cinco,
     uma por imagem. */
  ok('uma linha por passo anotado, não por imagem', linhas.length === 2,
     String(linhas.length));
  ok('e o texto de cada linha é a anotação do passo',
     linhas[0] === '1|Abrir a ME21N' && linhas[1] === '2|Preencher o cabecalho do pedido',
     JSON.stringify(linhas));

  /* O CASO QUE SEPARA AS DUAS RÉGUAS, e sem ele o bloco acima passaria com o
     defeito ligado: aqui SÓ O PRIMEIRO passo tem anotação. O índice antigo
     listava duas linhas, e a segunda era o começo da narração que já aparece
     embaixo da imagem.

     ---- ESTA AFIRMAÇÃO MUDOU, e vale dizer por quê ----

     Ela dizia "só o anotado entra", e passou muito tempo verde afirmando o
     comportamento errado. O que ela QUERIA garantir está no comentário acima e
     no título do bloco: **o índice não repete a narração**. O que ela cobrava,
     porém, era a implementação que por acaso conseguia isso — DERRUBAR A LINHA
     do passo sem nome.

     As duas coisas se separaram em produção. O quadro automático do começo da
     gravação não é marcado por ninguém e, sem roteiro, não recebe título; os
     passos seguintes, marcados no botão, recebem. Bastava isso para o passo 1
     sumir do índice: quatro passos no documento e três linhas no índice,
     começando no Passo 2, com o corpo do documento mostrando o Passo 1 do
     mesmo jeito. O índice e o documento discordavam sobre quantos passos
     existem — e quem confere uma evidência confere pelo índice.

     A afirmação nova cobra as DUAS coisas, e por isso é mais apertada que a
     antiga: a linha do passo sem nome existe, E o texto dela não é a narração.
     Ver `testes/indice.mjs` para os quatro cenários completos. */
  const misto = await pg.evaluate(() => {
    const q = window.__quadros();
    const guardada = q[3].nota;
    q[3].nota = '';
    const r = window.__indice().map(l => l.n + '|' + l.texto);
    q[3].nota = guardada;
    return r;
  });
  console.log('     com só um passo anotado: ' + JSON.stringify(misto));
  ok('nenhum passo sai do índice por não ter nome', misto.length === 2,
     JSON.stringify(misto));
  ok('o anotado entra com a anotação', misto[0] === '1|Abrir a ME21N',
     JSON.stringify(misto));
  /* O QUE A RÉGUA ANTIGA GUARDAVA, e continua guardado: o passo sem nome entra
     com o travessão, e não com a fala que já está três centímetros abaixo. */
  ok('e o sem nome entra com o travessão, não com a narração repetida',
     misto[1] === '2|—', JSON.stringify(misto));

  /* A OUTRA METADE: sem nenhuma anotação o índice não pode ficar vazio — aí a
     narração é tudo o que há, e ele volta a listar todos os passos. */
  const semNota = await pg.evaluate(() => {
    const q = window.__quadros();
    const guardadas = q.map(f => f.nota);
    q.forEach(f => { f.nota = ''; });
    const r = window.__indice().length;
    q.forEach((f, i) => { f.nota = guardadas[i]; });
    return r;
  });
  ok('sem anotação nenhuma, ele volta a listar os dois passos', semNota === 2,
     String(semNota));
}

// ---------------------------------------------------------------------------
console.log('\n[6] reabrir um documento antigo, sem a bandeira, volta como antes');
{
  /* A compatibilidade não é teórica: todo `.json` já entregue tem quadros
     planos. Aqui a bandeira é apagada do arquivo à mão, que é exatamente como
     um documento de ontem se parece. */
  const j = JSON.parse(fs.readFileSync('/tmp/pm.json', 'utf8'));
  (j.frames || j.quadros || []).forEach(q => { delete q.junto; });
  fs.writeFileSync('/tmp/pm-antigo.json', JSON.stringify(j));
  const p2 = await ctx.newPage();
  const e2 = [];
  p2.on('pageerror', e => e2.push(e.message));
  await p2.goto('http://localhost:8946/app.html?lang=pt');
  await p2.waitForTimeout(400);
  await p2.setInputFiles('#reabrirArq', '/tmp/pm-antigo.json');
  await p2.waitForFunction(() => document.querySelectorAll('#thumbs figure').length >= 5,
                           null, { timeout: 40000 });
  await p2.waitForTimeout(500);
  const l = await p2.locator('#thumbs figcaption .passo').allTextContents();
  console.log('     ' + JSON.stringify(l));
  ok('cinco quadros voltam como cinco passos',
     l.length === 5 && /Passo 5/.test(l[4]), l.join(' | '));
  ok('sem erro de JavaScript', e2.length === 0, e2.join(' | ').slice(0, 200));
  await p2.close();
}

// ---------------------------------------------------------------------------
console.log('\n[7] fixar salva um quadro da limpeza em lote');
{
  /* O RELATO DE USO: "descartar repetidos" levava junto a tela que a pessoa
     queria, e não havia como salvar uma do lote — ela desfazia tudo com
     "manter todos" e recomeçava à mão.

     O vídeo de amostra tem cinco telas diferentes, então "repetidos" não
     descarta nada por conta própria. Para medir a REGRA e não o detector, dois
     quadros recebem a mesma assinatura à mão: um fixado, outro não. */
  await pg.evaluate(() => {
    const q = window.__quadros();
    q.forEach(f => { f.keep = true; });
    q[2].sig = q[1].sig;        // o 3 vira repetido do 2
    q[4].sig = q[3].sig;        // o 5 vira repetido do 4
    q[4].fixo = true;           // …mas este está fixado
  });
  await redesenhar();
  ok('o quadro fixado ganha selo na miniatura',
     (await pg.locator('#thumbs .fixoTag').count()) === 1,
     String(await pg.locator('#thumbs .fixoTag').count()));

  await pg.locator('#dedup').click();
  await pg.waitForTimeout(600);
  const est = await pg.evaluate(() => (window.__quadros() || []).map(f => !!f.keep));
  console.log('     mantidos depois de "descartar repetidos": ' + JSON.stringify(est));
  /* O NÚMERO QUE IMPORTA: o quadro 3, repetido e solto, foi descartado; o 5,
     repetido e fixado, ficou. Se os dois tivessem sobrevivido, o botão teria
     parado de funcionar; se os dois tivessem caído, fixar não faz nada. */
  ok('o repetido solto foi descartado', est[2] === false, JSON.stringify(est));
  ok('mas o repetido FIXADO sobreviveu', est[4] === true, JSON.stringify(est));
}

// ---------------------------------------------------------------------------
console.log('\n[8] cortar só ESTA tela não mexe nas outras');
{
  await pg.evaluate(() => { (window.__quadros() || []).forEach(f => { f.keep = true; }); });
  await redesenhar();
  const antes = await pg.evaluate(() => (window.__quadros() || []).map(f => f.img.w));
  await pg.locator('#thumbs figure .editar').nth(1).click();
  await pg.waitForSelector('#lente:not(.hide)');
  await pg.locator('#cropUma').click();
  await pg.waitForTimeout(250);
  const cx = await pg.locator('#lenteImg').boundingBox();
  await pg.mouse.move(cx.x + cx.width * 0.2, cx.y + cx.height * 0.2);
  await pg.mouse.down();
  await pg.mouse.move(cx.x + cx.width * 0.7, cx.y + cx.height * 0.7, { steps: 12 });
  await pg.mouse.up();
  await pg.waitForTimeout(2500);
  const depois = await pg.evaluate(() => (window.__quadros() || []).map(f => f.img.w));
  console.log('     larguras: ' + JSON.stringify(antes) + ' → ' + JSON.stringify(depois));
  /* Antes o recorte era UM só para todos: consertar um pop-up no canto de uma
     tela destruía as outras 39, e "desfazer o corte" devolvia as 40 juntas. */
  ok('a tela escolhida encolheu', depois[1] < antes[1] * 0.9, antes[1] + ' → ' + depois[1]);
  ok('e as outras continuam inteiras',
     depois[0] === antes[0] && depois[2] === antes[2] && depois[4] === antes[4],
     JSON.stringify(depois));
  await pg.locator('#cropTirar').click();
  await pg.waitForTimeout(2000);
  const volta = await pg.evaluate(() => (window.__quadros() || []).map(f => f.img.w));
  ok('e desfazer devolve a tela cortada ao tamanho original',
     volta[1] === antes[1], antes[1] + ' → ' + volta[1]);
  await pg.locator('#lenteFechar').click().catch(() => {});
  await pg.waitForTimeout(300);
}

// ---------------------------------------------------------------------------
console.log('\n[9] cortar UMA tela não deforma as outras no PDF');
{
  /* O DEFEITO, relatado no uso com um PDF de 13 telas: cortar a primeira
     esticou as outras doze. A proporção era lida de `kept[0]` e aplicada a
     TODAS as imagens do documento — recortar o primeiro quadro fazia o resto
     ser desenhado numa caixa com o formato dele.

     Ele é mais velho que o corte por quadro. Já disparava com "colar uma tela":
     qualquer imagem anexada com outra proporção deformava o documento inteiro.

     COMO SE MEDE ISSO SEM OLHAR O PDF. O jsPDF é falsificado só o suficiente
     para registrar cada `addImage` com a largura e a altura pedidas. O que se
     afirma é a RAZÃO de cada caixa desenhada — que é exatamente o que a pessoa
     vê como "esticado" e que nenhuma inspeção de bytes revelaria. */
  await pg.evaluate(() => { (window.__quadros() || []).forEach(f => { f.keep = true; }); });
  await redesenhar();

  /* A RÉGUA EMBRULHA O CONSTRUTOR, e não o protótipo. Remendar
     `jsPDF.prototype.addImage` não pega nada: o jsPDF instala os métodos de
     desenho na INSTÂNCIA, e o remendo fica num protótipo que ninguém consulta.
     Foi a primeira tentativa aqui, e ela passou com a lista vazia — que é
     exatamente o teste que não testa nada. */
  await pg.evaluate(() => {
    window.__caixas = [];
    const mod = window.jspdf, Orig = mod.jsPDF;
    function Medido(...args){
      const doc = new Orig(...args);
      const antes = doc.addImage.bind(doc);
      doc.addImage = function(dados, tipo, x, y, w, h){
        window.__caixas.push({ w: Math.round(w * 100) / 100, h: Math.round(h * 100) / 100 });
        return antes(dados, tipo, x, y, w, h);
      };
      return doc;
    }
    Medido.prototype = Orig.prototype;
    mod.jsPDF = Medido;
  });

  // corta SÓ a primeira, que é o caso do relato
  await pg.locator('#thumbs figure .editar').first().click();
  await pg.waitForSelector('#lente:not(.hide)');
  await pg.locator('#cropUma').click();
  await pg.waitForTimeout(250);
  const cx = await pg.locator('#lenteImg').boundingBox();
  await pg.mouse.move(cx.x + cx.width * 0.30, cx.y + cx.height * 0.10);
  await pg.mouse.down();
  await pg.mouse.move(cx.x + cx.width * 0.70, cx.y + cx.height * 0.90, { steps: 12 });
  await pg.mouse.up();
  await pg.waitForTimeout(2500);
  await pg.locator('#lenteFechar').click().catch(() => {});
  await pg.waitForTimeout(300);

  const dl = pg.waitForEvent('download', { timeout: 90000 });
  await pg.locator('#go').click();
  await (await dl).saveAs('/tmp/pm-corte.pdf');
  await pg.waitForTimeout(500);

  const razoes = await pg.evaluate(() => (window.__caixas || [])
    .filter(c => c.w > 20)                       // só as telas; a marca é minúscula
    .map(c => Math.round((c.h / c.w) * 1000) / 1000));
  const daTela = await pg.evaluate(() => (window.__quadros() || [])
    .filter(f => f.keep).map(f => Math.round((f.img.h / f.img.w) * 1000) / 1000));
  console.log('     razão de cada quadro : ' + JSON.stringify(daTela));
  console.log('     razão de cada caixa  : ' + JSON.stringify(razoes.slice(0, daTela.length)));

  ok('a primeira ficou com uma razão diferente das outras',
     daTela[0] !== daTela[1], JSON.stringify(daTela));
  /* O NÚMERO QUE IMPORTA: a caixa desenhada tem a razão da SUA imagem. Com o
     defeito, todas as caixas saíam com a razão da primeira. */
  ok('cada imagem foi desenhada com a própria proporção',
     daTela.every((r, i) => razoes[i] != null && Math.abs(razoes[i] - r) < 0.02),
     JSON.stringify(razoes.slice(0, daTela.length)));
  ok('o PDF saiu inteiro',
     fs.existsSync('/tmp/pm-corte.pdf') && fs.statSync('/tmp/pm-corte.pdf').size > 20000,
     (fs.statSync('/tmp/pm-corte.pdf').size / 1024).toFixed(0) + ' KB');
}

ok('sem erro de JavaScript', erros.length === 0, erros.join(' | ').slice(0, 200));

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nPasso com várias telas: tudo passou.');
process.exit(falhas ? 1 : 0);
