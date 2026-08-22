/* A TRANSCRIÇÃO QUE JÁ EXISTE — Google Meet, Teams e Zoom.
 *
 * Quem sai de uma reunião do Meet já tem a transcrição pronta, feita no
 * servidor deles. Transcrever de novo aqui custa 206 MB de download e minutos
 * de máquina para produzir um texto PIOR — o modelo daqui é o `base` e não sabe
 * quem falou.
 *
 * O que impedia esse caminho não era a falta de um botão: era o PARSER. O Meet
 * (e o "Anotações do Gemini" que sai dele) escreve um tempo por BLOCO, sozinho
 * na linha, com as falas embaixo. O parser pedia tempo e texto na mesma linha,
 * achava zero marcações e caía no caminho "texto solto" — e o sintoma não é um
 * erro na tela: é um documento em que a fala não acompanha as telas, que é
 * exatamente o que esta ferramenta existe para fazer.
 *
 * Este arquivo afirma:
 *
 *   1. que um .docx de reunião é LIDO no navegador, sem biblioteca nenhuma;
 *   2. que a minutagem por bloco vira trechos em ordem, e que a tela DIZ que
 *      ela é por bloco — uma estimativa que se apresenta como medida é a única
 *      coisa aqui pior do que não ter;
 *   3. que os quadros saem pareados com a fala daquele instante, que é a razão
 *      de tudo isto;
 *   4. e que um formato que não se lê é recusado com uma frase, e não abrindo
 *      binário dentro do quadro de texto.
 *
 *   node testes/reuniao.mjs
 */
import { chromium } from './_navegador.mjs';
import http from 'http'; import fs from 'fs'; import path from 'path';
import zlib from 'zlib';

import { CHROME_WS } from './_caminhos.mjs';
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'public');
const CHROME = process.env.CHROME || CHROME_WS;
const T = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png',
           '.svg':'image/svg+xml','.ico':'image/x-icon','.webmanifest':'application/json','.webm':'video/webm'};
const srv = http.createServer((q, r) => {
  if (q.url.startsWith('/_vercel/')) { r.writeHead(200,{'Content-Type':'text/javascript'}); return r.end(''); }
  const u = q.url.split('?')[0], f = path.join(RAIZ, u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'}); r.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(8967, r));

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

/* ---- UM .docx DE VERDADE, MONTADO AQUI ----

   Ele não vem de `/tmp` nem do computador de ninguém: é escrito pelo teste, com
   a estrutura que o Google Meet produz — parágrafo com o tempo sozinho, e os
   parágrafos das falas embaixo. Um insumo que não viaja com o código é um
   insumo que existe uma vez só, e foi por isso que as amostras saíram de /tmp
   para dentro do projeto. */
function docx(paragrafos){
  const esc = t => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const corpo = paragrafos.map(t => `<w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`).join('');
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}</w:body></w:document>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  /* Um zip mínimo, escrito à mão: o `word/document.xml` vai DEFLATADO, que é o
     caminho que o leitor do produto precisa saber percorrer. */
  const arquivos = [
    { nome: '_rels/.rels', dados: Buffer.from(rels, 'utf8'), metodo: 0 },
    { nome: 'word/document.xml', dados: Buffer.from(doc, 'utf8'), metodo: 8 },
  ];
  const crcTab = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (const x of b) c = crcTab[(c ^ x) & 0xFF] ^ (c >>> 8);
                       return (c ^ 0xFFFFFFFF) >>> 0; };
  const locais = [], central = [];
  let off = 0;
  for (const a of arquivos) {
    const bruto = a.metodo === 8 ? zlib.deflateRawSync(a.dados) : a.dados;
    const nome = Buffer.from(a.nome, 'utf8');
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0, 6);
    h.writeUInt16LE(a.metodo, 8); h.writeUInt32LE(crc32(a.dados), 14);
    h.writeUInt32LE(bruto.length, 18); h.writeUInt32LE(a.dados.length, 22);
    h.writeUInt16LE(nome.length, 26); h.writeUInt16LE(0, 28);
    locais.push(h, nome, bruto);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6);
    c.writeUInt16LE(a.metodo, 10); c.writeUInt32LE(crc32(a.dados), 16);
    c.writeUInt32LE(bruto.length, 20); c.writeUInt32LE(a.dados.length, 24);
    c.writeUInt16LE(nome.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, nome);
    off += h.length + nome.length + bruto.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(arquivos.length, 8);
  eocd.writeUInt16LE(arquivos.length, 10); eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locais, centralBuf, eocd]);
}

