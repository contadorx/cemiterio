import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pagamento lançado direto no extrato, atrelado à família.
 * Para o caso de "pagou e não mandou o comprovante": entra marcado como
 * sem_comprovante, para você conferir no extrato do banco depois.
 */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const b = await req.json().catch(() => ({}));

  if (!b?.clienteId) return NextResponse.json({ ok: false, erro: "cliente_obrigatorio" }, { status: 400 });
  const valor = Number(b?.valor);
  if (!valor || valor <= 0) return NextResponse.json({ ok: false, erro: "valor_invalido" }, { status: 400 });

  const { data, error } = await auth.db.rpc("sureya_pagamento_avulso", {
    p_cliente: b.clienteId,
    p_valor: valor,
    p_data: b?.data || new Date().toISOString().slice(0, 10),
    p_descricao: b?.descricao || null,
    p_sem_comprovante: !!b?.semComprovante,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, movimentoId: data });
}
