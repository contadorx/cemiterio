/* Ler e escrever planilha no servidor.
 *
 * Isto é o mesmo motor que morava na ferramenta, mudado de casa. Na ferramenta
 * ele existia porque a planilha ERA o estado — não havia servidor onde guardar
 * o roteiro. Agora há: o roteiro mora na conta, e a planilha voltou a ser o que
 * ela é de verdade — a porta de entrada e a porta de saída.
 *
 * Continua sem biblioteca. Um `.xlsx` é um zip de XML; o Node tem `zlib` e a
 * gente escreve o resto. Uma dependência de leitura de Excel é superfície de
 * ataque num processo que segura a chave de serviço, e o formato que a gente
 * usa cabe em duzentas linhas.
 *
 * O que este arquivo NÃO faz: guardar o arquivo. A planilha é lida, vira
 * linhas, e o arquivo é descartado. O que fica no banco são os campos do caso.
 */
import 'server-only';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

/* ------------------------------------------------------------------- ler */

const desXml = (s: string | undefined) =>
  String(s == null ? '' : s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&');

/** "AB" -> 27. A coluna vem no atributo `r` da célula, e é por ela que se sabe
 *  onde ela fica: planilha com coluna vazia no meio não escreve a célula, e
 *  contar na ordem alinharia tudo errado a partir dali. */
function colunaDaRef(ref: string): number {
  let n = 0;
  for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Abre o zip pelo DIRETÓRIO CENTRAL. Quem escreve zip em fluxo — e o Excel
 *  escreve — deixa o tamanho fora do cabeçalho local; varrer os cabeçalhos
 *  daria lixo em silêncio. */
function abrirZip(buf: Buffer): Record<string, Buffer> {
  const saida: Record<string, Buffer> = {};
  let fim = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error('zip');
  const quantos = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  for (let k = 0; k < quantos; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(p + 10);
    const comp = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28);
    const el = buf.readUInt16LE(p + 30);
    const cl = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.subarray(p + 46, p + 46 + nl).toString('utf8');
    const lnl = buf.readUInt16LE(local + 26);
    const lel = buf.readUInt16LE(local + 28);
    const ini = local + 30 + lnl + lel;
    const cru = buf.subarray(ini, ini + comp);
    saida[nome] = metodo === 8 ? inflateRawSync(cru) : cru;
    p += 46 + nl + el + cl;
  }
  return saida;
}

export function xlsxParaLinhas(buf: Buffer): string[][] {
  const itens = abrirZip(buf);
  const txt = (n: string) => (itens[n] ? itens[n].toString('utf8') : '');
  const compart = [...txt('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => desXml(x[1])).join(''));
  const nomes = Object.keys(itens).filter((n) => /^xl\/worksheets\/.*\.xml$/.test(n)).sort();
  if (!nomes.length) throw new Error('sem aba');
  const aba = txt(nomes[0]);
  const linhas: string[][] = [];
  for (const lm of aba.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cels: string[] = [];
    for (const cm of lm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1] || '', corpo = cm[2] || '';
      const ref = (attrs.match(/r="([A-Z]+)\d+"/) || [])[1];
      const onde = ref ? colunaDaRef(ref) : cels.length;
      let v = '';
      if (/t="s"/.test(attrs)) v = compart[Number((corpo.match(/<v>(\d+)<\/v>/) || [])[1])] || '';
      else if (/t="inlineStr"/.test(attrs))
        v = [...corpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => desXml(x[1])).join('');
      else v = desXml((corpo.match(/<v>([\s\S]*?)<\/v>/) || ['', ''])[1]);
      while (cels.length < onde) cels.push('');
      cels[onde] = String(v).trim();
    }
    linhas.push(cels);
  }
  return linhas;
}

/** Texto colado do Excel (tabulação) ou CSV (vírgula/ponto e vírgula). O
 *  separador é adivinhado pela primeira linha — ninguém deveria ter que
 *  escolher isso num menu. */
export function textoParaLinhas(txt: string): string[][] {
  const bruto = String(txt || '').replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  const primeira = bruto.split('\n')[0] || '';
  const sep = primeira.includes('\t') ? '\t'
    : (primeira.split(';').length > primeira.split(',').length ? ';' : ',');
  const linhas: string[][] = [];
  for (const l of bruto.split('\n')) {
    if (!l.trim()) continue;
    const cels: string[] = [];
    let atual = '', aspas = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (aspas && l[i + 1] === '"') { atual += '"'; i++; } else aspas = !aspas; }
      else if (ch === sep && !aspas) { cels.push(atual.trim()); atual = ''; }
      else atual += ch;
    }
    cels.push(atual.trim());
    linhas.push(cels);
  }
  return linhas;
}

