import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { gerarCalendarioMes } from "@/lib/agenda";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST { mes: "2026-11", incluirAvulsos?, dataAvulsos?, distribuir? }
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  const mes = String(b?.mes || "").match(/^\d{4}-\d{2}$/) ? b.mes : new Date().toISOString().slice(0, 7);

  const r = await gerarCalendarioMes(mes, {
    incluirAvulsos: !!b?.incluirAvulsos,
    dataAvulsos: b?.dataAvulsos || undefined,
    distribuir: b?.distribuir !== false,
  });
  return NextResponse.json({ ok: true, ...r });
}
