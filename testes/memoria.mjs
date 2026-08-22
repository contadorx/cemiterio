/* O QUADRO EM MEMÓRIA — Blob no lugar de base64, e o que isso não pode quebrar.
 *
 * Um quadro era uma string `data:image/jpeg;base64,...` morando no heap
 * JavaScript. Três custos ao mesmo tempo: base64 infla o binário em 33%, o
 * texto mora exatamente onde o navegador aperta primeiro, e JPEG é o dobro de
 * WebP na mesma qualidade. Medido nesta máquina, sobre uma captura de tela de
 * verdade a 900 px: JPEG q0,85 = 40,8 KB (PSNR 38,95) contra WebP q0,85 =
 * 22,5 KB (PSNR 40,11) — menor E mais fiel.
 *
 * Agora ele é um Blob, e o Blob mora fora do heap.
 *
 * Este arquivo existe porque a troca tem três jeitos de dar errado em silêncio,
 * e nenhum deles aparece na tela de quem escreveu o código:
 *
 *   1. O ARQUIVO. Word e PowerPoint anteriores a 2021 não leem WebP, e o
 *      público desta ferramenta é quem trabalha em estação travada por política
 *      — que é onde o Office velho vive. O `.json` precisa continuar reabrível
 *      pelas versões de ontem. E o SHA-256 impresso no anexo só prova alguma
 *      coisa se descrever a imagem que foi para dentro do documento: se quem
 *      converte for o jsPDF (ele converte, medido) em vez de nós, o hash passa a
 *      falar de um arquivo que ninguém recebeu. Então tudo que vira arquivo sai
 *      em JPEG, e isto verifica byte a byte.
 *
 *   2. O VAZAMENTO. Blob sem `revokeObjectURL` é memória que não volta — o
 *      mesmo defeito que a proposta que originou esta mudança dizia estar
 *      consertando. Aqui se conta: gravar duas vezes não pode dobrar a conta.
 *
 *   3. A QUEDA. WebP não é universal. Com o codificador ausente, tudo tem que
 *      continuar — e este teste desliga o WebP de propósito para ver.
 *
 * E, no fim, `file://`: a ferramenta é vendida como um arquivo que abre sem
 * servidor, e uma URL de blob é o tipo de coisa que morre lá primeiro.
 */
import { chromium } from './_navegador.mjs';
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
await new Promise(r => srv.listen(8936, r));

let falhas = 0;
const ok = (n, c, e) => {
  console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : ''));
  if (!c) falhas++;
};

const br = await chromium.launch({
  executablePath: CHROME_WS,
});

/* Um JPEG começa com FF D8 FF, sempre. É a única pergunta que importa nos
   arquivos: não "que extensão tem", e sim "que bytes tem lá dentro". */
const ehJpeg = u8 => u8.length > 3 && u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF;
const ehWebp = u8 => u8.length > 12 &&
  String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) === 'RIFF' &&
  String.fromCharCode(u8[8], u8[9], u8[10], u8[11]) === 'WEBP';

async function abrir(semWebp){
  const ctx = await br.newContext({ acceptDownloads: true,
                                    viewport: { width: 1250, height: 980 } });
  if (semWebp) {
    /* Desligar o WebP ANTES do script da ferramenta rodar: a escolha do formato
       é feita uma vez, na partida, e trocá-la depois não seria a mesma
       experiência de quem simplesmente não tem o codificador. */
    await ctx.addInitScript(() => {
      const dataUrl = HTMLCanvasElement.prototype.toDataURL;
      const toBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toDataURL = function (tipo, q) {
        return dataUrl.call(this, tipo === 'image/webp' ? 'image/png' : tipo, q);
      };
      HTMLCanvasElement.prototype.toBlob = function (cb, tipo, q) {
        return toBlob.call(this, cb, tipo === 'image/webp' ? 'image/png' : tipo, q);
      };
    });
  }
  const pg = await ctx.newPage();
  const erros = [];
  pg.on('pageerror', e => erros.push(e.message));
  await pg.route('**/jspdf**', r => r.fulfill(
    { status: 200, headers: { 'content-type': 'text/javascript' }, body: jspdf }));
  await pg.goto('http://localhost:8936/app.html?lang=pt');
  await pg.selectOption('#modelo', 'evidencia').catch(() => {});
  await pg.waitForTimeout(300);
  return { ctx, pg, erros };
}

