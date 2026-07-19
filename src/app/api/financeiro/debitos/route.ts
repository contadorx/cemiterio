import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?cliente= — o que esta família ainda deve, lavagem por lavagem
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const cliente = req.nextUrl.searchParams.get("cliente");
  if (!cliente) return NextResponse.json({ ok: false, erro: "cliente_obrigatorio" }, { status: 400 });

  const { data, error } = await auth.db.rpc("sureya_debitos_em_aberto", { p_cliente: cliente });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const lista = data || [];
  const total = lista.reduce((s: number, x: any) => s + Number(x.em_aberto), 0);
  return NextResponse.json({
    ok: true, debitos: lista, total: Math.round(total * 100) / 100,
  });
}
