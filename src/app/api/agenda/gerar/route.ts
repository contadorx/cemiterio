import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { gerarServicosDevidos, alocarAgenda } from "@/lib/agenda";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { horizonteDias? } — gera serviços dos planos vencidos e distribui nos dias.
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => ({}));
  const horizonte = Number(body?.horizonteDias) || 30;

  const ger = await gerarServicosDevidos(horizonte);
  const alo = await alocarAgenda();

  return NextResponse.json({ ok: true, gerados: ger.criados, ...alo });
}
