import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { interpretarComprovante } from "./comprovante-pdf";
import type { DadosComprovante } from "./comprovante";

/**
 * LER O COMPROVANTE QUE VEIO COMO FOTO — sem IA.
 *
 * ============================================================================
 * POR QUE ISTO EXISTE
 * ============================================================================
 *
 * A saída barata era pedir o PDF: quase todo banco tem "compartilhar
 * comprovante". Só que quem manda comprovante aqui são famílias que cuidam do
 * túmulo de alguém há trinta anos, e o Leandro foi direto ao ponto: **pedir é
 * complicado para idosos**. Quem só sabe tirar print, ou fotografar a tela do
 * celular com outro celular, não vai aprender a exportar PDF porque o sistema
 * prefere assim. O sistema é que se vira.
 *
 * MEDIDO em 08/11/2026: dos 90 arquivos que as famílias mandaram, 67 são JPEG
 * e 23 são PDF. Dois terços chegam como foto.
 *
 * ============================================================================
 * O QUE O OCR DÁ, E O QUE ELE NÃO DÁ — medido, não suposto
 * ============================================================================
 *
 * Passei o Tesseract em dois casos construídos para parecer o que chega:
 *
 *   PRINT DE TELA (texto digital, comprimido pelo WhatsApp a 50 KB)
 *     valor ....... R$ 40,00      certo
 *     data ........ 07/11/2026    certo
 *     pagador ..... Katia Ferreira dos Santos   certo
 *     rótulos ..... PAGADOR / RECEBEDOR         certos
 *     E2E ......... E1823...abcdef012ab lido como ...abcdefo12ab  ERRADO
 *
 *   FOTO DA TELA (torta, com reflexo, moiré e 23 KB)
 *     valor ....... R$ 40,00      certo
 *     data ........ 07/11/2026    certo
 *     os dois nomes                certos
 *     rótulos ..... SUMIRAM
 *     E2E ......... virou "io DA TRANSA"
 *
 * Daí saem as duas regras desta peça.
 *
 * ============================================================================
 * REGRA 1 — O OCR NUNCA DEVOLVE O IDENTIFICADOR DO PIX
 * ============================================================================
 *
 * No print, o `0` virou `o`. Um caractere, e ninguém percebe: o E2E continua
 * com 32 posições e passa por qualquer conferência de forma.
 *
 * E o E2E é a chave MAIS FORTE da conciliação — a fonte 0 da triangulação, a
 * única que não é palpite. Um E2E errado não deixa de casar: ele casa ERRADO,
 * com cara de certeza, e credita o pagamento de uma família na conta de outra.
 *
 * Perder o identificador custa um pouco de automação. Aceitar um identificador
 * possivelmente errado custa dinheiro na conta da pessoa errada. Não é um
 * empate.
 *
 * ============================================================================
 * REGRA 2 — SEM RÓTULO, QUEM PAGOU SAI POR ELIMINAÇÃO
 * ============================================================================
 *
 * Na foto, "PAGADOR" e "RECEBEDOR" somem: são escritos em cinza pequeno, e é
 * isso que não sobrevive ao brilho e à compressão. Sobram dois nomes sem
 * etiqueta, e pegar o primeiro poria o nome da casa em metade dos pagamentos.
 *
 * Mas a casa a gente conhece — ela recebe TODOS. `interpretarComprovante`
 * recebe `nomeDaCasa`, tira esse nome dos candidatos, e se sobrar exatamente
 * um, foi ele. Sobrando zero ou dois, devolve nulo.
 *
 * ============================================================================
 * E A CONFIANÇA NUNCA CHEGA A "ALTA"
 * ============================================================================
 *
 * Leitura de foto é reconhecimento, não transcrição. O teto é "media", que
 * preenche a tela e deixa a conciliação depender de valor e nome — e nunca
 * dispara a fonte 0. Quem confere continua olhando o papel.
 */

const require_ = createRequire(import.meta.url);

/**
 * OS DADOS DE PORTUGUÊS VÊM DO PACOTE, e não da internet.
 *
 * O Tesseract baixa o idioma de um CDN por padrão. Aqui isso seria: uma
 * dependência de rede no meio do recebimento de um comprovante, numa função
 * que já tem a imagem na mão. Se o CDN cair ou a política de rede mudar, a
 * leitura para de funcionar sem ninguém mexer em nada.
 *
 * `4.0.0_best_int` é a versão compacta (1,4 MB) — a completa tem 6,8 MB e
 * acerta um pouco mais em texto manuscrito, que não é o nosso caso: nosso
 * papel é tela de banco, com fonte de computador.
 */
function pastaDoIdioma(): string {
  const pkg = require_.resolve("@tesseract.js-data/por/package.json");
  return join(dirname(pkg), "4.0.0_best_int");
}

export interface OcrOpts {
  /** Quem recebe todo comprovante que chega aqui. Ver REGRA 2. */
  nomeDaCasa?: string | null;
  /** Para o teste medir sem adivinhar. */
  aoLerTexto?: (texto: string, confianca: number) => void;
}

/**
 * Devolve `null` quando não dá para ler — e `null` é resposta, não falha: quem
 * chama cai no plano B (a IA) ou na mão de uma pessoa, exatamente como o PDF
 * escaneado faz desde a 0161.
 */
export async function lerComprovanteImagem(
  bytes: Buffer, opts: OcrOpts = {},
): Promise<DadosComprovante | null> {
  let worker: any = null;
  try {
    const { createWorker } = await import("tesseract.js");
    worker = await createWorker("por", 1, {
      langPath: pastaDoIdioma(),
      gzip: true,
      // A FUNÇÃO NÃO TEM DISCO PARA ESCREVER. Em serverless o sistema de
      // arquivos é só de leitura fora de /tmp, e o cache do Tesseract tentaria
      // gravar ao lado do idioma.
      cacheMethod: "none",
      logger: () => {},
      errorHandler: () => {},
    });

    const { data } = await worker.recognize(bytes);
    const texto = String(data?.text || "");
    opts.aoLerTexto?.(texto, Number(data?.confidence) || 0);

    // CONFIANÇA DO RECONHECIMENTO, antes da interpretação. Abaixo de 60 o
    // Tesseract está chutando letra por letra, e interpretar chute é construir
    // uma conta em cima de areia. Medido: 90 no print, 84 na foto torta.
    if ((Number(data?.confidence) || 0) < 60) return null;

    const lido = interpretarComprovante(texto, {
      semIdentificador: true,          // REGRA 1
      tetoDaConfianca: "media",
      nomeDaCasa: opts.nomeDaCasa,     // REGRA 2
    });
    return lido;
  } catch (e) {
    console.error("[comprovante-ocr] nao consegui ler a imagem:", (e as any)?.message || e);
    return null;
  } finally {
    try { await worker?.terminate(); } catch { /* o worker já morreu */ }
  }
}
