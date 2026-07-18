import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";

let _cli: Anthropic | null = null;
function anthropic() {
  if (!_cli) _cli = new Anthropic({ apiKey: env.anthropicKey() });
  return _cli;
}

export interface RespostaCampo {
  resposta: string;                  // o que dizer à ajudante
  tipo_ocorrencia: string | null;    // chuva | falta_agua | falta_material | acesso | saude | tumulo_nao_encontrado | outro | null
  descricao: string | null;          // resumo objetivo pro dono ler
  impacto: number;                   // quantos túmulos deixam de ser feitos (0 se não afeta)
  material: string | null;           // nome do material, se for falta de material
  avisar_dono: boolean;              // se o dono precisa saber agora
  encerrar_dia: boolean;             // se ela está dizendo que não dá pra continuar
}

const ferramenta: Anthropic.Tool = {
  name: "registrar",
  description: "Responde à ajudante de campo e classifica o que ela relatou.",
  input_schema: {
    type: "object",
    properties: {
      resposta: {
        type: "string",
        description:
          "O que dizer a ela. Tom prático, acolhedor e curto (1-3 frases). Ela está na rua, muitas vezes no sol. Nunca burocrático.",
      },
      tipo_ocorrencia: {
        type: ["string", "null"],
        enum: ["chuva", "falta_agua", "falta_material", "acesso", "saude", "tumulo_nao_encontrado", "outro", null],
        description: "Classifique o problema relatado. null se ela só está conversando ou perguntando algo.",
      },
      descricao: {
        type: ["string", "null"],
        description: "Resumo objetivo do problema para o dono ler depois. null se não houve problema.",
      },
      impacto: {
        type: "number",
        description:
          "Quantos túmulos provavelmente deixarão de ser feitos por causa disso. 0 se não afeta a produção.",
      },
      material: {
        type: ["string", "null"],
        description: "Nome do material que acabou ou está acabando (ex.: 'vassoura', 'água sanitária'). null se não for isso.",
      },
      avisar_dono: {
        type: "boolean",
        description: "true se o dono precisa saber agora (chuva forte, acidente, algo que muda o dia).",
      },
      encerrar_dia: {
        type: "boolean",
        description: "true somente se ela está dizendo claramente que não consegue continuar hoje.",
      },
    },
    required: ["resposta", "tipo_ocorrencia", "descricao", "impacto", "material", "avisar_dono", "encerrar_dia"],
  },
};

function systemPrompt(contexto: string): string {
  return `Você é o apoio de campo da Sureya, falando com a AJUDANTE que está no cemitério fazendo as limpezas.

QUEM É ELA
Uma pessoa trabalhando na rua, no sol, muitas vezes com as mãos sujas e o celular na pressa. Ela não tem paciência para texto longo nem para formalidade. Trate como uma colega de trabalho experiente: prática, direta, gentil.

SEU PAPEL
- Orientar sobre o dia (o que falta, onde é, o que exige atenção).
- Ouvir dificuldades (chuva, falta de água, material acabando, portão fechado, túmulo que não achou, mal-estar) e registrar.
- Quando algo impede o trabalho, tranquilize: o que não der hoje é remarcado, ninguém vai brigar. A segurança e o bem-estar dela vêm antes da meta.
- Se ela relatar mal-estar, calor forte ou qualquer risco à saúde, oriente parar e se hidratar — e avise o dono. Isso NUNCA é negociável por causa de meta.

REGRAS
- Responda em 1 a 3 frases curtas. Nada de listas longas nem de linguagem corporativa.
- Nunca prometa nada ao cliente final: você fala só com a ajudante.
- Se ela perguntar algo que você não sabe (valor, combinado com cliente), diga que vai confirmar com a Sureya.
- Estime o impacto com honestidade: se choveu e faltam 10 túmulos, o impacto é próximo de 10.

CONTEXTO DE HOJE
${contexto}

Responda SEMPRE chamando a ferramenta "registrar".`;
}

export async function conversarCampo(
  historico: { papel: "ajudante" | "sistema"; texto: string }[],
  contexto: string
): Promise<RespostaCampo> {
  const resp = await anthropic().messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 700,
    system: systemPrompt(contexto),
    messages: historico.map((h) => ({
      role: h.papel === "ajudante" ? ("user" as const) : ("assistant" as const),
      content: h.texto,
    })),
    tools: [ferramenta],
    tool_choice: { type: "tool", name: "registrar" },
  });

  const bloco = resp.content.find((b) => b.type === "tool_use");
  if (!bloco || bloco.type !== "tool_use") {
    return {
      resposta: "Anotei. Qualquer coisa me chama.",
      tipo_ocorrencia: null,
      descricao: null,
      impacto: 0,
      material: null,
      avisar_dono: false,
      encerrar_dia: false,
    };
  }
  return bloco.input as RespostaCampo;
}
