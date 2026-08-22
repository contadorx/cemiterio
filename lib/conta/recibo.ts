/* O recibo do caso, do lado do servidor.
 *
 * Ele chega dentro do link da volta, comprimido em gzip e escrito em base64 de
 * endereço. Aqui ele é aberto, CONFERIDO e recusado se não for o que diz ser.
 *
 * A conferência não é zelo: este texto vem de um endereço que qualquer pessoa
 * digita. Sem os limites abaixo, um `?rec=` de trinta megabytes descomprimidos
 * derruba o processo — é o ataque mais barato que existe contra quem
 * descomprime entrada de fora, e ele tem nome (zip bomb).
 *
 * O que o recibo pode conter, e nada além:
 *
 *   metadados do caso   caso, sistema, chamado, quem, resultado, ambiente,
 *                       cenário, idioma, data, formato e nome do arquivo
 *   números             a impressão do documento e a de cada quadro, em ordem
 *
 * O que ele nunca contém: imagem, transcrição ou o texto dos passos. Qualquer
 * campo que não esteja na lista branca é jogado fora antes de chegar ao banco —
 * o dia em que a ferramenta passar a mandar algo a mais, o servidor não guarda.
 */
import 'server-only';
import { gunzipSync } from 'node:zlib';

/** O `?rec=` acima disto nem é aberto. A ferramenta corta em 7000. */
const TETO_CODIFICADO = 12_000;
/** E o descomprimido acima disto é recusado, seja lá o que ele diga ser. */
const TETO_ABERTO = 512 * 1024;
/** Impressões de quadro. Mil quadros num documento já é fora do razoável. */
const TETO_HASHES = 1000;

const TEXTOS = ['g', 'em', 'cen', 'idi', 'caso', 'sis', 'cha', 'quem', 'res', 'amb',
                'ini', 'imp', 'arq', 'fmt'] as const;
const NUMEROS = ['v', 'n', 'h_omitidos'] as const;

export type Recibo = Record<string, unknown> & { h?: string[] };

/** Abre e limpa o recibo. Devolve null para qualquer coisa que não passe —
 *  em silêncio, de propósito: o caso é marcado como feito de qualquer jeito, e
 *  um recibo ilegível não é motivo para recusar o trabalho de alguém. */
export function lerRecibo(cru: string | null): Recibo | null {
  if (!cru || cru.length > TETO_CODIFICADO) return null;
  let aberto: string;
  try {
    const bytes = Buffer.from(cru.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (!bytes.length) return null;
    /* `maxOutputLength` é a trava contra a bomba: o zlib para de descomprimir
       em vez de a gente descobrir o tamanho depois de já ter alocado tudo. */
    aberto = gunzipSync(bytes, { maxOutputLength: TETO_ABERTO }).toString('utf8');
  } catch {
    return null;
  }

  let cru2: unknown;
  try { cru2 = JSON.parse(aberto); } catch { return null; }
  if (!cru2 || typeof cru2 !== 'object' || Array.isArray(cru2)) return null;
  const o = cru2 as Record<string, unknown>;

  const r: Recibo = {};
  for (const k of TEXTOS) {
    const v = o[k];
    if (typeof v === 'string' && v) r[k] = v.slice(0, 200);
  }
  for (const k of NUMEROS) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) r[k] = Math.trunc(v);
  }
  if (Array.isArray(o.h)) {
    /* Só hexadecimal entra. Um "hash" que é uma frase é ou defeito nosso ou
       alguém escrevendo o que quiser num campo que a tela mostra. */
    const h = o.h.slice(0, TETO_HASHES)
      .filter((x): x is string => typeof x === 'string' && /^[0-9a-f]{0,64}$/.test(x));
    if (h.length) r.h = h;
  }
  /* Um recibo sem nenhuma impressão não prova nada, e guardá-lo só encheria a
     tela de uma linha que não responde pergunta nenhuma. */
  if (!r.imp && !r.h) return null;
  return r;
}

/** O resumo que a tela mostra. O recibo inteiro tem sessenta números dentro;
 *  ninguém lê sessenta números, e mostrá-los seria esconder os três que
 *  importam no meio deles. */
export function resumoDoRecibo(r: Recibo | null | undefined) {
  if (!r) return null;
  return {
    quadros: typeof r.n === 'number' ? r.n : (r.h?.length ?? 0),
    impressao: typeof r.imp === 'string' ? r.imp : '',
    hashes: r.h?.length ?? 0,
    formato: typeof r.fmt === 'string' ? r.fmt : '',
    resultado: typeof r.res === 'string' ? r.res : '',
    ambiente: typeof r.amb === 'string' ? r.amb : '',
    cenario: typeof r.cen === 'string' ? r.cen : '',
  };
}
