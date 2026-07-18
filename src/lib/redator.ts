import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import { montarContexto, carregarConfigIa, historicoConversa } from "./context";
import { podeChamarIa } from "./custo-ia";
import { escolherModelo, registrarChamada } from "./modelo-ia";

/**
 * REDATOR — escreve mensagens olhando o contexto real da família.
 *
 * Vale para reajuste, campanha e pedido de avaliação. Antes esses textos eram
 * modelos fixos com {nome} trocado; agora a IA lê o histórico, o saldo, o tempo
 * de casa e o tratamento para escrever algo que faça sentido para AQUELA família.
 *
 * Nada é enviado: sai sempre como rascunho para revisão.
 */

export type Proposito = "reajuste" | "campanha" | "avaliacao";

const INSTRUCAO: Record<Proposito, string> = {
  reajuste:
    "Escreva uma mensagem propondo um reajuste de valor. Seja direta sobre o novo valor, " +
    "mas com muito cuidado: reconheça o tempo de casa, explique que os custos subiram e que o " +
    "preço estava parado há muito tempo. Nunca use tom de aviso ou imposição — é um convite a " +
    "conversar. Deixe claro que, se ficar difícil, é só falar que vocês encontram um jeito.",
  campanha:
    "Escreva a mensagem da campanha para esta família em particular, partindo do modelo dado. " +
    "Adapte ao histórico dela: se é cliente antiga, reconheça; se está devendo, NÃO mencione " +
    "valores; se acabou de contratar, seja mais explicativa.",
  avaliacao:
    "Escreva um pedido curto e leve de avaliação do serviço. Nada de formulário nem de insistência: " +
    "é a Sureya perguntando se está tudo do jeito que a família gosta. Mencione a última limpeza " +
    "se fizer sentido.",
};

export interface PedidoRedacao {
  clienteId: string;
  proposito: Proposito;
  dados?: Record<string, any>;   // valores do reajuste, modelo da campanha, link etc.
}

export async function redigir(p: PedidoRedacao): Promise<string | null> {
  if (!(await podeChamarIa())) return null;

  const db = supabaseAdmin();
  const org = env.orgId();

  const { data: cliente } = await db
    .from("clientes").select("*").eq("org_id", org).eq("id", p.clienteId).maybeSingle();
  if (!cliente) return null;

  const ctx = await montarContexto(cliente as any);
  const cfg = await carregarConfigIa();

  // últimas trocas com esta família, para pegar o jeito da conversa
  const { data: conv } = await db
    .from("conversas").select("id").eq("org_id", org).eq("cliente_id", p.clienteId)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const historico = conv ? await historicoConversa((conv as any).id, 12) : [];

  const anthropic = new Anthropic({ apiKey: env.anthropicKey() });

  const contexto = [
    `Família: ${ctx.nome}`,
    `Tratamento: ${ctx.tratamento || "não definido"}`,
    `Situação de pagamento: ${ctx.saldoTexto}`,
    `Última limpeza: ${ctx.ultimoServico || "sem registro"}`,
    `Próxima prevista: ${ctx.proximoServico || "não agendada"}`,
    `Jazigos: ${ctx.tumulos.map((t) => t.identificacao).join(", ") || "—"}`,
    ctx.perfilIa ? `O que sabemos: ${ctx.perfilIa}` : "",
    ctx.instrucoesIa ? `Instruções específicas: ${ctx.instrucoesIa}` : "",
    (cliente as any).observacoes ? `Observações: ${(cliente as any).observacoes}` : "",
    p.dados ? `Dados desta mensagem: ${JSON.stringify(p.dados)}` : "",
  ].filter(Boolean).join("\n");

  const conversa = historico.length
    ? "\n\nÚLTIMAS TROCAS COM ESTA FAMÍLIA:\n" +
      historico.map((m: any) => (m.role === "user" ? "Família: " : "Nós: ") + m.content).join("\n")
    : "";

  const sistema =
    `Você escreve mensagens de WhatsApp para a Zelo & Memória — "Por Dona Nadir · Desde 1990".\n\n` +
    `${cfg.conhecimento || ""}\n\nTOM:\n${cfg.tom || ""}\n\n` +
    `Responda APENAS com o texto da mensagem, pronto para enviar. Sem aspas, sem explicação, ` +
    `sem assinatura de sistema. Português do Brasil. Até 90 palavras.`;

  try {
    const escolha = await escolherModelo({
      proposito: "redator",
      assunto: p.proposito === "reajuste" ? "cobranca" : "outro",
      score: Number((cliente as any).score) || 0,
    });

    const r = await anthropic.messages.create({
      model: escolha.modelo,
      max_tokens: 600,
      system: sistema,
      messages: [{
        role: "user",
        content: `${INSTRUCAO[p.proposito]}\n\nCONTEXTO DESTA FAMÍLIA:\n${contexto}${conversa}`,
      }],
    });
    await registrarChamada({
      proposito: "redator", escolha, usage: (r as any).usage, clienteId: p.clienteId,
    });

    const bloco = r.content.find((b: any) => b.type === "text") as any;
    const texto = String(bloco?.text || "").trim();
    return texto || null;
  } catch (e) {
    console.error("[redator] falhou:", (e as any)?.message || e);
    return null;
  }
}