async function extrair(pg, quantos){
  await pg.setInputFiles('#file', '/tmp/amostra.webm');
  await pg.waitForTimeout(2500);
  await pg.selectOption('#mode', 'count');
  await pg.fill('#count', String(quantos));
  await pg.locator('#extract').click();
  await pg.waitForFunction(n => document.querySelectorAll('#thumbs figure').length >= n,
                           quantos, { timeout: 60000 });
  await pg.waitForTimeout(500);
}

const pesar = pg => pg.evaluate(() => {
  const q = window.__quadros();
  return q.map(f => ({
    tipo: f.img.tipo,
    ehBlob: !!f.img.blob,
    urlBlob: (f.img.url || '').startsWith('blob:'),
    bytes: f.img.blob ? f.img.blob.size : (f.img.url || '').length * 0.75,
    pintou: (() => {
      const im = document.querySelectorAll('#thumbs figure img');
      return [...im].every(x => x.naturalWidth > 0);
    })()
  }));
});

// ---------------------------------------------------------------------------
console.log('[1] o quadro guardado é binário, e fora do heap');
const { ctx, pg, erros } = await abrir(false);
await extrair(pg, 4);
{
  const q = await pesar(pg);
  ok('quatro quadros', q.length === 4, String(q.length));
  ok('todos são Blob', q.every(x => x.ehBlob), JSON.stringify(q.map(x => x.ehBlob)));
  ok('e a tela os recebe por uma URL de blob',
     q.every(x => x.urlBlob), JSON.stringify(q.map(x => x.urlBlob)));
  ok('as miniaturas carregaram de verdade (naturalWidth > 0)', q[0].pintou);

  /* O ganho, medido aqui e não afirmado em comentário: o mesmo quadro, no
     formato que ia para o heap antes (base64 de JPEG), contra o que está
     guardado agora. */
  const comp = await pg.evaluate(async () => {
    const f = window.__quadros()[0];
    const el = await new Promise((r, e) => {
      const i = new Image(); i.onload = () => r(i); i.onerror = e; i.src = f.img.url;
    });
    const c = document.createElement('canvas');
    c.width = f.img.w; c.height = f.img.h;
    c.getContext('2d').drawImage(el, 0, 0);
    return { agora: f.img.blob.size, tipo: f.img.tipo,
             comoEraNoHeap: c.toDataURL('image/jpeg', f.img.q).length };
  });
  console.log('     guardado ' + (comp.agora / 1024).toFixed(1) + ' KB (' + comp.tipo +
              ')  contra ' + (comp.comoEraNoHeap / 1024).toFixed(1) + ' KB de base64 no heap');
  ok('o quadro guardado é menor do que a base64 que ele substituiu',
     comp.agora < comp.comoEraNoHeap * 0.9,
     comp.agora + ' vs ' + comp.comoEraNoHeap);
}

