import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { registrarCompra, aplicarConsumoSugerido } from "@/lib/consumo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { materialId, quantidade, valorTotal, data }
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const b = await req.json().catch(() => ({}));
  if (!b?.materialId || !b?.quantidade) {
    return NextResponse.json({ ok: false, erro: "dados_incompletos" }, { status: 400 });
  }
  const r = await registrarCompra({
    materialId: b.materialId,
    quantidade: Number(b.quantidade),
    valorTotal: Number(b.valorTotal) || 0,
    data: b.data,
  });
  return NextResponse.json({ ok: true, ...r });
}

// PUT { compraId } — aprova a nova estimativa de consumo
export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const b = await req.json().catch(() => ({}));
  const ok = await aplicarConsumoSugerido(String(b?.compraId || ""));
  return NextResponse.json({ ok });
}
