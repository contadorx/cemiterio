import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Corpo: { clienteId, valor, data (yyyy-mm-dd), descricao? }
// Entra já confirmado — é o Pix que a pessoa viu no extrato do banco.
export async function POST(req: NextRequest) {
  const db = supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

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

  return NextResponse.json({ ok: true, movimentoId: movId });
}
