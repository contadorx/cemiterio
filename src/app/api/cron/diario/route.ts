import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { avisosSaldoBaixo, cobrancaGentil, gatilhosDeData } from "@/lib/proativo";
import { gerarServicosDevidos, alocarAgenda } from "@/lib/agenda";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Roda 1x/dia: gera/aloca a agenda e cria os rascunhos proativos
// (aviso de saldo, cobrança gentil, gatilhos de data). Tudo copiloto.
function autorizado(req: NextRequest): boolean {
  const secret = env.cronSecret();
  if (!secret) return false;
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

  const agenda = await gerarServicosDevidos(30);
  const aloc = await alocarAgenda();
  const [saldo, cobranca, gatilhos] = [
    await avisosSaldoBaixo(),
    await cobrancaGentil(),
    await gatilhosDeData(),
  ];

  return NextResponse.json({
    ok: true,
    agenda: { gerados: agenda.criados, ...aloc },
    rascunhos: { saldo, cobranca, gatilhos },
  });
}