// ---------------------------------------------------------------------------
console.log('\n[2] tudo que vira ARQUIVO continua saindo em JPEG');
{
  const baixar = async (botao, destino) => {
    const dl = pg.waitForEvent('download', { timeout: 60000 });
    await pg.locator(botao).click();
    await (await dl).saveAs(destino);
  };

  /* A impressão digital ligada: é ela que amarra o resto. */
  await pg.check('#evHash');
  await pg.waitForTimeout(200);

  await baixar('#json', '/tmp/mem.json');
  const j = JSON.parse(fs.readFileSync('/tmp/mem.json', 'utf8'));
  ok('o .json embute JPEG, como sempre embutiu',
     j.frames.every(f => /^data:image\/jpeg;base64,/.test(f.imagemBase64)),
     (j.frames[0].imagemBase64 || '').slice(0, 24));

  await baixar('#html', '/tmp/mem.html');
  const h = fs.readFileSync('/tmp/mem.html', 'utf8');
  ok('o .html embute JPEG', (h.match(/src="data:image\/jpeg/g) || []).length === 4,
     String((h.match(/src="data:image\/(\w+)/g) || []).slice(0, 2)));

  await baixar('#zip', '/tmp/mem.zip');
  const nomes = execSync('unzip -Z1 /tmp/mem.zip', { encoding: 'utf8' })
    .split('\n').filter(n => /\.jpg$/i.test(n));
  ok('o .zip traz quatro .jpg', nomes.length === 4, nomes.join(' '));
  const bytesZip = nomes.map(n => new Uint8Array(
    execSync(`unzip -p /tmp/mem.zip "${n}"`, { maxBuffer: 1 << 28 })));
  ok('e todos são JPEG de verdade por dentro, não WebP com nome de JPEG',
     bytesZip.every(ehJpeg) && !bytesZip.some(ehWebp),
     bytesZip.map(b => [...b.slice(0, 4)].map(x => x.toString(16)).join(' ')).join(' | '));

  await baixar('#docx', '/tmp/mem.docx');
  const midiaDocx = execSync('unzip -Z1 /tmp/mem.docx', { encoding: 'utf8' })
    .split('\n').filter(n => /^word\/media\/.*\.(jpg|jpeg)$/i.test(n));
  const bDocx = midiaDocx.map(n => new Uint8Array(
    execSync(`unzip -p /tmp/mem.docx "${n}"`, { maxBuffer: 1 << 28 })));
  ok('o .docx leva imagens JPEG', bDocx.length >= 4 && bDocx.every(ehJpeg),
     midiaDocx.join(' '));

  await baixar('#pptx', '/tmp/mem.pptx');
  const midiaPptx = execSync('unzip -Z1 /tmp/mem.pptx', { encoding: 'utf8' })
    .split('\n').filter(n => /^ppt\/media\/.*\.(jpg|jpeg)$/i.test(n));
  const bPptx = midiaPptx.map(n => new Uint8Array(
    execSync(`unzip -p /tmp/mem.pptx "${n}"`, { maxBuffer: 1 << 28 })));
  ok('o .pptx leva imagens JPEG', bPptx.length >= 4 && bPptx.every(ehJpeg),
     midiaPptx.join(' '));

  /* O PDF é o que quase deu errado sem avisar. O jsPDF ACEITA um WebP e escreve
     `/Filter /DCTDecode` — a etiqueta de JPEG — em cima de bytes WebP. Nenhum
     erro, nenhum aviso, e um documento que não abre a imagem. A pergunta certa
     não é "o PDF saiu?" e sim "o que está dentro do fluxo marcado como JPEG?". */
  await baixar('#go', '/tmp/mem.pdf');
  const pdf = fs.readFileSync('/tmp/mem.pdf');
  const cru = pdf.toString('latin1');
  ok('o PDF marca as imagens como DCTDecode (JPEG)', /\/DCTDecode/.test(cru));
  {
    let achouJpeg = 0, achouOutro = 0;
    const re = /\/DCTDecode[\s\S]{0,400}?stream\r?\n/g;
    let m;
    while ((m = re.exec(cru))) {
      const ini = m.index + m[0].length;
      if (pdf[ini] === 0xFF && pdf[ini+1] === 0xD8 && pdf[ini+2] === 0xFF) achouJpeg++;
      else achouOutro++;
    }
    ok('e o que está lá dentro É JPEG — não WebP com etiqueta de JPEG',
       achouJpeg >= 1 && achouOutro === 0,
       'jpeg=' + achouJpeg + ' outro=' + achouOutro);
  }
  /* A AMARRA. O SHA-256 que o documento imprime tem que ser o da imagem que o
     documento carrega — em TODAS as saídas, e não em cada uma por si. Se o
     `.json` e o `.zip` levassem bytes diferentes do mesmo passo, um dos dois
     hashes provaria um arquivo que ninguém recebeu; e é exatamente isso que
     aconteceria se cada saída transcodificasse por conta própria, ou se a
     conversão ficasse por conta do gerador de PDF. */
  {
    const crypto = await import('crypto');
    const sha = u8 => crypto.createHash('sha256').update(u8).digest('hex');
    const doJson = j.frames.map(f => f.sha256);
    ok('o .json traz a impressão digital de cada quadro',
       doJson.length === 4 && doJson.every(h => /^[0-9a-f]{64}$/.test(h || '')),
       JSON.stringify(doJson.map(h => (h || '').slice(0, 8))));
    const doJsonCalculado = j.frames.map(f =>
      sha(Buffer.from(f.imagemBase64.slice(f.imagemBase64.indexOf(',') + 1), 'base64')));
    ok('e ela descreve a imagem que está dentro do próprio .json',
       JSON.stringify(doJson) === JSON.stringify(doJsonCalculado),
       doJson[0] + ' vs ' + doJsonCalculado[0]);
    const doZip = bytesZip.map(b => sha(Buffer.from(b)));
    ok('e a MESMA imagem está dentro do .zip, byte a byte',
       JSON.stringify(doJson) === JSON.stringify(doZip),
       doJson[0] + ' vs ' + doZip[0]);
    const doDocx = bDocx.slice(0, 4).map(b => sha(Buffer.from(b)));
    ok('e dentro do .docx também',
       JSON.stringify(doJson) === JSON.stringify(doDocx),
       doJson[0] + ' vs ' + doDocx[0]);
  }

  ok('sem erro de JavaScript nas saídas', erros.length === 0, erros.join(' | ').slice(0, 200));
}

// ---------------------------------------------------------------------------
console.log('\n[3] reabrir um .json — inclusive um gravado pela versão anterior');
{
  /* O `.json` sempre guardou base64 de JPEG e continua guardando: é essa a
     razão de o arquivo de hoje poder ser reaberto amanhã e o de ontem hoje. O
     que muda é o que acontece com ele DEPOIS de entrar — vira Blob. */
  await pg.setInputFiles('#reabrirArq', '/tmp/mem.json');
  await pg.waitForFunction(() => document.querySelectorAll('#thumbs figure').length === 4,
                           null, { timeout: 30000 });
  await pg.waitForTimeout(600);
  const q = await pesar(pg);
  ok('os quatro quadros voltaram', q.length === 4, String(q.length));
  ok('e voltaram como Blob, não como as strings que estavam no arquivo',
     q.every(x => x.ehBlob && x.urlBlob));
  ok('as miniaturas do documento reaberto carregaram', q[0].pintou);
}

// ---------------------------------------------------------------------------
console.log('\n[4] gravar de novo não dobra a conta de blobs');
{
  /* O vazamento que a proposta dizia estar consertando é ESTE: cada extração
     cria imagens novas e as antigas não voltam para o navegador. Contar é o
     único jeito de saber — memória que vaza não aparece na tela. */
  const antes = await pg.evaluate(() => window.__vivas);
  await extrair(pg, 4);
  const depois = await pg.evaluate(() => window.__vivas);
  console.log('     blobs vivos: ' + antes + ' antes, ' + depois + ' depois de extrair de novo');
  ok('as imagens da extração anterior foram soltas',
     depois <= antes, antes + ' → ' + depois);
  ok('e as de agora continuam vivas — soltar demais seria pior', depois >= 4, String(depois));

  /* Trocar a imagem de um passo: a antiga não tem para onde voltar. */
  await pg.locator('#thumbs figure').first().locator('.editar').click();
  await pg.waitForSelector('#lente:not(.hide)');
  await pg.setInputFiles('#trocarArq', RAIZ + '/public/apple-touch-icon.png');
  await pg.waitForTimeout(900);
  await pg.locator('#lenteFechar').click();
  await pg.waitForTimeout(300);
  const trocado = await pg.evaluate(() => window.__vivas);
  ok('trocar a imagem de um passo não deixa a antiga para trás',
     trocado <= depois, depois + ' → ' + trocado);
  const aindaPinta = await pg.evaluate(() =>
    [...document.querySelectorAll('#thumbs figure img')].every(x => x.naturalWidth > 0));
  ok('e as miniaturas continuam desenhando — soltar a imagem errada apagaria a grade',
     aindaPinta);
}
await ctx.close();

// ---------------------------------------------------------------------------
console.log('\n[5] sem WebP no navegador, tudo continua');
{
  const a = await abrir(true);
  await extrair(a.pg, 3);
  const q = await pesar(a.pg);
  ok('os quadros continuam sendo Blob', q.every(x => x.ehBlob && x.urlBlob));
  ok('e o formato caiu para o de sempre, sem WebP nenhum',
     q.every(x => x.tipo !== 'image/webp'), JSON.stringify(q.map(x => x.tipo)));
  ok('as miniaturas carregaram', q[0].pintou);

  const dl = a.pg.waitForEvent('download', { timeout: 60000 });
  await a.pg.locator('#json').click();
  await (await dl).saveAs('/tmp/mem-semwebp.json');
  const j = JSON.parse(fs.readFileSync('/tmp/mem-semwebp.json', 'utf8'));
  ok('e o documento sai igual — JPEG embutido',
     j.frames.length === 3 && j.frames.every(f => /^data:image\/jpeg;base64,/.test(f.imagemBase64)));
  ok('sem erro de JavaScript', a.erros.length === 0, a.erros.join(' | ').slice(0, 200));
  await a.ctx.close();
}

// ---------------------------------------------------------------------------
console.log('\n[6] de file://, que é como o pacote offline é usado');
{
  /* A ferramenta é vendida como um arquivo que abre sem servidor. Uma URL de
     blob é exatamente o tipo de coisa que morre lá primeiro — e morreria em
     silêncio, com a grade vazia e nenhum erro no console. */
  const ctx2 = await br.newContext({ acceptDownloads: true,
                                     viewport: { width: 1250, height: 980 } });
  const p2 = await ctx2.newPage();
  const e2 = [];
  p2.on('pageerror', e => e2.push(e.message));
  await p2.goto('file://' + RAIZ + '/public/app.html?lang=pt');
  await p2.selectOption('#modelo', 'evidencia').catch(() => {});
  await p2.waitForTimeout(300);
  await extrair(p2, 3);
  const q = await pesar(p2);
  ok('os quadros existem e são Blob', q.length === 3 && q.every(x => x.ehBlob));
  ok('e a grade desenhou de file://', q[0].pintou,
     JSON.stringify(q.map(x => x.urlBlob)));

  const dl = p2.waitForEvent('download', { timeout: 60000 });
  await p2.locator('#json').click();
  await (await dl).saveAs('/tmp/mem-file.json');
  const j = JSON.parse(fs.readFileSync('/tmp/mem-file.json', 'utf8'));
  ok('e o documento sai de file:// com JPEG dentro',
     j.frames.length === 3 && j.frames.every(f => /^data:image\/jpeg;base64,/.test(f.imagemBase64)));
  /* E A CAIXA DO ESPELHO NÃO APARECE AQUI.
     De `file://` a origem é opaca: `navigator.storage.getDirectory` EXISTE e
     recusa ("certain files are unsafe for access within a Web application").
     Uma caixa marcada dizendo "guardo as suas telas no seu computador" num lugar
     onde nada é guardado seria a pior das promessas sem código atrás — a pessoa
     gravaria duas horas confiando nela. Por isso a pergunta é feita ao disco, e
     não à existência da API. */
  ok('a caixa do espelho no disco não aparece de file:// — lá o OPFS recusa',
     await p2.locator('#recEspelhoCx').isHidden());
  ok('sem erro de JavaScript de file://', e2.length === 0, e2.join(' | ').slice(0, 200));
  await ctx2.close();
}

await br.close(); srv.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nMemória do quadro: tudo passou.');
process.exit(falhas ? 1 : 0);
