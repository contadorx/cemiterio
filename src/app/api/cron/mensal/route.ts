import { NextRequest, NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/cron-auth";
import { previewCompetencia } from "@/lib/competencia";
import { carimbarRotina } from "@/lib/rotinas";
import { registrarErro } from "@/lib/monitor";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * O MÊS FICA PRONTO NO DIA 1 — E ESPERA A CONFIRMAÇÃO (0162).
 *
 * ==========================================================================
 * O QUE MUDOU, E POR QUÊ
 * ==========================================================================
 *
 * Até aqui este cron CHAMAVA `fecharCompetencia` e escrevia os débitos do mês
 * sozinho. O comentário antigo defendia isso assim: "mensagem automática vai
 * para a família e estraga o vínculo; este cron não fala com ninguém, só
 * escreve na conta corrente, que é ferramenta interna".
 *
 * O argumento tinha um furo. A conta corrente não é um rascunho: é o que
 * decide quanto cada família deve, o que a régua cobra e o que a tela mostra
 * como atraso. Em 02/11 um fechamento lançou 104 débitos cobrindo DOZE meses,
 * de 11/2026 a 10/2027 — R$ 4.185 de uma vez. Escrever isso sem ninguém olhar
 * é grande demais para um robô decidir.
 *
 * A regra da casa, dita sem meio-termo: VOCÊ SUGERE, EU CONFIRMO. SEMPRE.
 *
 * Então o cron passa a PREPARAR e não a gravar. Ele calcula a mesma prévia
 * que a tela de Fechamento mostra — a MESMA `lib/competencia.ts`, porque
 * duplicar cálculo de dinheiro é como um dos dois diverge sem ninguém notar —
 * e deixa o resultado carimbado na rotina. Quem grava é a Sureya, no botão.
 *
 * ==========================================================================
 * O PERIGO DO OUTRO LADO, QUE NÃO PODE FICAR CALADO
 * ==========================================================================
 *
 * O comentário antigo estava certo numa coisa: "é justamente o esquecimento
 * do lançamento que faz o dinheiro sumir em silêncio". Trocar lançamento
 * automático por confirmação humana troca um risco por outro — um mês inteiro
 * sem cobrança, e ninguém percebe porque nada aconteceu.
 *
 * Por isso a prévia não fica só no log: ela vira PENDÊNCIA, com o número de
 * dias esperando. Um mês pronto e não confirmado tem de gritar mais alto a
 * cada dia que passa. Sugerir sem cobrar resposta é a mesma omissão com outro
 * nome.
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

    // PREPARA. NÃO GRAVA. `previewCompetencia` é a mesma função que a tela de
    // Fechamento usa para mostrar o que entraria — nada aqui toca a conta
    // corrente.
    const p = await previewCompetencia(org);

    // A pendência fica carimbada na rotina, que é o que o painel lê para
    // saber que o mês está esperando. Sem isto a sugestão morre no log.
    await carimbarRotina("mensal", true, {
      competencia: p.competencia,
      aLancar: p.novos,
      jaLancados: p.jaLancados,
      total: p.total,
      aguardandoConfirmacao: p.novos > 0,
    });

    return NextResponse.json({
      ok: true,
      preparado: true,
      gravado: false,
      ...p,
      // A lista inteira não volta no corpo do cron: são mais de cem linhas e
      // ninguém as lê daqui. Quem as lê é a tela de Fechamento, na hora.
      lancamentos: undefined,
    });
  } catch (e: any) {
    // Registra e devolve 500: o cron falhando em silêncio significaria um mês
    // inteiro sem nem a SUGESTÃO aparecer, descoberto só quando o dinheiro
    // não entrasse.
    await carimbarRotina("mensal", false, undefined, e?.message || String(e)).catch(() => {});
    await registrarErro("cron/mensal", e).catch(() => {});
    return NextResponse.json({ ok: false, erro: String(e?.message || e) }, { status: 500 });
  }
}
