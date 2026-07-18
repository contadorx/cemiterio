import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { calcularSaldo } from "@/lib/financeiro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Corpo: { clienteId, valor, data (yyyy-mm-dd), descricao? }
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => null);
  const clienteId: string = body?.clienteId;
  const valor: number = Number(body?.valor);
  const data: string = body?.data;
  const descricao: string | undefined = body?.descricao;

  if (!clienteId || !valor || valor <= 0 || !data) {
    return NextResponse.json({ ok: false, erro: "parametros" }, { status: 400 });
  }

  const { data: movId, error } = await db.rpc("sureya_registrar_pagamento_manual", {
    p_cliente: clienteId,
    p_valor: valor,
    p_data: data,
    p_descricao: descricao || null,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const s = await calcularSaldo(clienteId);
  if (s.saldo >= -0.005) {
    await db.from("clientes").update({ cobranca_nivel: 0, cobranca_em: null }).eq("id", clienteId);
  }

  return NextResponse.json({ ok: true, movimentoId: movId });
}
