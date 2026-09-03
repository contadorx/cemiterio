import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";

/**
 * O TETO DE GASTO COM IA.
 *
 * ============================================================================
 * O QUE ACONTECEU EM 03/09/2026
 * ============================================================================
 *
 * Em 24 horas a casa gastou US$ 348,18 em 5.838 chamadas ao modelo — sobre
 * TRÊS conversas já finalizadas, reprocessadas cerca de 990 vezes cada. Num dia
 * normal são 15 a 25 chamadas e menos de US$ 2.
 *
 * O teto existia, estava configurado em 150 por dia, e não barrou nada. Duas
 * razões, e as duas estavam escritas neste arquivo:
 *
 * 1. ELE FALHAVA ABERTO. O `catch` abaixo dizia "se o controle falhar, não
 *    bloqueia o atendimento" e devolvia `pode: true`. Um controle de gasto que
 *    libera quando não consegue medir não é um controle: é um comentário.
 *
 * 2. ELE CONTAVA NOUTRO LUGAR. `uso_ia.chamadas` era incrementado aqui, e
 *    `chamadas_ia` era escrita por quem de fato chamava o modelo. No dia 03/09
 *    o contador do teto marcou 14 enquanto `chamadas_ia` registrava 5.776. Duas
 *    contagens da mesma coisa, divergindo em silêncio — o defeito de forma de
 *    sempre, agora com preço.
 *
 * ============================================================================
 * O QUE MUDA
 * ============================================================================
 *
 * · A conta vem de `chamadas_ia`, que é o REGISTRO do que aconteceu, e não de
 *   um contador paralelo que alguém pode esquecer de incrementar.
 * · O teto passa a valer também em DINHEIRO, não só em número de chamadas: 150
 *   chamadas de Haiku e 150 de Sonnet custam ordens de grandeza diferentes.
 * · Falha FECHADO. Se não dá para saber quanto já se gastou, não se gasta mais.
 *   O atendimento silencioso por uma hora é ruim; US$ 348 numa noite é pior, e
 *   só o segundo é irreversível.
 */

/** Teto de segurança em dólares por dia, quando a org não define o seu. */
export const TETO_DOLAR_PADRAO = 10;

export interface Cota {
  pode: boolean;
  usadas: number;
  teto: number;
  /** Quanto já se gastou hoje, em dólares, segundo `chamadas_ia`. */
  gasto: number;
  tetoDolar: number;
  /** Por que recusou — para a tela dizer, em vez de ficar muda. */
  motivo?: string;
}

export async function podeChamarIa(): Promise<Cota> {
  const db = supabaseAdmin();
  const org = env.orgId();

  try {
    const { data: orgRow, error: eOrg } = await db
      .from("orgs").select("teto_ia_dia,teto_ia_dolar_dia").eq("id", org).maybeSingle();
    if (eOrg) throw eOrg;

    const teto = Number((orgRow as any)?.teto_ia_dia) || 0;
    const tetoDolar = Number((orgRow as any)?.teto_ia_dolar_dia) || TETO_DOLAR_PADRAO;

    // A MESMA TABELA QUE REGISTRA A CHAMADA É A QUE CONTA A CHAMADA.
    // O dia é o de operação (Brasília), e não o de UTC: um teto que vira às 21h
    // daria três horas de barra livre toda noite.
    const inicio = new Date();
    inicio.setUTCHours(3, 0, 0, 0);                 // 00:00 em Brasília
    if (inicio.getTime() > Date.now()) inicio.setUTCDate(inicio.getUTCDate() - 1);

    const { data: linhas, error } = await db
      .from("chamadas_ia")
      .select("custo")
      .eq("org_id", org)
      .gte("created_at", inicio.toISOString())
      .limit(20000);
    if (error) throw error;

    const usadas = (linhas || []).length;
    const gasto = (linhas || []).reduce((s, l: any) => s + (Number(l.custo) || 0), 0);

    // o contador antigo continua sendo alimentado: várias telas o mostram, e
    // apagá-lo agora seria trocar um defeito por uma tela vazia
    await db.rpc("sureya_registrar_uso_ia", { p_org: org }).then(() => null, () => null);

    if (tetoDolar > 0 && gasto >= tetoDolar) {
      return { pode: false, usadas, teto, gasto, tetoDolar,
               motivo: `o gasto do dia chegou a US$ ${gasto.toFixed(2)} (teto US$ ${tetoDolar.toFixed(2)})` };
    }
    if (teto > 0 && usadas >= teto) {
      return { pode: false, usadas, teto, gasto, tetoDolar,
               motivo: `foram ${usadas} chamadas hoje (teto ${teto})` };
    }
    return { pode: true, usadas, teto, gasto, tetoDolar };
  } catch (e) {
    // FECHADO. Ver o cabeçalho: não medir não é permissão para gastar.
    console.error("[custo-ia] nao consegui medir o gasto — RECUSANDO:", (e as any)?.message || e);
    return {
      pode: false, usadas: 0, teto: 0, gasto: 0, tetoDolar: 0,
      motivo: "não consegui medir o gasto de IA de hoje, então não vou gastar mais",
    };
  }
}
