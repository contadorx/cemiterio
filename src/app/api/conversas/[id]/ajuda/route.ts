import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { exigirAdmin } from "@/lib/roles";
import { env } from "@/lib/env";
import { orgAtual } from "@/lib/org";
import { montarContexto, carregarConfigIa, historicoConversa } from "@/lib/context";
import { escolherModelo, registrarChamada } from "@/lib/modelo-ia";
import { podeChamarIa } from "@/lib/custo-ia";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * "Me ajuda a escrever" — a Sureya dá o contexto e escolhe o tom;
 * a IA devolve TRÊS caminhos diferentes, não três versões da mesma frase.
 * Ela escolhe um, ajusta e envia. Nada sai daqui sozinho.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  if (!(await podeChamarIa())) {
    return NextResponse.json({ ok: false, erro: "teto_ia_atingido" }, { status: 429 });
  }
  const org = await orgAtual(auth.db);
  const b = await req.json().catch(() => ({}));

  const { data: conv } = await auth.db
    .from("conversas").select("cliente_id,ultimo_assunto").eq("id", params.id).maybeSingle();
  if (!conv) return NextResponse.json({ ok: false, erro: "conversa_nao_encontrada" }, { status: 404 });

  const { data: cliente } = await auth.db
    .from("clientes").select("*").eq("id", (conv as any).cliente_id).maybeSingle();
  if (!cliente) return NextResponse.json({ ok: false, erro: "cliente_nao_encontrado" }, { status: 404 });

  const ctx = await montarContexto(cliente as any);
  const cfg = await carregarConfigIa();
  const historico = await historicoConversa(params.id, 16);

  const conversa = historico
    .map((m: any) => (m.role === "user" ? "Família: " : "Eu: ") + m.content)
    .join("\n");

  const tom = String(b?.tom || "acolhedor");
  const instrucaoTom: Record<string, string> = {
    acolhedor: "Tom acolhedor: mais calor, mais tempo, sem pressa.",
    objetivo: "Tom objetivo: direto e claro, sem frieza.",
    firme: "Tom firme: educado mas sem deixar dúvida, sem ameaçar nem constranger.",
  };

  const escolha = await escolherModelo({
    proposito: "redator",
    assunto: (conv as any).ultimo_assunto,
    score: Number((cliente as any).score) || 0,
  });

  const anthropic = new Anthropic({ apiKey: env.anthropicKey() });

  try {
    const r = await anthropic.messages.create({
      model: escolha.modelo,
      max_tokens: 1200,
      system:
        `Você É a Sureya, da Zelo & Memória, escrevendo no WhatsApp.\n` +
        `NUNCA se refira à Sureya na terceira pessoa — você é ela.\n\n` +
        `${cfg.conhecimento || ""}\n\nTOM DA CASA:\n${cfg.tom || ""}\n\n` +
        `Responda APENAS com um JSON no formato:\n` +
        `{"opcoes":[{"titulo":"...","texto":"..."},{"titulo":"...","texto":"..."},{"titulo":"...","texto":"..."}]}\n` +
        `Sem markdown, sem crases, sem explicação. Cada texto até 80 palavras.`,
      messages: [{
        role: "user",
        content:
          `Preciso responder esta família. Me dê TRÊS caminhos DIFERENTES de resposta ` +
          `(não três versões da mesma frase): cada um com um título curto dizendo o que ele faz.\n\n` +
          `${instrucaoTom[tom] || instrucaoTom.acolhedor}\n\n` +
          `FAMÍLIA: ${ctx.nome} · tratamento: ${ctx.tratamento || "não definido"}\n` +
          `Pagamento: ${ctx.saldoTexto}\n` +
          `Jazigos: ${ctx.tumulos.map((t) => t.identificacao).join(", ") || "—"}\n` +
          (ctx.perfilIa ? `O que sei dela: ${ctx.perfilIa}\n` : "") +
          `\nCONVERSA ATÉ AQUI:\n${conversa || "(sem histórico)"}\n` +
          (b?.contexto ? `\nO QUE EU QUERO DIZER (use isto como base):\n${b.contexto}\n` : ""),
      }],
    });

    await registrarChamada({
      proposito: "redator", escolha, usage: (r as any).usage,
      assunto: (conv as any).ultimo_assunto, clienteId: (cliente as any).id,
    });

    const bloco = r.content.find((x: any) => x.type === "text") as any;
    const bruto = String(bloco?.text || "").replace(/```json|```/g, "").trim();

    let opcoes: { titulo: string; texto: string }[] = [];
    try {
      opcoes = JSON.parse(bruto)?.opcoes || [];
    } catch {
      opcoes = [{ titulo: "Sugestão", texto: bruto }];
    }

    // guarda o pedido, para virar aprendizado depois
    const adm = supabaseAdmin();
    await adm.from("pedidos_ajuda").insert({
      org_id: org,
      conversa_id: params.id,
      cliente_id: (cliente as any).id,
      contexto: b?.contexto || null,
      tom,
      sugestoes: opcoes,
    });

    return NextResponse.json({ ok: true, opcoes });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "falha_ia" }, { status: 500 });
  }
}
