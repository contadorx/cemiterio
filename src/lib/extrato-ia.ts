import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";
import { extrairRemetente, type LinhaExtrato } from "./extrato";

let _cli: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_cli) _cli = new Anthropic({ apiKey: env.anthropicKey() });
  return _cli;
}

/**
 * O PDF VAI PARA A IA — E VOLTA PARA O MESMO JUIZ.
 *
 * Ler dez páginas de extrato com um modelo seria imprudente se o resultado
 * entrasse direto no razão. Não entra: as linhas voltam para `conferir()`, que
 * refaz o saldo movimento a movimento. Se o modelo pular uma linha, inventar
 * uma, ou trocar crédito por débito, a soma não fecha e a importação para —
 * com o dedo na linha exata.
 *
 * É a mesma disciplina que eu usei à mão para provar que a extração do extrato
 * de agosto estava certa: 6.111,21 + 538,82 = 6.650,03, e zero linhas em que o
 * delta discordasse do valor impresso.
 *
 * O SALDO É OBRIGATÓRIO NA RESPOSTA. Sem ele não há prova, e sem prova este
 * caminho não deveria existir.
 */

const ferramenta = {
  name: "registrar_movimentos",
  description:
    "Registra TODOS os movimentos do extrato bancário, na ordem em que aparecem. Use SEMPRE.",
  input_schema: {
    type: "object" as const,
    properties: {
      saldo_inicial: {
        type: ["number", "null"],
        description:
          "O saldo ANTES do primeiro movimento desta parte, se o extrato declarar (linha de saldo anterior). null se não houver.",
      },
      movimentos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            data: { type: "string", description: "AAAA-MM-DD" },
            tipo: { type: "string", enum: ["credito", "debito"] },
            valor: { type: "number", description: "Sempre positivo. O lado vai em tipo." },
            historico: { type: "string", description: "A descrição como está no extrato, incluindo a linha REM: se houver." },
            documento: { type: ["string", "null"], description: "Nº do documento/docto, se houver." },
            saldo_apos: { type: ["number", "null"], description: "O saldo impresso NESTA linha. Copie exatamente." },
          },
          required: ["data", "tipo", "valor", "historico", "documento", "saldo_apos"],
        },
      },
    },
    required: ["saldo_inicial", "movimentos"],
  },
};

const INSTRUCAO =
  "Você transcreve extratos bancários brasileiros. Copie TODOS os movimentos, "
  + "na ordem, sem pular nenhum e sem resumir. Regras que não podem ser quebradas:\n"
  + "1. `valor` é sempre POSITIVO — o lado do dinheiro vai em `tipo`.\n"
  + "2. `saldo_apos` é o saldo impresso naquela linha, copiado exatamente. Ele é "
  + "conferido depois: se faltar um movimento, a conta não fecha e o arquivo é recusado.\n"
  + "3. Quando a data aparece só na primeira linha de um grupo, repita-a nas seguintes.\n"
  + "4. Rendimento, tarifa, compra no cartão e transferência são movimentos como "
  + "qualquer outro — entram na lista.\n"
  + "5. Não invente, não arredonde e não corrija o extrato.";

export async function lerExtratoPorIa(
  pdf: Buffer,
): Promise<{ linhas: LinhaExtrato[]; saldoInicial: number | null; erro?: string }> {
  try {
    const resp = await anthropic().messages.create({
      model: env.ANTHROPIC_MODEL,
      // Um extrato de mês cheio passa de 150 linhas; teto curto trunca a
      // resposta no meio e a conferência reprova sem dizer que foi corte.
      max_tokens: 16000,
      system: INSTRUCAO,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document" as const,
              source: { type: "base64" as const, media_type: "application/pdf" as const, data: pdf.toString("base64") },
            },
            { type: "text", text: "Transcreva todos os movimentos deste extrato." },
          ] as any,
        },
      ],
      tools: [ferramenta],
      tool_choice: { type: "tool", name: "registrar_movimentos" },
    });

    const b = resp.content.find((x) => x.type === "tool_use");
    if (!b || b.type !== "tool_use") {
      return { linhas: [], saldoInicial: null, erro: "Não consegui ler este PDF." };
    }
    const dados = b.input as any;
    const linhas: LinhaExtrato[] = (dados?.movimentos || [])
      .filter((m: any) => m?.data && m?.valor > 0 && (m.tipo === "credito" || m.tipo === "debito"))
      .map((m: any) => ({
        data: String(m.data).slice(0, 10),
        tipo: m.tipo,
        valor: Math.abs(Number(m.valor)),
        historico: String(m.historico || "").replace(/\s+/g, " ").trim(),
        // O MESMO extrator de remetente dos outros formatos, e não um segundo
        // jeito de achar o nome só porque veio de PDF.
        remetente: extrairRemetente(String(m.historico || "")),
        documento: m.documento ? String(m.documento).trim() : null,
        saldoApos: m.saldo_apos == null ? null : Number(m.saldo_apos),
      }));

    if (resp.stop_reason === "max_tokens") {
      return {
        linhas, saldoInicial: dados?.saldo_inicial ?? null,
        erro:
          "O extrato é grande demais para uma leitura só e a transcrição foi cortada no meio. "
          + "Baixe em OFX (é o formato do banco e não tem esse limite) ou importe mês a mês.",
      };
    }
    return { linhas, saldoInicial: dados?.saldo_inicial ?? null };
  } catch (e: any) {
    return { linhas: [], saldoInicial: null, erro: String(e?.message || e) };
  }
}
