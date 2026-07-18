import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Corpo: { comprovanteId, aprovar: boolean }
// aprovar=true  -> comprovante e crédito viram 'confirmado' (entra no saldo)
// aprovar=false -> ambos 'rejeitado' (fora do saldo)
export async function POST(req: NextRequest) {
  const db = supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const comprovanteId: string = body?.comprovanteId;
  const aprovar: boolean = !!body?.aprovar;
  if (!comprovanteId) {
    return NextResponse.json({ ok: false, erro: "parametros" }, { status: 400 });
  }

  const { error } = await db.rpc("sureya_conciliar_comprovante", {
    p_comprovante: comprovanteId,
    p_aprovar: aprovar,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, status: aprovar ? "confirmado" : "rejeitado" });
}
