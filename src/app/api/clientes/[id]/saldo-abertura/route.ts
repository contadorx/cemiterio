import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { valor, data?, nota? }
// valor POSITIVO = a família está em aberto (deve)
// valor NEGATIVO = a família tem crédito (pagou adiantado)
// Entra no razão como "Saldo de abertura (migração)". Rodar de novo substitui.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  const emAberto = Number(b?.valor);
  if (!isFinite(emAberto)) {
    return NextResponse.json({ ok: false, erro: "valor_invalido" }, { status: 400 });
  }

  // a RPC usa a convenção contábil (positivo = crédito), então invertemos aqui:
  // o que o usuário digita como "em aberto" é um débito.
  const { data, error } = await auth.db.rpc("sureya_saldo_abertura", {
    p_cliente: params.id,
    p_valor: -emAberto,
    p_data: b?.data || new Date().toISOString().slice(0, 10),
    p_nota: b?.nota || null,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, movimentoId: data });
}
