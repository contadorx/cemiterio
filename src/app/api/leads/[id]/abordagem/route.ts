import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { exigirAdmin } from "@/lib/roles";
import { env } from "@/lib/env";
import { carregarConfigIa } from "@/lib/context";
import { escolherModelo, registrarChamada } from "@/lib/modelo-ia";
import { podeChamarIa } from "@/lib/custo-ia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sugere a primeira mensagem de abordagem, a partir do contexto que a Sureya
 * escreveu. NÃO envia: devolve o texto para ela ler, ajustar e mandar.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  if (!(await podeChamarIa())) {
    return NextResponse.json({ ok: false, erro: "teto_ia_atingido" }, { status: 429 });
  }

  const { data: lead } = await auth.db
    .from("leads").select("nome,nome_wa,contexto,jazigo_ref,mensagens")
    .eq("id", params.id).maybeSingle();
  if (!lead) return NextResponse.json({ ok: false, erro: "lead_nao_encontrado" }, { status: 404 });

  const cfg = await carregarConfigIa();
  const escolha = await escolherModelo({ proposito: "redator", assunto: "outro" });
  const anthropic = new Anthropic({ apiKey: env.anthropicKey() });

  const msgs = Array.isArray((lead as any).mensagens) ? (lead as any).mensagens : [];
  const contexto = [
    `Nome: ${(lead as any).nome || (lead as any).nome_wa || "não sei"}`,
    (lead as any).jazigo_ref ? `Jazigo de interesse: ${(lead as any).jazigo_ref}` : "",
    (lead as any).contexto ? `O que sabemos: ${(lead as any).contexto}` : "",
    msgs.length ? `Ela já escreveu: ${msgs.map((m: any) => m.texto).join(" | ")}` : "",
  ].filter(Boolean).join("\n");

  try {
    const r = await anthropic.messages.create({
      model: escolha.modelo,
      max_tokens: 500,
      system:
        `Você escreve mensagens de WhatsApp para a Zelo & Memória — "Por Dona Nadir · Desde 1990".\n\n` +
        `${cfg.conhecimento || ""}\n\nTOM:\n${cfg.tom || ""}\n\n` +
        `Responda APENAS com o texto da mensagem. Sem aspas, sem explicação. Até 70 palavras.`,
      messages: [{
        role: "user",
        content:
          `Escreva a PRIMEIRA mensagem para esta pessoa, que ainda não é cliente.\n` +
          `Regras: apresente-se com naturalidade, mencione o que já se sabe dela (se houver), ` +
          `não seja vendedora nem insistente, e termine com uma pergunta leve que abra conversa. ` +
          `Se alguém indicou, cite quem indicou — é o que dá confiança.\n\n` +
          `CONTEXTO:\n${contexto}`,
      }],
    });
    await registrarChamada({ proposito: "redator", escolha, usage: (r as any).usage });
    const bloco = r.content.find((b: any) => b.type === "text") as any;
    return NextResponse.json({ ok: true, texto: String(bloco?.text || "").trim() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "falha_ia" }, { status: 500 });
  }
}
