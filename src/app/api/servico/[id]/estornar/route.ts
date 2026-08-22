import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Estornar uma lavagem registrada por engano.
 *
 * Não apaga: anula. O registro fica visível com o motivo, e o valor cobrado
 * indevidamente volta como crédito na conta da família. Assim o extrato dela
 * conta a história inteira — inclusive que houve um erro e ele foi corrigido.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  const motivo = String(b?.motivo || "").trim();
  if (!motivo) {
    return NextResponse.json(
      { ok: false, erro: "Explique o que houve — isso fica registrado no extrato da família." },
      { status: 400 }
    );
  }

  const { data, error } = await auth.db.rpc("sureya_estornar_servico", {
    p_servico: params.id, p_motivo: motivo,
  });
  if (error) {
    const amigavel = error.message.includes("ja_estornado")
      ? "Esta lavagem já foi estornada."
      : error.message;
    return NextResponse.json({ ok: false, erro: amigavel }, { status: 400 });
  }

  const r = (Array.isArray(data) ? data[0] : data) || {};
  return NextResponse.json({
    ok: true,
    valorEstornado: Number(r.valor_estornado) || 0,
    movimento: r.movimento_estorno || null,
  });
}
