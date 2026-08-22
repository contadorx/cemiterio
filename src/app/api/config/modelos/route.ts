import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);

  const [{ data: modelos }, { data: o }, { data: uso }] = await Promise.all([
    auth.db.from("modelos_ia").select("*").order("preco_saida"),
    auth.db.from("orgs").select("assuntos_sempre_manual,teto_ia_dia").eq("id", org).maybeSingle(),
    auth.db.from("chamadas_ia")
      .select("apelido,custo,tokens_entrada,tokens_saida")
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()),
  ]);

  // quanto cada nível custou de fato nos últimos 30 dias
  const porNivel: Record<string, { chamadas: number; custo: number }> = {};
  for (const c of (uso || []) as any[]) {
    const k = c.apelido || "?";
    porNivel[k] ||= { chamadas: 0, custo: 0 };
    porNivel[k].chamadas++;
    porNivel[k].custo += Number(c.custo) || 0;
  }
  for (const k of Object.keys(porNivel)) {
    porNivel[k].custo = Math.round(porNivel[k].custo * 100) / 100;
  }

  return NextResponse.json({
    ok: true,
    modelos: modelos || [],
    assuntosManual: (o as any)?.assuntos_sempre_manual || [],
    tetoDia: (o as any)?.teto_ia_dia ?? 0,
    uso30dias: porNivel,
  });
}

// PUT { id, modelo?, preco_entrada?, preco_saida? }
export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const b = await req.json().catch(() => ({}));
  if (!b?.id) return NextResponse.json({ ok: false, erro: "id_obrigatorio" }, { status: 400 });

  const patch: Record<string, any> = {};
  if (b.modelo) patch.modelo = String(b.modelo).trim();
  if (b.preco_entrada !== undefined) patch.preco_entrada = Number(b.preco_entrada) || 0;
  if (b.preco_saida !== undefined) patch.preco_saida = Number(b.preco_saida) || 0;

  const { error } = await auth.db.from("modelos_ia").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
