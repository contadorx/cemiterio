import { inflateRawSync } from "node:zlib";

/**
 * O EXTRATO DO BANCO, LIDO SEM ADIVINHAR.
 *
 * POR QUE ISTO EXISTE
 *
 * O sistema já tinha a tabela `entradas_banco`, a API, a tela de conciliação e
 * até um palpiteiro. Tinha ZERO LINHAS. O extrato nunca foi importado porque
 * não havia por onde: as entradas só entravam uma a uma, na mão. Em agosto de
 * 2026 foram 112 Pix recebidos — ninguém digita 112 linhas todo mês.
 *
 * A REGRA QUE MANDA AQUI: O SALDO É O JUIZ
 *
 * Todo extrato traz o saldo depois de cada movimento. Isso significa que a
 * extração PODE SE PROVAR: se `saldo[i] − saldo[i−1] == valor[i]` em todas as
 * linhas, nenhuma linha foi perdida, inventada ou trocada de sinal. Se não
 * fecha, alguma coisa está errada e a importação PARA.
 *
 * É essa conferência que torna seguro deixar a IA ler o PDF. Sem ela, um
 * modelo lendo dez páginas de extrato é um chute caro. Com ela, ou fecha ao
 * centavo ou não entra.
 *
 * FORMATOS
 *   .ofx        o formato do banco. Determinístico, é o melhor caminho.
 *   .csv/.txt   determinístico.
 *   .xlsx       zip de XML; abro na mão (sem dependência nova).
 *   .xls        quase sempre é uma TABELA HTML com a extensão trocada — o
 *               Bradesco faz isso. Se for BIFF de verdade, recuso com receita.
 *   .pdf        vai para a IA, com o saldo como referee.
 */

export type TipoMov = "credito" | "debito";

export interface LinhaExtrato {
  /** AAAA-MM-DD */
  data: string;
  tipo: TipoMov;
  /** Sempre positivo. O sinal mora em `tipo`. */
  valor: number;
  historico: string;
  /** Quem mandou (crédito) ou para quem foi (débito). */
  remetente: string | null;
  /** Nº do documento / FITID. É a chave natural contra importar duas vezes. */
  documento: string | null;
  /** Saldo depois deste movimento, quando o arquivo traz. */
  saldoApos: number | null;
}

export type Formato = "ofx" | "csv" | "xlsx" | "html" | "pdf" | "xls_antigo" | "desconhecido";

export interface Conferencia {
  /** Passou na prova do saldo? `null` = o arquivo não traz saldo. */
  fecha: boolean | null;
  linhas: number;
  creditos: number;
  debitos: number;
  somaCreditos: number;
  somaDebitos: number;
  saldoInicial: number | null;
  saldoFinal: number | null;
  /** Onde quebrou, se quebrou. Índice na lista + o que se esperava. */
  problema: string | null;
}

// ---------------------------------------------------------------- utilidades

function nBR(s: string): number {
  // 1.234,56 (Brasil) e 1234.56 (OFX) convivem no mesmo sistema.
  const t = (s || "").trim().replace(/\s/g, "");
  if (/,\d{1,2}$/.test(t)) return Number(t.replace(/\./g, "").replace(",", "."));
  return Number(t.replace(/,/g, ""));
}

