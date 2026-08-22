import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { acao:'emitir'|'revogar' } -> gera/rotaciona ou revoga o token do portal.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => ({}));
  const acao = body?.acao;

  if (acao === "revogar") {
    const { error } = await db.rpc("sureya_revogar_token_portal", { p_tumulo: params.id });
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, token: null });
  }

  const { data, error } = await db.rpc("sureya_emitir_token_portal", { p_tumulo: params.id });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, token: data });
}
