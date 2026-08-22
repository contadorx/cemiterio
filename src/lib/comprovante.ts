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
