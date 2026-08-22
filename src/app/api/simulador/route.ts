import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { exigirAdmin } from "@/lib/roles";
import { env } from "@/lib/env";
import { montarSystemPrompt, responderTool } from "@/lib/persona";
import { carregarConfigIa, carregarDadosCasa } from "@/lib/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

let _cli: Anthropic | null = null;
function anthropic() {
  if (!_cli) _cli = new Anthropic({ apiKey: env.anthropicKey() });
  return _cli;
}

// POST { historico: [{papel:'cliente'|'ia', texto}], cenario? }
// Simula o atendimento SEM enviar nada no WhatsApp e SEM gravar no banco.
// Serve para testar/afinar o conhecimento-base e o tom antes de ligar pra valer.
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const body = await req.json().catch(() => ({}));
  const historico: { papel: string; texto: string }[] = Array.isArray(body?.historico) ? body.historico : [];
  if (!historico.length) return NextResponse.json({ ok: false, erro: "historico_vazio" }, { status: 400 });

  const cfg = await carregarConfigIa();
  const casa = await carregarDadosCasa();

  // contexto fictício de teste (não toca em cliente real)
  const ctx = {
    nome: body?.cenario?.nome || "Maria (teste)",
    telefone: "0000000000",
    saldoTexto: body?.cenario?.saldo || "em dia",
    // precisa ser LISTA (era texto e quebrava o prompt com "tumulos.map is not a function")
    tumulos: Array.isArray(body?.cenario?.tumulos)
      ? body.cenario.tumulos
      : [{ identificacao: "Família Exemplo", falecido: null, quadra: "QD 1 · RUA 1" }],
    varosJazigos: Array.isArray(body?.cenario?.tumulos) && body.cenario.tumulos.length > 1,
    proximoServico: body?.cenario?.proximo || "próxima limpeza em 5 dias",
    ultimoServico: body?.cenario?.ultimo || "última limpeza há 25 dias",
    plano: body?.cenario?.plano || "mensal, 2 limpezas por vez, R$ 40 cada",
    perfil: body?.cenario?.perfil || null,
    reguaCobranca: body?.cenario?.regua || "padrao",
    tratamento: body?.cenario?.tratamento || "a senhora",
    instrucoes: body?.cenario?.instrucoes || null,
    chavePix: casa.chavePix,
  } as any;

  try {
    const resp = await anthropic().messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: montarSystemPrompt(ctx, { conhecimento: cfg.conhecimento, tom: cfg.tom }),
      messages: historico.map((h) => ({
        role: h.papel === "cliente" ? ("user" as const) : ("assistant" as const),
        content: h.texto,
      })),
      tools: [responderTool],
      tool_choice: { type: "tool", name: "responder" },
    });

    const bloco = resp.content.find((b) => b.type === "tool_use");
    if (!bloco || bloco.type !== "tool_use") {
      return NextResponse.json({ ok: false, erro: "sem_resposta_estruturada" }, { status: 500 });
    }
    const out = bloco.input as any;

    return NextResponse.json({
      ok: true,
      resposta: out.resposta,
      assunto: out.assunto,
      sensivel: out.sensivel,
      precisaHumano: out.precisa_humano,
      confianca: out.confianca,
      motivo: out.motivo,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "falha_ia" }, { status: 500 });
  }
}
