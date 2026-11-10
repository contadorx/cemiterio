import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";
import { lerComprovantePdf } from "./comprovante-pdf";
import { lerComprovanteImagem } from "./comprovante-ocr";

let _cli: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_cli) _cli = new Anthropic({ apiKey: env.anthropicKey() });
  return _cli;
}

export interface Midia {
  base64: string;
  mimetype: string;
}

export interface DadosComprovante {
  eh_comprovante: boolean;
  valor: number | null;
  data: string | null; // ISO yyyy-mm-dd
  id_transacao: string | null;
  /** O nome de quem pagou, como o comprovante escreve. */
  nome_pagador: string | null;
  confianca: "alta" | "media" | "baixa";
  /**
   * A LEITURA NEM ACONTECEU — chave fora, modelo fora do ar, arquivo recusado.
   *
   * Sem isto, falhar devolvia `eh_comprovante: false`, que é a MESMA resposta
   * de "li e não é um comprovante". A Sureya lia "a família mandou uma imagem"
   * nos dois casos e não tinha como saber se precisava olhar o papel ou se o
   * sistema estava cego. Medido em 08/11/2026: zero comprovantes registrados
   * desde que a chave foi desligada, e nenhum aviso em lugar nenhum.
   */
  falhou?: boolean;
<<<<<<< HEAD
=======
  /** De onde veio: o texto do PDF, o OCR da foto, ou um modelo. */
  fonte?: "pdf" | "ocr" | "ia";
>>>>>>> 5882b1e5f8532db3fd288e8675e34409b35fd294
}

const IMAGENS_OK = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const ferramenta = {
  name: "extrair_comprovante",
  description: "Extrai os dados de um comprovante de Pix brasileiro. Use SEMPRE.",
  input_schema: {
    type: "object" as const,
    properties: {
      eh_comprovante: {
        type: "boolean",
        description: "true somente se a imagem for de fato um comprovante de transferência/Pix.",
      },
      valor: {
        type: ["number", "null"],
        description: "Valor pago em reais, só o número (ex.: 40.00). null se não achar.",
      },
      data: {
        type: ["string", "null"],
        description: "Data do pagamento no formato AAAA-MM-DD. null se não achar.",
      },
      id_transacao: {
        type: ["string", "null"],
        description: "Identificador da transação / E2E / autenticação, se visível. null se não.",
      },
      // O NOME DE QUEM PAGOU — a peça que faltava para casar com o extrato.
      //
      // O extrato do banco traz o nome do remetente; o comprovante traz o
      // mesmo nome. Sem ele, dois Pix de R$ 40 no mesmo dia eram um empate que
      // ninguem desfazia. Vem na MESMA chamada que ja lia valor e data: custo
      // zero a mais por comprovante.
      nome_pagador: {
        type: ["string", "null"],
        description:
          "Nome COMPLETO de quem PAGOU (o remetente/pagador, nunca o recebedor/beneficiario), "
          + "exatamente como esta escrito, sem abreviar nem corrigir. null se nao achar.",
      },
      confianca: {
        type: "string",
        enum: ["alta", "media", "baixa"],
        description: "Sua confiança na leitura.",
      },
    },
    required: ["eh_comprovante", "valor", "data", "id_transacao", "nome_pagador", "confianca"],
  },
};

export interface QuemLe {
  /**
   * COMO O BANCO ESCREVE O NOME DA CASA (0166).
   *
   * O comprovante traz quem pagou E quem recebeu, e numa foto os rótulos
   * somem. Sabendo quem recebe — e é sempre a casa —, o outro nome é o de
   * quem pagou. Sem isto, foto sem rótulo não devolve pagador: o que é
   * melhor que devolver o nome errado.
   */
  nomeDaCasa?: string | null;
}

