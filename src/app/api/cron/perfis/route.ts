import { NextRequest, NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/cron-auth";
import { destilarPerfisPendentes } from "@/lib/destilacao";
import { registrarErro } from "@/lib/monitor";
import { carimbarRotina } from "@/lib/rotinas";

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
    await carimbarRotina("perfis", true, { perfis });
    return NextResponse.json({ ok: true, perfis });
  } catch (e) {
    await registrarErro("cron_perfis", e);
    await carimbarRotina("perfis", false, undefined, (e as any)?.message || String(e));
    return NextResponse.json({ ok: false, erro: "falha" }, { status: 500 });
  }
}
