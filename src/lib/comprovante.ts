import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";

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
  confianca: "alta" | "media" | "baixa";
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
      confianca: {
        type: "string",
        enum: ["alta", "media", "baixa"],
        description: "Sua confiança na leitura.",
      },
    },
    required: ["eh_comprovante", "valor", "data", "id_transacao", "confianca"],
  },
};

export async function extrairComprovante(midia: Midia): Promise<DadosComprovante> {
  const isPdf = midia.mimetype === "application/pdf";
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
        "Você lê comprovantes de Pix/transferência bancária do Brasil. Extraia valor, data e identificador da transação com precisão. Se a imagem não for um comprovante, marque eh_comprovante=false.",
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
      return { eh_comprovante: false, valor: null, data: null, id_transacao: null, confianca: "baixa" };
    }
    return b.input as DadosComprovante;
  } catch (e) {
    console.error("[comprovante] falha na leitura:", (e as any)?.message || e);
    return { eh_comprovante: false, valor: null, data: null, id_transacao: null, confianca: "baixa" };
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
  valor: number | null;
  data: string | null;
  idTransacao: string | null;
  /** O que dizer para quem está olhando a tela. `null` = nada a dizer. */
  mensagem: string | null;
}

export function decidirLeitura(dados: DadosComprovante): Leitura {
  const confiavel = !!dados.eh_comprovante && dados.confianca !== "baixa";

  return {
    confiavel,
    // FORA DA CONFIANÇA, NADA SAI. Devolver o valor "só para mostrar" faria a
    // tela ter um número na mão e a tentação de usá-lo.
    valor: confiavel ? (dados.valor ?? null) : null,
    data: confiavel ? (dados.data ?? null) : null,
    idTransacao: confiavel ? (dados.id_transacao || null) : null,
    mensagem: !dados.eh_comprovante
      ? "Isto não me parece um comprovante. Se for, digite o valor e a data à mão."
      : !confiavel
        ? "Consegui ler, mas não com confiança suficiente. Confira o valor e a data."
        : null,
  };
}
