import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESES: Record<string, number> = {
  mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12, avulso: 0, por_data: 0,
};

// PATCH — edita o plano do jazigo, incluindo os campos da migração.
// valor_vigente (o que se cobra no ciclo) é sempre recalculado a partir do
// valor mensal × meses da cadência, para não haver duas verdades.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const b = await req.json().catch(() => ({}));
  const patch: Record<string, any> = {};

  for (const c of ["pago_ate", "proxima_cobranca", "proximo_servico"]) {
    if (b[c] !== undefined) patch[c] = b[c] || null;
  }
  if (b.ativo !== undefined) patch.ativo = !!b.ativo;
  if (b.qtd_por_passagem !== undefined) patch.qtd_por_passagem = Math.max(1, Number(b.qtd_por_passagem) || 1);

  // cadência e/ou valor mensal mudaram? recalcula a cobrança do ciclo
  if (b.cadencia !== undefined || b.valor_mensal !== undefined) {
    const { data: atual } = await db
      .from("planos").select("cadencia,valor_mensal,valor_vigente").eq("id", params.id).maybeSingle();
    const cadencia = b.cadencia ?? (atual as any)?.cadencia;
    const mensal = Number(b.valor_mensal ?? (atual as any)?.valor_mensal ?? 0);
    const meses = MESES[cadencia] ?? 1;
    if (b.cadencia !== undefined) patch.cadencia = cadencia;
    if (b.valor_mensal !== undefined) patch.valor_mensal = mensal;
    patch.valor_vigente = meses > 0 ? Math.round(mensal * meses * 100) / 100 : mensal;
  }

  if (b.migrado !== undefined) patch.migrado_em = b.migrado ? new Date().toISOString() : null;

  if (!Object.keys(patch).length) {
    return NextResponse.json({ ok: false, erro: "nada_para_atualizar" }, { status: 400 });
  }
  const { error } = await db.from("planos").update(patch).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, valorCiclo: patch.valor_vigente });
}
