import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { gerarServicosDevidos, alocarAgenda } from "@/lib/agenda";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST { horizonteDias?, apenasGerar? }
// Devolve um diagnóstico completo, para a tela poder EXPLICAR o resultado
// (inclusive quando o resultado é "nada a fazer", que é o caso normal).
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  const horizonte = Math.max(1, Math.min(365, Number(b?.horizonteDias) || 30));

  const g = await gerarServicosDevidos(horizonte);
  const a = b?.apenasGerar ? { agendados: 0, dias: 0 } : await alocarAgenda();

  return NextResponse.json({ ok: true, geracao: g, alocacao: a });
}
