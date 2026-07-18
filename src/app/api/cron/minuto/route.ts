import { NextRequest, NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/cron-auth";
import { processarPendentes } from "@/lib/atendimento";
import { processarFilaEnvios } from "@/lib/envio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Roda a cada minuto (Vercel Cron): consolida rajadas maduras + reprocessa envios que falharam.
export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) {
    return NextResponse.json(
      { ok: false, erro: "cron_nao_autorizado (defina CRON_SECRET)" },
      { status: 401 }
    );
  }
  const [conversas, envios] = await Promise.all([processarPendentes(), processarFilaEnvios()]);
  return NextResponse.json({ ok: true, conversas, envios });
}
