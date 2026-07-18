import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH { acao:'remarcar', novaData } | { acao:'pular' } | { acao:'cancelar' }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => ({}));
  const acao = body?.acao;

  if (acao === "remarcar") {
    const novaData = body?.novaData;
    if (!novaData) return NextResponse.json({ ok: false, erro: "novaData_obrigatoria" }, { status: 400 });
    const { error } = await db
      .from("servicos")
      .update({ data_prevista: novaData, status: "agendado", ordem_dia: null })
      .eq("id", params.id)
      .neq("status", "executado");
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (acao === "pular" || acao === "cancelar") {
    const status = acao === "pular" ? "pulado" : "cancelado";
    const { error } = await db
      .from("servicos")
      .update({ status })
      .eq("id", params.id)
      .neq("status", "executado");
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, erro: "acao_invalida" }, { status: 400 });
}