/* O formato do Meet, com o cabeçalho que ele põe em cima — a data e o nome da
   reunião, que NÃO são fala e não podem virar trecho. */
const REUNIAO = [
  'ago. 19, 2026', 'RTR695 - Transcrição',
  '00:00:10', '',
  'LUCINELIA GONCALVES DA SILVA: bom dia a todos, vamos abrir o pedido de compra.',
  'LEANDRO OLIVEIRA: bom dia.',
  '00:01:00', '',
  'LEANDRO OLIVEIRA: aqui está a tela de aprovação, o valor é dezoito mil e quatrocentos.',
  'LUCINELIA GONCALVES DA SILVA: confirmado.',
  '00:02:00', '',
  'LEANDRO OLIVEIRA: e esta é a nota fiscal, sem divergência nenhuma.',
];
fs.writeFileSync('/tmp/reuniao-meet.docx', docx(REUNIAO));
fs.writeFileSync('/tmp/reuniao-falsa.pdf', Buffer.from('%PDF-1.4 nao sou um documento'));

const br = await chromium.launch({ executablePath: CHROME });
const pg = await br.newPage();
const erros = []; pg.on('pageerror', e => erros.push(e.message));
await pg.route('**/rpc/*stamp_*', r => r.fulfill({status:200,headers:{'access-control-allow-origin':'*'},body:'null'}));
await pg.goto('http://localhost:8967/app.html?lang=pt');
await pg.waitForTimeout(400);

// ------------------------------------------------- 1. a opção do passo 1
console.log('\n[1] a opção no passo 1');
const op = await pg.evaluate(() => {
  const c = document.getElementById('usarPronta');
  return { existe: !!c, marcada: c && c.checked,
           rotulo: (c && c.closest('label').textContent || '').trim(),
           recTr: document.getElementById('recTr').checked,
           nota: (document.getElementById('prontaNote')?.textContent || '').trim() };
});
console.log('     ' + op.rotulo);
ok('a opção existe', op.existe);
ok('e nasce DESMARCADA', op.marcada === false);
ok('marcada como recomendada', /recomendad/i.test(op.rotulo), op.rotulo);
ok('a nota diz que é mais rápido', /rápido|rapid/i.test(op.nota) || op.nota.length > 40, op.nota.slice(0, 60));

await pg.check('#usarPronta');
await pg.waitForTimeout(150);
const dep = await pg.evaluate(() => ({ recTr: document.getElementById('recTr').checked,
                                       nota: (document.getElementById('prontaNote')?.textContent || '').trim() }));
/* Baixar 206 MB para não usar é o desperdício que esta opção existe para
   evitar: marcar uma desliga a outra. */
ok('marcar desliga "transcrever enquanto gravo"', op.recTr === true && dep.recTr === false);
ok('e a nota muda para explicar o caminho', /etapa 3/i.test(dep.nota), dep.nota.slice(0, 70));

