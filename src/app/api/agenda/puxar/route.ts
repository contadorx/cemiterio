import { NextRequest, NextResponse } from "next/server";
import { exigirLogado } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { quantidade, executoraId? } — traz serviços dos próximos dias para hoje
export async function POST(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;
  const b = await req.json().catch(() => ({}));
  const { data, error } = await auth.db.rpc("sureya_puxar_servicos", {
    p_executora: b?.executoraId || null,
    p_quantidade: Math.max(1, Math.min(30, Number(b?.quantidade) || 5)),
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, puxados: data || 0 });
}
