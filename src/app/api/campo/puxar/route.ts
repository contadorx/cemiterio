import { NextRequest, NextResponse } from "next/server";
import { exigirLogado } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { quantidade } -> puxa serviços do backlog/futuro para hoje
// (quando o dia rendeu mais do que o previsto).
export async function POST(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;

  const body = await req.json().catch(() => ({}));
  const quantidade = Math.max(1, Math.min(30, Number(body?.quantidade) || 5));

  const { data: membro } = await auth.db.from("membros").select("papel").limit(1).maybeSingle();
  const executoraId = (membro as any)?.papel === "campo" ? auth.userId : null;

  const { data, error } = await auth.db.rpc("sureya_puxar_servicos", {
    p_executora: executoraId,
    p_quantidade: quantidade,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, puxados: Number(data) || 0 });
}