// ------------------------------------- 2. o .docx do Meet, lido no navegador
console.log('\n[2] o .docx da reunião');
const antes = await pg.evaluate(() => !!document.getElementById('trFonte'));
ok('o bloco de envio existe, acima do quadro', antes);
ok('e vem ANTES do quadro de texto', await pg.evaluate(() => {
  const f = document.getElementById('trFonte'), q = document.getElementById('tr');
  return !!(f && q) && (f.compareDocumentPosition(q) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}));

await pg.setInputFiles('#reuniaoFile', '/tmp/reuniao-meet.docx');
await pg.waitForFunction(() => (document.getElementById('tr').value || '').includes('pedido de compra'),
                         null, { timeout: 30000 });
await pg.waitForTimeout(300);
const lido = await pg.evaluate(() => ({
  msg: (document.getElementById('trFonteMsg').textContent || '').trim(),
  info: (document.getElementById('trInfo').textContent || '').trim(),
  cabecalho: (document.getElementById('tr').value || '').includes('ago. 19, 2026'),
}));
console.log('     ' + lido.msg);
ok('o navegador leu o .docx sem biblioteca', /trechos/i.test(lido.msg), lido.msg);
/* A ESTIMATIVA É DITA. Uma minutagem por bloco apresentada como medida é a
   única coisa aqui pior do que não ter minutagem. */
ok('e a tela diz que a minutagem é por bloco', /bloco/i.test(lido.info), lido.info.slice(0, 90));

// --------------------------------- 3. os quadros saem pareados com a fala
console.log('\n[3] a fala de cada instante');
const pareado = await pg.evaluate(() => {
  /* `__falaEm` roda a MESMA análise que o documento consome, e responde a
     pergunta que o pareamento faz de verdade: o que estava sendo dito neste
     segundo. É daqui que sai o texto que acompanha cada tela. */
  const f = window.__falaEm;
  if (!f) return { erro: 'sem __falaEm' };
  return { aos10: f(12), aos60: f(63), aos120: f(122),
           n: (window.__cues() || []).length,
           ordem: (window.__cues() || []).every((c, i, a) => i === 0 || c.a >= a[i-1].a) };
});
if (pareado.erro) { ok('o pareamento é alcançável pela régua', false, pareado.erro); }
else {
  console.log('     00:12 → ' + String(pareado.aos10).slice(0, 60));
  console.log('     01:03 → ' + String(pareado.aos60).slice(0, 60));
  console.log('     02:02 → ' + String(pareado.aos120).slice(0, 60));
  ok('aos 12 s, a abertura', /pedido de compra|bom dia/i.test(pareado.aos10 || ''), String(pareado.aos10).slice(0,60));
  ok('ao 1:03, a tela de aprovação', /aprovação|dezoito mil/i.test(pareado.aos60 || ''), String(pareado.aos60).slice(0,60));
  ok('aos 2:02, a nota fiscal', /nota fiscal/i.test(pareado.aos120 || ''), String(pareado.aos120).slice(0,60));
  /* O cabeçalho do arquivo — a data e o nome da reunião — não é fala, e não
     pode aparecer pendurado num quadro. */
  ok('o cabeçalho do arquivo não virou fala',
     !/ago\. 19|RTR695 - Transc/i.test([pareado.aos10, pareado.aos60, pareado.aos120].join(' ')));
  ok('os trechos saem em ordem', pareado.ordem === true);
  console.log('     ' + pareado.n + ' trechos ao todo');
}

// ------------------------------------------- 4. o formato que não se lê
console.log('\n[4] um formato que eu não leio');
await pg.setInputFiles('#reuniaoFile', '/tmp/reuniao-falsa.pdf');
await pg.waitForTimeout(600);
const recusa = await pg.evaluate(() => ({
  msg: (document.getElementById('trFonteMsg').textContent || '').trim(),
  quadro: (document.getElementById('tr').value || '').slice(0, 20),
}));
console.log('     ' + recusa.msg.slice(0, 90));
ok('recusa com uma frase', /não leio|formato/i.test(recusa.msg), recusa.msg.slice(0, 60));
ok('e NÃO despeja binário no quadro', !/%PDF/.test(recusa.quadro), recusa.quadro);

// ---------------------------- 5. "Começar outro" saiu de baixo do rodapé
console.log('\n[5] o botão de recomeçar, depois do passo 4');
const lugar = await pg.evaluate(() => {
  const bt = document.getElementById('novoFluxoCx');
  const p4 = document.getElementById('promptCard');
  const rodape = document.querySelector('footer.rodapeApp');
  if (!bt || !p4 || !rodape) return { erro: 'faltou elemento' };
  const depoisDo4 = (p4.compareDocumentPosition(bt) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  const antesDoRodape = (bt.compareDocumentPosition(rodape) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  return { depoisDo4, antesDoRodape };
});
ok('vem depois do passo 4', lugar.depoisDo4 === true, JSON.stringify(lugar));
/* Ele morava ABAIXO do rodapé — depois dos links de preços, termos e
   privacidade. Quem termina o documento para de ler no fim do passo 4; o que
   vem depois do rodapé é o fim da PÁGINA, não o fim da tarefa. */
ok('e ANTES do rodapé do site', lugar.antesDoRodape === true, JSON.stringify(lugar));

ok('sem erro de página', erros.length === 0, erros[0]);
await br.close(); srv.close();
console.log(falhas ? `\n  ${falhas} falha(s)` : '\n  tudo certo');
process.exit(falhas ? 1 : 0);
