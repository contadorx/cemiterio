import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { gerarServicosDevidos, alocarAgenda } from "@/lib/agenda";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { horizonteDias? } — gera serviços dos planos vencidos e distribui nos dias.
export async function POST(req: NextRequest) {
  const db = supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const horizonte = Number(body?.horizonteDias) || 30;

  const ger = await gerarServicosDevidos(horizonte);
  const alo = await alocarAgenda();

  return NextResponse.json({ ok: true, gerados: ger.criados, ...alo });
}