function dataISO(s: string): string | null {
  const t = (s || "").trim();
  let m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(t);          // 2026-08-23 / OFX 20260823
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})[/.-](\d{2})[/.-](\d{4})/.exec(t);        // 23/08/2026
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{2})[/.-](\d{2})[/.-](\d{2})$/.exec(t);       // 23/08/26
  if (m) return `20${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

/**
 * O REMETENTE SAI DO HISTÓRICO. O extrato do Bradesco escreve "PIX RECEBIDO"
 * numa linha e "REM: FULANO 23/08" na outra; o OFX junta tudo no MEMO. Aqui
 * fica UM lugar que sabe achar o nome — e não um por formato, que é como
 * começam as duas versões da mesma regra.
 */
export function extrairRemetente(historico: string): string | null {
  const h = (historico || "").replace(/\s+/g, " ").trim();
  const m =
    /(?:REM|REMETENTE|DE|PAGADOR|FAVORECIDO)[:.]?\s+(.+?)(?:\s+\d{2}\/\d{2}(?:\/\d{2,4})?)?$/i.exec(h);
  if (m && m[1] && m[1].length >= 3) return m[1].trim();
  return null;
}

export function detectarFormato(bytes: Buffer, nome?: string): Formato {
  const ext = (nome || "").toLowerCase().split(".").pop() || "";
  const cabeca = bytes.subarray(0, 8);

  if (cabeca.subarray(0, 4).toString("latin1") === "%PDF") return "pdf";
  if (cabeca.subarray(0, 2).toString("latin1") === "PK") return "xlsx";
  // D0 CF 11 E0 — o velho formato binário do Excel 97.
  if (cabeca[0] === 0xd0 && cabeca[1] === 0xcf && cabeca[2] === 0x11 && cabeca[3] === 0xe0)
    return "xls_antigo";

  const texto = bytes.subarray(0, 4096).toString("latin1").toUpperCase();
  if (texto.includes("<OFX") || texto.includes("OFXHEADER")) return "ofx";
  if (texto.includes("<TABLE") || texto.includes("<HTML")) return "html";
  if (ext === "csv" || ext === "txt" || texto.includes(";") || texto.includes(",")) return "csv";
  return "desconhecido";
}

// ---------------------------------------------------------------------- OFX

export function lerOFX(texto: string): LinhaExtrato[] {
  const linhas: LinhaExtrato[] = [];
  // O OFX é SGML: as tags podem não fechar. Pego bloco a bloco e leio o valor
  // até a próxima tag ou quebra de linha.
  const blocos = texto.split(/<STMTTRN>/i).slice(1);
  for (const b of blocos) {
    const corpo = b.split(/<\/STMTTRN>/i)[0];
    const campo = (t: string) => {
      const m = new RegExp(`<${t}>([^<\\r\\n]*)`, "i").exec(corpo);
      return m ? m[1].trim() : "";
    };
    const data = dataISO(campo("DTPOSTED"));
    const bruto = nBR(campo("TRNAMT"));
    if (!data || !isFinite(bruto) || bruto === 0) continue;

    const memo = [campo("NAME"), campo("MEMO")].filter(Boolean).join(" — ");
    linhas.push({
      data,
      tipo: bruto > 0 ? "credito" : "debito",
      valor: Math.abs(bruto),
      historico: memo || campo("TRNTYPE") || "",
      remetente: extrairRemetente(memo) || (campo("NAME") || null),
      documento: campo("FITID") || campo("CHECKNUM") || null,
      // O OFX não traz saldo por linha — só o saldo final do período. Sem
      // saldo por linha não há prova, e é por isso que `fecha` pode ser nulo.
      saldoApos: null,
    });
  }
  return linhas;
}

// ------------------------------------------------------------------- tabelas

/** Uma tabela já virada em células: CSV, XLSX e HTML chegam todos aqui. */
export function lerTabela(linhas: string[][]): LinhaExtrato[] {
  if (!linhas.length) return [];

  // ACHAR AS COLUNAS PELO CABEÇALHO, não pela posição. Cada banco põe numa
  // ordem, e uma posição fixa erra em silêncio no primeiro banco diferente.
  let iCab = -1;
  for (let i = 0; i < Math.min(linhas.length, 30); i++) {
    const l = linhas[i].map((c) => (c || "").toLowerCase());
    if (l.some((c) => /^data/.test(c)) && l.some((c) => /valor|cr[eé]dito|d[eé]bito|entrada|sa[ií]da/.test(c))) {
      iCab = i; break;
    }
  }
  if (iCab < 0) return [];

  const cab = linhas[iCab].map((c) => (c || "").toLowerCase().trim());
  const achar = (re: RegExp) => cab.findIndex((c) => re.test(c));
  const cData    = achar(/^data/);
  const cHist    = achar(/hist[oó]rico|descri|lan[cç]amento|memo/);
  const cDoc     = achar(/docto|documento|n[uú]mero|id/);
  const cValor   = achar(/^valor/);
  // ALGUNS BANCOS DIZEM O LADO NUMA COLUNA PRÓPRIA e deixam o valor sempre
  // positivo ("Tipo: Crédito/Débito", ou só "C"/"D"). Sem ler esta coluna, o
  // sinal se perde e TODO movimento vira entrada — o extrato inteiro passa a
  // parecer receita. Foi o que aconteceu no primeiro teste, e quem pegou foi
  // a conferência do saldo.
  const cTipo    = achar(/^(tipo|natureza|d\/c|c\/d|sinal|opera[cç][aã]o)$/);
  const cCred    = achar(/cr[eé]dito|entrada/);
  const cDeb     = achar(/d[eé]bito|sa[ií]da/);
  const cSaldo   = achar(/saldo/);

  const out: LinhaExtrato[] = [];
  for (let i = iCab + 1; i < linhas.length; i++) {
    const l = linhas[i];
    const data = dataISO(l[cData] || "");
    if (!data) continue;

    let valor = 0;
    let tipo: TipoMov = "credito";
    if (cCred >= 0 || cDeb >= 0) {
      // COLUNAS SEPARADAS. É o desenho mais comum no Brasil, e o que exige
      // cuidado: a célula vazia é o que diz de que lado o dinheiro andou.
      const c = cCred >= 0 ? nBR(l[cCred] || "") : 0;
      const d = cDeb  >= 0 ? nBR(l[cDeb]  || "") : 0;
      if (c > 0) { valor = c; tipo = "credito"; }
      else if (d > 0) { valor = d; tipo = "debito"; }
      else continue;
    } else if (cValor >= 0) {
      const v = nBR(l[cValor] || "");
      if (!isFinite(v) || v === 0) continue;
      valor = Math.abs(v);
      const marca = (cTipo >= 0 ? (l[cTipo] || "") : "").trim().toLowerCase();
      if (marca) {
        // O QUE ESTÁ ESCRITO MANDA. Se a coluna existe e diz "débito", o sinal
        // do número não desempata — arquivo com valor positivo e lado escrito
        // é exatamente o caso em que confiar no sinal erra em todas as linhas.
        tipo = /^(d|deb|débito|debito|saída|saida|pagamento)/.test(marca) ? "debito" : "credito";
      } else {
        tipo = v > 0 ? "credito" : "debito";
      }
    } else continue;

    const hist = (cHist >= 0 ? l[cHist] : "") || "";
    const saldo = cSaldo >= 0 ? nBR(l[cSaldo] || "") : NaN;
    out.push({
      data, tipo, valor,
      historico: hist.replace(/\s+/g, " ").trim(),
      remetente: extrairRemetente(hist),
      documento: (cDoc >= 0 ? (l[cDoc] || "").trim() : "") || null,
      saldoApos: isFinite(saldo) ? saldo : null,
    });
  }
  return out;
}

export function lerCSV(texto: string): LinhaExtrato[] {
  const cru = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!cru.length) return [];
  // FAREJA O SEPARADOR. ";" no Brasil, "," fora, "\t" em alguns bancos —
  // chutar ponto-e-vírgula quebraria em silêncio num arquivo com vírgula.
  const cand = [";", ",", "\t"];
  const sep = cand
    .map((s) => ({ s, n: cru.slice(0, 20).reduce((a, l) => a + l.split(s).length - 1, 0) }))
    .sort((a, b) => b.n - a.n)[0].s;

  const celulas = cru.map((l) => {
    const out: string[] = [];
    let atual = "", aspas = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') { if (aspas && l[i + 1] === '"') { atual += '"'; i++; } else aspas = !aspas; }
      else if (c === sep && !aspas) { out.push(atual); atual = ""; }
      else atual += c;
    }
    out.push(atual);
    return out.map((c) => c.trim());
  });
  return lerTabela(celulas);
}

export function lerHTML(texto: string): LinhaExtrato[] {
  // O ".xls" do Bradesco costuma ser isto: uma <table> com a extensão trocada.
  const linhas: string[][] = [];
  for (const tr of texto.split(/<tr[^>]*>/i).slice(1)) {
    const corpo = tr.split(/<\/tr>/i)[0];
    const celulas = (corpo.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || []).map((c) =>
      c.replace(/<[^>]+>/g, "")
       .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
       .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
       .replace(/\s+/g, " ").trim()
    );
    if (celulas.length) linhas.push(celulas);
  }
  return lerTabela(linhas);
}

// -------------------------------------------------------------------- XLSX
//
// XLSX é um zip com XML dentro. Abrir na mão custa umas cem linhas e evita uma
// dependência de planilha no projeto — que é código grande, com histórico de
// falha de segurança, para ler um arquivo por mês.

function descompactar(zip: Buffer): Map<string, string> {
  const arquivos = new Map<string, string>();
  let i = 0;
  while (i < zip.length - 4) {
    if (zip.readUInt32LE(i) !== 0x04034b50) { i++; continue; }   // PK\x03\x04
    const metodo   = zip.readUInt16LE(i + 8);
    const tamComp  = zip.readUInt32LE(i + 18);
    const tamNome  = zip.readUInt16LE(i + 26);
    const tamExtra = zip.readUInt16LE(i + 28);
    const nome = zip.subarray(i + 30, i + 30 + tamNome).toString("utf8");
    const ini = i + 30 + tamNome + tamExtra;

    // tamComp = 0 com bit 3 ligado significa "o tamanho vem depois dos dados".
    // Nesse caso não dá para pular o bloco com segurança: paro e uso o que já
    // tenho, em vez de ler lixo como se fosse planilha.
    if (tamComp === 0 && (zip.readUInt16LE(i + 6) & 0x08)) break;

    const dados = zip.subarray(ini, ini + tamComp);
    if (nome.endsWith(".xml")) {
      try {
        arquivos.set(nome, metodo === 0 ? dados.toString("utf8") : inflateRawSync(dados).toString("utf8"));
      } catch { /* um membro ilegível não derruba os outros */ }
    }
    i = ini + tamComp;
  }
  return arquivos;
}

export function lerXLSX(bytes: Buffer): LinhaExtrato[] {
  const arq = descompactar(bytes);
  const sheet = arq.get("xl/worksheets/sheet1.xml")
    || [...arq.entries()].find(([k]) => /xl\/worksheets\/.*\.xml$/.test(k))?.[1];
  if (!sheet) return [];

  const compart: string[] = [];
  const ss = arq.get("xl/sharedStrings.xml");
  if (ss) {
    for (const si of ss.split(/<si[ >]/).slice(1)) {
      const pedacos = si.split(/<\/si>/)[0].match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
      compart.push(pedacos.map((p) => p.replace(/<[^>]+>/g, "")).join("")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'));
    }
  }

  const linhas: string[][] = [];
  for (const bloco of sheet.split(/<row[ >]/).slice(1)) {
    const corpo = bloco.split(/<\/row>/)[0];
    const celulas: string[] = [];
    for (const c of corpo.match(/<c[ >][\s\S]*?(?:<\/c>|\/>)/g) || []) {
      // A COLUNA VEM NA REFERÊNCIA (r="C7"), não na ordem: célula vazia não é
      // escrita no arquivo. Sem isto, uma linha com buraco desloca tudo.
      const ref = /r="([A-Z]+)\d+"/.exec(c);
      let col = celulas.length;
      if (ref) {
        col = 0;
        for (const ch of ref[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
        col -= 1;
      }
      const ehTexto = /t="s"/.test(c);
      const v = /<v>([\s\S]*?)<\/v>/.exec(c);
      const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(c);
      let valor = "";
      if (inline) valor = inline[1];
      else if (v) valor = ehTexto ? (compart[Number(v[1])] ?? "") : v[1];
      while (celulas.length < col) celulas.push("");
      celulas[col] = valor;
    }
    if (celulas.length) linhas.push(celulas);
  }
  return lerTabela(linhas);
}

// -------------------------------------------------------- o saldo é o juiz

/**
 * A PROVA. Se o arquivo traz saldo por linha, a soma tem de andar junto com
 * ele — em TODAS as linhas. Uma linha perdida, duplicada ou com o sinal
 * trocado aparece aqui e a importação para.
 *
 * Quando o arquivo NÃO traz saldo (o OFX não traz), `fecha` volta nulo: não é
 * aprovação, é ausência de prova — e a tela precisa dizer isso com essas
 * palavras, porque "sem erro" e "não verificado" não são a mesma coisa.
 */
export function conferir(linhas: LinhaExtrato[], saldoInicial?: number | null): Conferencia {
  const cred = linhas.filter((l) => l.tipo === "credito");
  const deb  = linhas.filter((l) => l.tipo === "debito");
  const base: Conferencia = {
    fecha: null,
    linhas: linhas.length,
    creditos: cred.length,
    debitos: deb.length,
    somaCreditos: Math.round(cred.reduce((s, l) => s + l.valor, 0) * 100) / 100,
    somaDebitos:  Math.round(deb.reduce((s, l) => s + l.valor, 0) * 100) / 100,
    saldoInicial: saldoInicial ?? null,
    saldoFinal: null,
    problema: null,
  };
  if (!linhas.length) return { ...base, problema: "não achei nenhum movimento neste arquivo" };

  const comSaldo = linhas.filter((l) => l.saldoApos != null);
  if (comSaldo.length < linhas.length) return base;   // sem prova possível

  base.saldoFinal = linhas[linhas.length - 1].saldoApos!;
  let anterior = saldoInicial ?? null;
  if (anterior == null) {
    // Sem saldo de abertura declarado, deduzo pelo primeiro movimento: o saldo
    // antes da primeira linha é o dela menos o próprio movimento.
    const p = linhas[0];
    anterior = Math.round((p.saldoApos! - (p.tipo === "credito" ? p.valor : -p.valor)) * 100) / 100;
    base.saldoInicial = anterior;
  }

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const esperado = Math.round((anterior + (l.tipo === "credito" ? l.valor : -l.valor)) * 100) / 100;
    if (Math.abs(esperado - l.saldoApos!) > 0.005) {
      return {
        ...base,
        fecha: false,
        problema:
          `a linha ${i + 1} (${l.data}, ${l.tipo}, R$ ${l.valor.toFixed(2)}) deixaria o saldo em `
          + `R$ ${esperado.toFixed(2)}, mas o extrato diz R$ ${l.saldoApos!.toFixed(2)}. `
          + `Faltou ou sobrou movimento aqui.`,
      };
    }
    anterior = l.saldoApos!;
  }
  return { ...base, fecha: true };
}

export function lerArquivo(bytes: Buffer, nome?: string):
  { formato: Formato; linhas: LinhaExtrato[]; erro?: string } {
  const formato = detectarFormato(bytes, nome);
  switch (formato) {
    case "ofx":  return { formato, linhas: lerOFX(bytes.toString("latin1")) };
    case "csv":  return { formato, linhas: lerCSV(bytes.toString("utf8")) };
    case "html": return { formato, linhas: lerHTML(bytes.toString("latin1")) };
    case "xlsx": return { formato, linhas: lerXLSX(bytes) };
    case "pdf":  return { formato, linhas: [] };   // vai pela IA, na rota
    case "xls_antigo":
      return {
        formato, linhas: [],
        erro:
          "Este é o Excel antigo (.xls de verdade), que eu não consigo abrir. "
          + "No internet banking, baixe o extrato em OFX — é o formato mais "
          + "confiável — ou abra a planilha e salve como CSV ou XLSX.",
      };
    default:
      return {
        formato, linhas: [],
        erro: "Não reconheci este arquivo. Baixe o extrato em OFX, CSV, XLSX ou PDF.",
      };
  }
}
