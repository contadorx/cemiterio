import { NextRequest, NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/cron-auth";
import { processarPendentes } from "@/lib/atendimento";
import { processarFilaEnvios } from "@/lib/envio";
import { carimbarRotina } from "@/lib/rotinas";

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
  try {
    const [conversas, envios] = await Promise.all([processarPendentes(), processarFilaEnvios()]);
    // carimba que passou por aqui: e assim que o painel sabe que a rotina vive
    await carimbarRotina("minuto", true, { conversas, envios });
    return NextResponse.json({ ok: true, conversas, envios });
  } catch (e: any) {
    await carimbarRotina("minuto", false, undefined, e?.message || String(e));
    throw e;
  }
}
