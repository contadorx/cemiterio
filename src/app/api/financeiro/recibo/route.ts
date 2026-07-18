import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?movimentoId=... -> dados do recibo de um pagamento (crédito confirmado)
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const movimentoId = req.nextUrl.searchParams.get("movimentoId");
  if (!movimentoId) return NextResponse.json({ ok: false, erro: "parametros" }, { status: 400 });

  const { data: mov } = await db
    .from("movimentos")
    .select("id,valor,data,tipo,status_conc,descricao,cliente_id,clientes(nome)")
    .eq("id", movimentoId)
    .maybeSingle();

  if (!mov || (mov as any).tipo !== "credito") {
    return NextResponse.json({ ok: false, erro: "nao_e_pagamento" }, { status: 400 });
  }

  const { data: org } = await db.from("orgs").select("nome").eq("id", env.orgId()).maybeSingle();

  return NextResponse.json({
    ok: true,
    recibo: {
      numero: (mov as any).id.slice(0, 8).toUpperCase(),
      cliente: (mov as any).clientes?.nome || "—",
      valor: Number((mov as any).valor),
      data: (mov as any).data,
      descricao: (mov as any).descricao || "Pagamento de serviço de limpeza",
      emitente: (org as any)?.nome || "Sureya",
    },
  });
}
