import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?meses=12 — receita x custo por jazigo, do pior para o melhor
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const meses = Math.max(1, Math.min(60, Number(req.nextUrl.searchParams.get("meses")) || 12));

  const { data, error } = await auth.db.rpc("sureya_resultado_por_jazigo", { p_meses: meses });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const lista = (data || []).filter((x: any) => !String(x.cliente || "").startsWith("[TESTE]"));
  const semMedicao = lista.filter((x: any) => !x.minutos).length;
  const r2 = (n: number) => Math.round(n * 100) / 100;

  return NextResponse.json({
    ok: true, meses, jazigos: lista, semMedicao,
    totais: {
      receita: r2(lista.reduce((s: number, x: any) => s + Number(x.receita || 0), 0)),
      custo: r2(lista.reduce((s: number, x: any) => s + Number(x.custo_total || 0), 0)),
      margem: r2(lista.reduce((s: number, x: any) => s + Number(x.margem || 0), 0)),
      noPrejuizo: lista.filter((x: any) => Number(x.margem) < 0).length,
    },
  });
}