export async function extrairComprovante(
  midia: Midia, quem: QuemLe = {},
): Promise<DadosComprovante> {
  const isPdf = midia.mimetype === "application/pdf";

  // ==========================================================================
  // O PDF SE LÊ AQUI, SEM IA.
  //
  // Um comprovante em PDF TEM TEXTO DENTRO: o banco escreveu "R$ 40,00",
  // "07/11/2026" e o E2E ali, em caracteres. Mandar isso para um modelo de
  // visão é pagar para alguém ler em voz alta o que já está escrito.
  //
  // É a mesma decisão da 0161, quando o extrato do Bradesco deixou de ir para
  // a IA. E vale mais agora: MEDIDO em 08/11/2026, seis das 25 mídias que as
  // famílias mandaram são PDF, e com a chave desligada ZERO comprovantes
  // estavam sendo registrados.
  //
  // A IA continua existindo como PLANO B, e só para o que o leitor não
  // alcança: PDF escaneado (que é imagem com capa de PDF) e leitura de
  // confiança baixa. Confiança baixa não preencheria campo nenhum de todo
  // jeito, então aí vale gastar a chamada.
  // ==========================================================================
  if (isPdf) {
    try {
      const local = lerComprovantePdf(Buffer.from(midia.base64, "base64"));
      if (local && local.confianca !== "baixa") return { ...local, fonte: "pdf" };
    } catch (e) {
      // Ler o PDF falhar não pode impedir a IA de tentar: o plano B existe
      // exatamente para o arquivo que o leitor não entende.
      console.error("[comprovante] leitor de PDF falhou:", (e as any)?.message || e);
    }
  }

  // ==========================================================================
  // E A FOTO SE LÊ AQUI TAMBÉM, SEM IA (0166).
  //
  // "Pedir o PDF" era a saída barata, e o Leandro matou a ideia com uma frase:
  // pedir é complicado para idosos. Quem manda comprovante aqui cuida do
  // túmulo de alguém há trinta anos; não vai aprender a exportar PDF porque o
  // sistema prefere assim. MEDIDO: dos 90 arquivos recebidos, 67 são JPEG.
  //
  // O OCR devolve `null` quando não alcança — foto escura demais, reconhecimento
  // abaixo de 60 — e aí a IA segue como plano B, igual ao PDF escaneado.
  // ==========================================================================
  if (!isPdf) {
    try {
      const bytes = Buffer.from(midia.base64, "base64");
      const lido = await lerComprovanteImagem(bytes, { nomeDaCasa: quem.nomeDaCasa });
      if (lido && lido.confianca !== "baixa") return { ...lido, fonte: "ocr" };
    } catch (e) {
      console.error("[comprovante] OCR falhou:", (e as any)?.message || e);
    }
  }

  const mediaType = IMAGENS_OK.includes(midia.mimetype) ? midia.mimetype : "image/jpeg";

  const bloco = isPdf
    ? {
        type: "document" as const,
        source: { type: "base64" as const, media_type: "application/pdf" as const, data: midia.base64 },
      }
    : {
        type: "image" as const,
        source: { type: "base64" as const, media_type: mediaType as any, data: midia.base64 },
      };

  try {
    const resp = await anthropic().messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 400,
      system:
        "Você lê comprovantes de Pix/transferência bancária do Brasil. Extraia valor, data, identificador da transação e o NOME DE QUEM PAGOU com precisão. Quem paga é o remetente/pagador/origem — nunca o recebedor, favorecido ou beneficiário. Se a imagem não for um comprovante, marque eh_comprovante=false.",
      messages: [
        {
          role: "user",
          content: [bloco, { type: "text", text: "Extraia os dados deste comprovante." }] as any,
        },
      ],
      tools: [ferramenta],
      tool_choice: { type: "tool", name: "extrair_comprovante" },
    });

    const b = resp.content.find((x) => x.type === "tool_use");
    if (!b || b.type !== "tool_use") {
      // O modelo respondeu, mas não pela ferramenta: isso é leitura falhada,
      // e não "não é comprovante".
      return { eh_comprovante: false, valor: null, data: null, id_transacao: null,
               nome_pagador: null, confianca: "baixa", falhou: true };
    }
    return { ...(b.input as DadosComprovante), fonte: "ia" };
  } catch (e) {
    console.error("[comprovante] falha na leitura:", (e as any)?.message || e);
    return { eh_comprovante: false, valor: null, data: null, id_transacao: null,
             nome_pagador: null, confianca: "baixa", falhou: true };
  }
}

