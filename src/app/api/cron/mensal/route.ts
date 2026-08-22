import { NextRequest, NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/cron-auth";
import { fecharCompetencia } from "@/lib/competencia";
import { registrarErro } from "@/lib/monitor";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * O FECHAMENTO DO MÊS, automático — roda no dia 1.
 *
 * Lança o débito de cada túmulo contratado cuja frequência de pagamento fecha
 * ciclo neste mês.
 *
 * POR QUE AUTOMATIZAR ISTO, se decidimos não automatizar mensagens:
 * a diferença é quem recebe. Mensagem automática vai para a família, e é ali
 * que o robô estraga o vínculo — por isso a fila de liberação existe. Este
 * cron não fala com ninguém: ele só escreve na conta corrente, que é uma
 * ferramenta interna da Sureya. E é justamente o esquecimento do lançamento
 * que faz o dinheiro sumir em silêncio.
 *
 * NADA É COBRADO SOZINHO POR ISSO. O débito entra no extrato; a mensagem de
 * cobrança continua saindo só quando a Sureya aprova na fila.
 *
 * Rodar duas vezes é inofensivo: o índice único (tumulo_id, competencia)
 * recusa o repetido, e o resultado devolve quantos foram pulados.
 */
export async function GET(req: NextRequest) {
  if (!cronAutorizado(req)) {
    return NextResponse.json(
      { ok: false, erro: "cron_nao_autorizado (defina CRON_SECRET)" },
      { status: 401 }
    );
  }

  try {
    const org = env.orgId();
    const r = await fecharCompetencia(org);

    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    // Registra e devolve 500: o cron falhando em silêncio significaria um mês
    // inteiro sem cobrança, descoberto só quando o dinheiro não entrasse.
    await registrarErro("cron/mensal", e).catch(() => {});
    return NextResponse.json({ ok: false, erro: String(e?.message || e) }, { status: 500 });
  }
}
