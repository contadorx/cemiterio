import { inflateSync } from "node:zlib";

/**
 * TEXTO DE UM PDF, SEM DEPENDÊNCIA NOVA.
 *
 * ============================================================================
 * POR QUE NÃO UMA BIBLIOTECA
 * ============================================================================
 *
 * O projeto tem dez dependências e isso é uma escolha, não um descuido: a
 * 0132 leu OFX, CSV, XLSX e HTML sem nenhuma, e o PDF foi o único que sobrou —
 * empurrado para a IA por não ter leitor. Depois de 03/11, quando um laço de
 * IA custou R$ 348 numa noite, trocar um modelo de linguagem por 150 linhas de
 * `zlib` que o Node já traz é o lado certo da conta.
 *
 * E há uma razão melhor que o preço: o resultado é CONFERÍVEL. O extrato traz
 * a coluna de saldo, e `conferir()` refaz a soma do primeiro ao último
 * lançamento. Uma linha lida errado é acusada. A IA não dá essa prova.
 *
 * ============================================================================
 * O QUE ESTA FUNÇÃO FAZ, E O QUE ELA NÃO FAZ
 * ============================================================================
 *
 * FAZ: PDF de texto — o que o banco, o cartório e a prefeitura emitem. Acha os
 * fluxos de conteúdo, descomprime com Flate, lê os operadores de texto e
 * remonta as LINHAS pela coordenada Y e as COLUNAS pela coordenada X.
 *
 * A coordenada X não é enfeite. No extrato do Bradesco, crédito e débito são
 * a mesma coluna de números, sem sinal e sem palavra: o que separa os dois é
 * o recuo. Um extrator que devolvesse só as palavras na ordem entregaria um
 * mês inteiro com os débitos somando a favor da casa.
 *
 * NÃO FAZ: PDF escaneado (imagem), que não tem texto nenhum para extrair, e
 * fluxos com filtros que não sejam Flate. Nos dois casos devolve string vazia
 * — e quem chama cai no plano B, que continua sendo a IA.
 */

/** Altura (em pontos) abaixo da qual dois trechos são a MESMA linha. */
const MESMA_LINHA = 3;
/** Espaços por ponto de distância horizontal, para remontar as colunas. */
const PONTOS_POR_ESPACO = 4.8;

interface Trecho { x: number; y: number; t: string }

/** Desfaz os escapes de uma string literal de PDF: \( \) \\ \n \t \ooo */
function lerLiteral(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "\\") { out += c; continue; }
    const n = s[++i];
    if (n === undefined) break;
    if (n === "n") { out += "\n"; continue; }
    if (n === "r") { out += "\r"; continue; }
    if (n === "t") { out += "\t"; continue; }
    if (n >= "0" && n <= "7") {
      let oct = n;
      while (oct.length < 3 && s[i + 1] >= "0" && s[i + 1] <= "7") oct += s[++i];
      out += String.fromCharCode(parseInt(oct, 8));
      continue;
    }
    out += n;                       // \( \) \\ e qualquer outro: o próprio
  }
  return out;
}

function lerHex(s: string): string {
  const limpo = s.replace(/[^0-9a-fA-F]/g, "");
  let out = "";
  for (let i = 0; i + 1 < limpo.length; i += 2) {
    out += String.fromCharCode(parseInt(limpo.slice(i, i + 2), 16));
  }
  return out;
}

/** Os fluxos de conteúdo, já descomprimidos. */
function fluxos(bytes: Buffer): string[] {
  const saida: string[] = [];
  const marca = Buffer.from("stream");
  let i = 0;
  while (true) {
    const ini = bytes.indexOf(marca, i);
    if (ini < 0) break;
    // "endstream" TERMINA em "stream". Sem esta linha, a busca casa com o
    // fechamento do fluxo anterior e passa a ler lixo do meio do arquivo —
    // dos 20 fluxos deste extrato, 19 falhavam com "incorrect header check".
    if (ini >= 3 && bytes.subarray(ini - 3, ini).toString("latin1") === "end") {
      i = ini + marca.length;
      continue;
    }
    let p = ini + marca.length;
    if (bytes[p] === 0x0d) p++;
    if (bytes[p] === 0x0a) p++;
    const fim = bytes.indexOf(Buffer.from("endstream"), p);
    if (fim < 0) break;
    const cru = bytes.subarray(p, fim);
    i = fim + 1;
    try {
      saida.push(inflateSync(cru).toString("latin1"));
    } catch {
      // Fluxo que não é Flate (imagem, fonte, filtro exótico). Não é erro:
      // a maioria dos fluxos de um PDF não é texto. Segue para o próximo.
    }
  }
  return saida;
}

