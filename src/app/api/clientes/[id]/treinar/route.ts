import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseServer } from "@/lib/supabase-server";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let _cli: Anthropic | null = null;
function anthropic() {
  if (!_cli) _cli = new Anthropic({ apiKey: env.anthropicKey() });
  return _cli;
}

// POST { historico } — IA destila o histórico colado num perfil curto e salva em perfil_ia.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const historico = (body?.historico || "").trim();
  if (!historico) return NextResponse.json({ ok: false, erro: "historico_vazio" }, { status: 400 });

  try {
    const resp = await anthropic().messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 500,
      system:
        "Você recebe o histórico de conversa de um cliente de um serviço de limpeza de túmulos e destila um PERFIL curto para orientar futuros atendimentos. Escreva em tópicos curtos, 3ª pessoa: como a pessoa gosta de ser tratada, fatos-chave (túmulo, falecido, datas que pesam), hábitos de pagamento, combinados. Não invente nada que não esteja no histórico. Máximo ~8 linhas. Retorne só o perfil.",
      messages: [{ role: "user", content: historico.slice(0, 12000) }],
    });

    const perfil = resp.content
      .filter((b) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();

    const { error } = await db.from("clientes").update({ perfil_ia: perfil }).eq("id", params.id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, perfil });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "falha_ia" }, { status: 500 });
  }
}
