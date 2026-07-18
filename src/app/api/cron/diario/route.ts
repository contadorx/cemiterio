import { NextRequest, NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/cron-auth";
import { avisosSaldoBaixo, cobrancaGentil, gatilhosDeData } from "@/lib/proativo";
import { gerarServicosDevidos, alocarAgenda } from "@/lib/agenda";
import { registrarErro } from "@/lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Rotina da manhã: monta a agenda do período e prepara os rascunhos proativos.
// Convites (ativação) e destilação de perfis rodam em crons próprios, para que
// uma falha em um não derrube os outros.
export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ ok: false, erro: "cron_nao_autorizado (defina CRON_SECRET)" }, { status: 401 });
  }

  const resultado: Record<string, any> = { ok: true };

  // cada etapa é independente: se uma falhar, as outras seguem
  try {
    const gerados = await gerarServicosDevidos(30);
    const aloc = await alocarAgenda();
    resultado.agenda = { gerados: gerados.criados, ...aloc };
  } catch (e) {
    await registrarErro("cron_diario_agenda", e);
    resultado.agenda = { erro: true };
  }

  try {
    resultado.rascunhos = {
      saldo: await avisosSaldoBaixo(),
      cobranca: await cobrancaGentil(),
      gatilhos: await gatilhosDeData(),
    };
  } catch (e) {
    await registrarErro("cron_diario_proativos", e);
    resultado.rascunhos = { erro: true };
  }

  return NextResponse.json(resultado);
}
