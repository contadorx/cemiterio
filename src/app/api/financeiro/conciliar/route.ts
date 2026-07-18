import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { calcularSaldo } from "@/lib/financeiro";
import { auditar } from "@/lib/auditoria";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Corpo: { comprovanteId, aprovar: boolean }
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => null);
  const comprovanteId: string = body?.comprovanteId;
  const aprovar: boolean = !!body?.aprovar;
  if (!comprovanteId) return NextResponse.json({ ok: false, erro: "parametros" }, { status: 400 });

  const { data: comp } = await db
    .from("comprovantes")
    .select("cliente_id")
    .eq("id", comprovanteId)
    .maybeSingle();

  const { error } = await db.rpc("sureya_conciliar_comprovante", {
    p_comprovante: comprovanteId,
    p_aprovar: aprovar,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // pagamento entrou e quitou? zera a régua de cobrança gentil
  if (aprovar && (comp as any)?.cliente_id) {
    const s = await calcularSaldo((comp as any).cliente_id);
    if (s.saldo >= -0.005) {
      await db
        .from("clientes")
        .update({ cobranca_nivel: 0, cobranca_em: null })
        .eq("id", (comp as any).cliente_id);
    }
  }

  const org = await orgAtual(db);
  if (org) {
    await auditar(db, org, auth.userId, aprovar ? "confirmou_pagamento" : "rejeitou_comprovante", { tipo: "comprovante", id: comprovanteId });
  }

  return NextResponse.json({ ok: true, status: aprovar ? "confirmado" : "rejeitado" });
}