/* --------------------------------------------------------------- escrever */

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(b: Buffer): number {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Zip com deflate. O Excel abre os dois, mas um `.xlsx` armazenado inteiro de
 *  quarenta casos é dez vezes maior do que precisa ser, e quem recebe por
 *  e-mail é quem paga a diferença. */
function zipar(entradas: Array<{ nome: string; dados: Buffer }>): Buffer {
  const locais: Buffer[] = [], central: Buffer[] = [];
  let desloc = 0;
  for (const e of entradas) {
    const nome = Buffer.from(e.nome, 'utf8');
    const crc = crc32(e.dados);
    const comp = deflateRawSync(e.dados, { level: 6 });
    const usa = comp.length < e.dados.length;
    const corpo = usa ? comp : e.dados;
    const metodo = usa ? 8 : 0;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(metodo, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(corpo.length, 18);
    lh.writeUInt32LE(e.dados.length, 22); lh.writeUInt16LE(nome.length, 26); lh.writeUInt16LE(0, 28);
    locais.push(lh, nome, corpo);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8); ch.writeUInt16LE(metodo, 10); ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(corpo.length, 20);
    ch.writeUInt32LE(e.dados.length, 24); ch.writeUInt16LE(nome.length, 28);
    ch.writeUInt32LE(desloc, 42);
    central.push(ch, nome);

    desloc += 30 + nome.length + corpo.length;
  }
  const dir = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(entradas.length, 8); fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(dir.length, 12); fim.writeUInt32LE(desloc, 16);
  return Buffer.concat([...locais, dir, fim]);
}

const xEsc = (s: unknown) =>
  String(s == null ? '' : s)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const refDaColuna = (n: number) => {
  let s = ''; n++;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - 1 - r) / 26; }
  return s;
};

/** Todo texto vai como `inlineStr`: a tabela de strings compartilhadas economiza
 *  bytes numa planilha de cem mil linhas e custa um índice para manter certo
 *  numa de quarenta. */
export function montarXlsx(linhas: string[][], nomeAba: string): Buffer {
  const corpo = linhas.map((cels, i) =>
    `<row r="${i + 1}">` + cels.map((v, j) =>
      `<c r="${refDaColuna(j)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${xEsc(v)}</t></is></c>`,
    ).join('') + '</row>').join('');
  const arq: Record<string, string> = {
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
    'xl/workbook.xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheets><sheet name="${xEsc((nomeAba || 'Roteiro').slice(0, 28))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '</Relationships>',
    'xl/worksheets/sheet1.xml':
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<sheetData>${corpo}</sheetData></worksheet>`,
  };
  return zipar(Object.entries(arq).map(([nome, txt]) => ({ nome, dados: Buffer.from(txt, 'utf8') })));
}

/* ------------------------------------------------- planilha -> casos ----- */

/* Que coluna é qual. Adivinhar erra às vezes, e por isso a tela mostra o que
   foi adivinhado ANTES de salvar — quem confere é quem sabe. */
const PISTAS: Record<string, RegExp> = {
  caso: /^(caso|id|c[oó]digo|codigo|case|test\s*case|ct|cen[aá]rio)\b/i,
  titulo: /(t[ií]tulo|titulo|title|descri|resumo|summary|nome|passo)/i,
  sistema: /(sistema|system|aplica|app|m[oó]dulo|modulo|produto)/i,
  chamado: /(chamado|ticket|issue|jira|hist[oó]ria|story|requisito|demanda)/i,
  responsavel: /(respons|quem|executor|owner|assignee|testador|tester)/i,
};

export type Mapa = Record<string, number | null>;
/* A aplicação do mapa (pegar a coluna pelo índice) mora na TELA, e não aqui:
   é lá que a pessoa troca o menu e vê a tabela mudar sem esperar o servidor.
   Duas cópias de cinco linhas seria pior do que uma cópia só no lugar certo. */
export type CasoCru = {
  caso: string; titulo?: string; sistema?: string; chamado?: string; responsavel?: string;
};

export function adivinharMapa(cab: string[]): Mapa {
  const achar = (re: RegExp) => {
    const i = cab.findIndex((c) => re.test(String(c || '')));
    return i < 0 ? null : i;
  };
  const m: Mapa = {};
  for (const [k, re] of Object.entries(PISTAS)) m[k] = achar(re);
  if (m.caso == null) m.caso = 0;
  return m;
}

/** Separa cabeçalho de corpo, jogando fora linha em branco. Uma planilha com
 *  menos de duas linhas úteis não é um roteiro — é um cabeçalho solto. */
export function separar(linhas: string[][]): { cab: string[]; corpo: string[][] } | null {
  const uteis = linhas.filter((l) => l.some((c) => String(c || '').trim()));
  if (uteis.length < 2) return null;
  return { cab: uteis[0].map((c) => String(c || '').trim()), corpo: uteis.slice(1) };
}
