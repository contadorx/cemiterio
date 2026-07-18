import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pagamentos lançados sem comprovante — a lista para bater contra o extrato.
 * A família disse que pagou, você registrou para não continuar cobrando, e
 * agora confere no banco e dá o visto.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const meses = Math.max(1, Math.min(24, Number(req.nextUrl.searchParams.get("meses")) || 6));

  const { data, error } = await auth.db.rpc("sureya_a_conferir_no_banco", { p_meses: meses });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const lista = data || [];
  const pendentes = lista.filter((x: any) => !x.conferido);
  const r2 = (n: number) => Math.round(n * 100) / 100;

  return NextResponse.json({
    ok: true,
    lancamentos: lista,
    totais: {
      pendentes: pendentes.length,
      valorPendente: r2(pendentes.reduce((s: number, x: any) => s + Number(x.valor), 0)),
      conferidos: lista.length - pendentes.length,
      maisAntigo: pendentes.length
        ? Math.max(...pendentes.map((x: any) => Number(x.dias_esperando) || 0))
        : 0,
    },
  });
}

// PUT { movimentoId, conferido, nota }
export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const b = await req.json().catch(() => ({}));
  if (!b?.movimentoId) {
    return NextResponse.json({ ok: false, erro: "movimento_obrigatorio" }, { status: 400 });
  }
  const { data, error } = await auth.db.rpc("sureya_conferir_no_banco", {
    p_movimento: b.movimentoId,
    p_conferido: b?.conferido !== false,
    p_nota: b?.nota || null,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: !!data });
}
