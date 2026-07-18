import { NextRequest, NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/cron-auth";
import { convitesDeData, convitesPeriodicos } from "@/lib/ativacao";
import { pedidosDeAvaliacao } from "@/lib/avaliacao-periodica";
import { registrarErro } from "@/lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Régua de ativação: convida em vez de cobrar.
// Separado do cron diário porque percorre TODAS as famílias.
export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ ok: false, erro: "cron_nao_autorizado" }, { status: 401 });
  }
  try {
    const datas = await convitesDeData();
    const periodicos = await convitesPeriodicos();
    const avaliacoes = await pedidosDeAvaliacao();
    return NextResponse.json({ ok: true, convites: { datas, periodicos }, avaliacoes });
  } catch (e) {
    await registrarErro("cron_convites", e);
    return NextResponse.json({ ok: false, erro: "falha" }, { status: 500 });
  }
}