/**
 * O COMPROVANTE VALE OU NÃO VALE — uma regra, um lugar.
 *
 * A regra "é comprovante E a confiança não é baixa" estava escrita DUAS VEZES:
 * uma em `atendimento.ts`, no caminho do WhatsApp, e outra em
 * `/api/comprovantes/ler`, no caminho da mão. Duas cópias da mesma regra é o
 * defeito que este projeto mais repete — a agenda (0092), o painel (0105), a
 * lista de famílias (0106), a competência (0114), a prévia (0115). Sempre
 * começa igual e sempre termina discordando.
 *
 * POR QUE A CONFIANÇA BAIXA NÃO PASSA
 * Um valor errado pré-preenchido é pior que campo vazio. O campo vazio obriga
 * a olhar o papel; o campo preenchido convida a confiar e apertar "Lançar".
 * Dinheiro errado no razão da família é mais caro que trabalho de digitar.
 */
export interface Leitura {
  /** Dá para preencher os campos de dinheiro com isto? */
  confiavel: boolean;
  /** A leitura nem aconteceu — diferente de "li e não é comprovante". */
  falhou: boolean;
<<<<<<< HEAD
=======
  /** De onde veio: o texto do PDF, o OCR da foto, ou um modelo. */
  fonte: "pdf" | "ocr" | "ia" | null;
>>>>>>> 5882b1e5f8532db3fd288e8675e34409b35fd294
  valor: number | null;
  data: string | null;
  idTransacao: string | null;
  /** O nome de quem pagou — é ele que casa com o remetente do extrato. */
  nomePagador: string | null;
  /** O que dizer para quem está olhando a tela. `null` = nada a dizer. */
  mensagem: string | null;
}

export function decidirLeitura(dados: DadosComprovante): Leitura {
  const confiavel = !!dados.eh_comprovante && dados.confianca !== "baixa";

  return {
    confiavel,
    falhou: !!dados.falhou,
<<<<<<< HEAD
=======
    fonte: dados.fonte ?? null,
>>>>>>> 5882b1e5f8532db3fd288e8675e34409b35fd294
    // FORA DA CONFIANÇA, NADA SAI. Devolver o valor "só para mostrar" faria a
    // tela ter um número na mão e a tentação de usá-lo.
    valor: confiavel ? (dados.valor ?? null) : null,
    data: confiavel ? (dados.data ?? null) : null,
    idTransacao: confiavel ? (dados.id_transacao || null) : null,
    // O NOME SEGUE A MESMA REGRA DO VALOR: fora da confiança, nada sai. Um
    // nome errado guardado aqui não enche um campo na tela — ele DESCARTA o
    // comprovante certo na conciliação do mês seguinte, calado.
    nomePagador: confiavel ? (dados.nome_pagador || null) : null,
    // TRÊS RESPOSTAS, E NÃO DUAS. "Não consegui ler" não é "não é
    // comprovante": a primeira é um problema meu, a segunda é um fato sobre o
    // papel. Dizer uma pela outra manda a Sureya procurar no lugar errado.
    mensagem: dados.falhou
      ? "Não consegui ler este arquivo agora — a leitura automática está fora do ar. "
        + "O arquivo está aqui na conversa; digite o valor e a data à mão."
      : !dados.eh_comprovante
        ? "Isto não me parece um comprovante. Se for, digite o valor e a data à mão."
        : !confiavel
          ? "Consegui ler, mas não com confiança suficiente. Confira o valor e a data."
          : null,
  };
}
