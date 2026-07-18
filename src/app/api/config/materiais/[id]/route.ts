import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH { estoque?, alertaMinimo?, unidade? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const b = await req.json().catch(() => ({}));
  const patch: Record<string, any> = { atualizado_em: new Date().toISOString() };
  if (b.estoque !== undefined) patch.estoque = Number(b.estoque) || 0;
  if (b.alertaMinimo !== undefined) patch.alerta_minimo = Number(b.alertaMinimo) || 0;
  if (b.unidade !== undefined) patch.unidade = String(b.unidade || "un");
  const { error } = await auth.db.from("materiais").update(patch).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const { error } = await auth.db.from("materiais").delete().eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
