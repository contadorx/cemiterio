import { NextRequest, NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/cron-auth";
import { destilarPerfisPendentes } from "@/lib/destilacao";
import { registrarErro } from "@/lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Destilação dos perfis da IA. É a tarefa mais lenta (chama o modelo),
// por isso roda de madrugada e separada de tudo.
export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ ok: false, erro: "cron_nao_autorizado" }, { status: 401 });
  }
  try {
    const perfis = await destilarPerfisPendentes();
    return NextResponse.json({ ok: true, perfis });
  } catch (e) {
    await registrarErro("cron_perfis", e);
    return NextResponse.json({ ok: false, erro: "falha" }, { status: 500 });
  }
}
