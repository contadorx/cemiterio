import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";

/**
 * UMA PORTA PARA DOIS PROVEDORES.
 *
 * A casa passa a poder escolher entre Anthropic e DeepSeek por linha da tabela
 * `modelos_ia`. O motivo é preço: o mesmo trabalho de rascunhar uma resposta
 * custa ordens de grandeza diferentes conforme quem escreve, e depois de 03/09
 * (US$ 348 numa noite) essa escolha deixou de ser detalhe.
 *
 * O QUE ESTA CAMADA GARANTE, e é o que justifica ela existir:
 *
 *   · o resto do sistema pede a MESMA coisa aos dois — um objeto estruturado,
 *     validado pelo mesmo esquema de ferramenta;
 *   · quem chama recebe `null` quando não veio estrutura, dos dois lados, em
 *     vez de texto solto que alguém teria de adivinhar como ler;
 *   · o consumo volta no MESMO formato, para o custo ser contado igual — sem
 *     isso o teto de gasto só enxergaria metade do que se gasta.
 *
 * DeepSeek fala o dialeto da OpenAI (`/chat/completions`, `tools` com
 * `function`), e Anthropic fala o seu (`/messages`, `tools` com
 * `input_schema`). A tradução mora aqui e em nenhum outro lugar.
 */

export type Provedor = "anthropic" | "deepseek";

export interface Ferramenta {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface Conversa {
  role: "user" | "assistant";
  content: string;
}

export interface RespostaIa {
  /** Os argumentos da ferramenta, ou `null` se o modelo não estruturou. */
  dados: Record<string, unknown> | null;
  /** O texto solto, quando a chamada foi feita SEM ferramenta. */
  texto: string;
  tokensEntrada: number;
  tokensSaida: number;
}

function anthropic(): Anthropic {
  return new Anthropic({ apiKey: env.anthropicKey() });
}

/** Chama o provedor certo e devolve sempre o mesmo formato. */
export async function conversarComIa(p: {
  provedor: Provedor;
  modelo: string;
  system: string;
  messages: Conversa[];
  /** Sem ela, a resposta vem como texto solto em `texto`. */
  ferramenta?: Ferramenta;
  maxTokens?: number;
  temperatura?: number;
}): Promise<RespostaIa> {
  const maxTokens = p.maxTokens ?? 1024;

  if (p.provedor === "deepseek") {
    const chave = env.deepseekKey();
    // SEM CHAVE NÃO SE FINGE QUE DEU CERTO. Devolver `dados: null` faria a tela
    // dizer "a IA não estruturou a resposta" sobre uma chave que falta — e
    // alguém passaria a tarde procurando defeito no prompt.
    if (!chave) throw new Error("DEEPSEEK_API_KEY não está configurada");

    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
      body: JSON.stringify({
        model: p.modelo,
        max_tokens: maxTokens,
        ...(p.temperatura !== undefined ? { temperature: p.temperatura } : {}),
        messages: [{ role: "system", content: p.system }, ...p.messages],
        ...(p.ferramenta ? {
          tools: [{
            type: "function",
            function: {
              name: p.ferramenta.name,
              description: p.ferramenta.description,
              parameters: p.ferramenta.input_schema,
            },
          }],
          tool_choice: { type: "function", function: { name: p.ferramenta.name } },
        } : {}),
      }),
    });

    if (!r.ok) {
      const detalhe = await r.text().catch(() => "");
      throw new Error(`DeepSeek recusou (${r.status}): ${detalhe.slice(0, 300)}`);
    }

    const j = await r.json();
    const chamada = j?.choices?.[0]?.message?.tool_calls?.[0];
    let dados: Record<string, unknown> | null = null;
    if (chamada?.function?.arguments) {
      // O DIALETO DA OPENAI DEVOLVE OS ARGUMENTOS COMO TEXTO JSON, e não como
      // objeto. Um `JSON.parse` que estoura aqui derrubaria a rota inteira por
      // causa de uma vírgula do modelo: vira `null`, que já é o caminho tratado.
      try { dados = JSON.parse(chamada.function.arguments); } catch { dados = null; }
    }
    return {
      dados,
      texto: String(j?.choices?.[0]?.message?.content || "").trim(),
      tokensEntrada: Number(j?.usage?.prompt_tokens) || 0,
      tokensSaida: Number(j?.usage?.completion_tokens) || 0,
    };
  }

  const resp = await anthropic().messages.create({
    model: p.modelo,
    max_tokens: maxTokens,
    ...(p.temperatura !== undefined ? { temperature: p.temperatura } : {}),
    system: p.system,
    messages: p.messages,
    ...(p.ferramenta ? {
      tools: [p.ferramenta as any],
      tool_choice: { type: "tool" as const, name: p.ferramenta.name },
    } : {}),
  });

  const bloco = resp.content.find((b) => b.type === "tool_use");
  return {
    dados: !bloco || bloco.type !== "tool_use" ? null : (bloco.input as Record<string, unknown>),
    texto: resp.content.filter((c: any) => c.type === "text")
                       .map((c: any) => c.text).join("\n").trim(),
    tokensEntrada: Number((resp as any).usage?.input_tokens) || 0,
    tokensSaida: Number((resp as any).usage?.output_tokens) || 0,
  };
}