/** Lê os operadores de texto de um fluxo e devolve os trechos posicionados. */
function trechosDoFluxo(conteudo: string): Trecho[] {
  const out: Trecho[] = [];
  // estado do texto: a matriz corrente e a da linha
  let x = 0, y = 0, lx = 0, ly = 0;

  // operadores que interessam, na ordem em que aparecem
  const RE = /(?:BT|ET)|(-?[\d.]+)\s+(-?[\d.]+)\s+(Td|TD)|(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+Tm|T\*|\[((?:[^\[\]\\]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*Tj|<([0-9a-fA-F\s]*)>\s*Tj/g;

  let m: RegExpExecArray | null;
  while ((m = RE.exec(conteudo)) !== null) {
    const todo = m[0];
    if (todo === "BT") { x = y = lx = ly = 0; continue; }
    if (todo === "ET") continue;
    if (m[3]) {                                   // Td / TD
      lx += Number(m[1]); ly += Number(m[2]);
      x = lx; y = ly; continue;
    }
    if (todo.endsWith("Tm")) {                    // Tm: e, f são a posição
      lx = Number(m[8]); ly = Number(m[9]);
      x = lx; y = ly; continue;
    }
    if (todo === "T*") { ly -= 12; x = lx; y = ly; continue; }

    let texto: string | null = null;
    if (m[10] !== undefined) {
      // TJ: array de strings e deslocamentos. Um deslocamento grande e
      // negativo é um espaço que a fonte não escreveu — ignorá-lo colaria
      // "PIXRECEBIDO" e, pior, colaria número com número.
      texto = "";
      const ARR = /\(((?:[^()\\]|\\.)*)\)|<([0-9a-fA-F\s]*)>|(-?[\d.]+)/g;
      let a: RegExpExecArray | null;
      while ((a = ARR.exec(m[10])) !== null) {
        if (a[1] !== undefined) texto += lerLiteral(a[1]);
        else if (a[2] !== undefined) texto += lerHex(a[2]);
        else if (Number(a[3]) < -120) texto += " ";
      }
    } else if (m[11] !== undefined) {
      texto = lerLiteral(m[11]);
    } else if (m[12] !== undefined) {
      texto = lerHex(m[12]);
    }
    if (texto) out.push({ x, y, t: texto });
  }
  return out;
}

/**
 * Remonta o texto preservando a POSIÇÃO — o equivalente ao `-layout` do
 * pdftotext, que é o que torna a coluna do crédito distinguível da do débito.
 */
function remontar(trechos: Trecho[]): string {
  if (!trechos.length) return "";

  // agrupa por linha: mesmo Y (com folga), de cima para baixo
  const linhas: Trecho[][] = [];
  for (const tr of [...trechos].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const ultima = linhas[linhas.length - 1];
    if (ultima && Math.abs(ultima[0].y - tr.y) <= MESMA_LINHA) ultima.push(tr);
    else linhas.push([tr]);
  }

  return linhas.map((linha) => {
    linha.sort((a, b) => a.x - b.x);
    let texto = "";
    for (const tr of linha) {
      const col = Math.round(tr.x / PONTOS_POR_ESPACO);
      if (col > texto.length) texto += " ".repeat(col - texto.length);
      texto += tr.t;
    }
    return texto.replace(/\s+$/, "");
  }).join("\n");
}

/**
 * O texto do PDF, com a posição preservada. String vazia quando não há texto
 * extraível — e isso NÃO é erro: PDF escaneado é imagem, e quem chama precisa
 * poder dizer "este arquivo é uma foto, me mande o OFX" em vez de importar
 * um extrato vazio como se fosse um mês sem movimento.
 */
export function textoDoPdf(bytes: Buffer): string {
  // UMA PÁGINA DE CADA VEZ, e isto não é otimização: cada página tem o SEU
  // sistema de coordenadas, começando do zero. Juntar os trechos de todas
  // antes de agrupar por Y faz a terceira linha da página 1 cair em cima da
  // terceira linha da página 2 — e o extrato de outubro virou 89 linhas com
  // dezessete datas grudadas em cada uma.
  const paginas: string[] = [];
  for (const f of fluxos(bytes)) {
    const t = trechosDoFluxo(f);
    if (t.length) paginas.push(remontar(t));
  }
  return paginas.filter(Boolean).join("\n");
}
