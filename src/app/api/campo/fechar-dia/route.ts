import { NextRequest, NextResponse } from "next/server";
import { exigirLogado } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { clima?, observacoes? } -> fecha o dia; o que não foi feito volta pro backlog
// com prioridade elevada (não some, e é retomado antes dos outros).
export async function POST(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;

  const body = await req.json().catch(() => ({}));
  const { data: membro } = await auth.db.from("membros").select("papel").limit(1).maybeSingle();
  const executoraId = (membro as any)?.papel === "campo" ? auth.userId : null;

  const { data, error } = await auth.db.rpc("sureya_fechar_dia", {
    p_executora: executoraId,
    p_data: new Date().toISOString().slice(0, 10),
    p_clima: body?.clima || null,
    p_observacoes: body?.observacoes || null,
  });

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  const r = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, devolvidos: r?.devolvidos ?? 0, feitos: r?.feitos ?? 0 });
}
