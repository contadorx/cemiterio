import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processarPendentes } from "@/lib/atendimento";
import { processarFilaEnvios } from "@/lib/envio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Roda a cada minuto (Vercel Cron): consolida rajadas maduras + reprocessa envios que falharam.
function autorizado(req: NextRequest): boolean {
  const secret = env.cronSecret();
  if (!secret) return false; // sem CRON_SECRET configurado, endpoint fica fechado
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}` || req.nextUrl.searchParams.get("secret") === secret;
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json(
      { ok: false, erro: "cron_nao_autorizado (defina CRON_SECRET)" },
      { status: 401 }
    );
  }
  const [conversas, envios] = await Promise.all([processarPendentes(), processarFilaEnvios()]);
  return NextResponse.json({ ok: true, conversas, envios });
}
