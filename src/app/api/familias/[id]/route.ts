import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O CONTRATO DA FAMÍLIA.
 *
 * Valor, frequência de pagamento e início de cobrança moram aqui — a Sureya
 * combina UM valor com a família, mesmo que ela tenha dois túmulos. Isto já
 * esteve no túmulo, e lá gerava duas cobranças para quem tem duas pedras.
 *
 * A periodicidade da limpeza NÃO está aqui: ela é do túmulo, porque pode ser
 * diferente em cada um.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const { data, error } = await auth.db
    .from("familias")
    .select("id,nome,observacoes,valor_mensal,valor_base,freq_pagamento,inicio_cobranca,contratado")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, erro: "nao_encontrada" }, { status: 404 });

  return NextResponse.json({ ok: true, familia: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  const patch: Record<string, any> = {};

  if (b.nome !== undefined) patch.nome = String(b.nome || "").trim() || null;
  if (b.observacoes !== undefined) patch.observacoes = String(b.observacoes || "").trim() || null;
  if (b.contratado !== undefined) patch.contratado = !!b.contratado;

  if (b.valor_mensal !== undefined) {
    const v = Number(String(b.valor_mensal).replace(",", "."));
    patch.valor_mensal = isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
  }

  if (b.valor_base !== undefined) patch.valor_base = b.valor_base || "mes";
  if (b.freq_pagamento !== undefined) patch.freq_pagamento = b.freq_pagamento || null;

  // Sempre o dia 1: competência é mês, não dia. Guardar "15/03" faria a
  // comparação com "2026-03-01" falhar em silêncio, e a família receberia (ou
  // deixaria de receber) cobrança sem motivo aparente.
  if (b.inicio_cobranca !== undefined) {
    const v = String(b.inicio_cobranca || "");
    patch.inicio_cobranca = /^\d{4}-\d{2}/.test(v) ? `${v.slice(0, 7)}-01` : null;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ ok: false, erro: "nada_para_mudar" }, { status: 400 });
  }

  patch.updated_at = new Date().toISOString();

  const { error } = await auth.db.from("familias").update(patch).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
