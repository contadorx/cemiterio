import { supabaseAdmin } from "./supabase-admin";

/**
 * QUANTO VALE UMA LIMPEZA.
 *
 * A Sureya combina um valor por MÊS com a família — R$ 100 — e cada túmulo tem
 * o seu ritmo. O valor de cada limpeza é o mensal dividido pelas limpezas que
 * cabem no mês, somando todos os túmulos daquela família:
 *
 *   1 túmulo semanal      -> 4 limpezas/mês -> R$ 25 cada
 *   1 semanal + 1 mensal  -> 5 limpezas/mês -> R$ 20 cada
 *
 * É isso que faz o extrato responder à pergunta da família: "paguei 100,
 * recebi duas limpezas, sobrou quanto?".
 *
 * SOBRE O 4, E NÃO 4,33
 * Um mês tem 4,33 semanas. Usar o número exato faria a limpeza valer R$ 23,09
 * e o extrato viraria uma sucessão de centavos quebrados que ninguém confere.
 * Com 4, a família às vezes recebe uma quinta limpeza no mês sem débito — erra
 * a favor dela, que é o lado certo de errar.
 */
export const LIMPEZAS_POR_MES: Record<string, number> = {
  semanal: 4,
  quinzenal: 2,
  mensal: 1,
  bimestral: 0.5,
  trimestral: 1 / 3,
  semestral: 1 / 6,
  anual: 1 / 12,
};

const MESES_DO_CICLO: Record<string, number> = {
  mensal: 1, trimestral: 3, semestral: 6, anual: 12,
};

/**
 * O valor de uma limpeza desta família, hoje.
 *
 * Devolve 0 quando não há como calcular — família sem plano, no modo
 * competência, sem valor, ou sem nenhum túmulo com ritmo definido. Zero é
 * deliberado: melhor um registro sem valor que um número inventado dentro da
 * conta de alguém.
 */
export async function valorDaLimpeza(familiaId: string): Promise<number> {
  const db = supabaseAdmin();

  const { data: fam } = await db
    .from("familias")
    .select("valor_mensal,valor_base,freq_pagamento,contratado,modo_cobranca")
    .eq("id", familiaId)
    .maybeSingle();

  const f = fam as any;
  if (!f?.contratado) return 0;

  // No modo competência o mês já foi debitado de uma vez. Debitar a limpeza
  // também cobraria duas vezes o mesmo serviço.
  if (f.modo_cobranca !== "consumo") return 0;

  // Quando o combinado foi dito por cobrança ("R$ 600 por semestre"), o valor
  // mensal é ele dividido pelos meses do ciclo.
  const bruto = Number(f.valor_mensal || 0);
  const mensal = f.valor_base === "cobranca"
    ? bruto / (MESES_DO_CICLO[f.freq_pagamento] || 1)
    : bruto;

  if (!(mensal > 0)) return 0;

  const { data: tums } = await db
    .from("tumulos")
    .select("periodicidade")
    .eq("familia_id", familiaId)
    .eq("contratado", true);

  const porMes = (tums || []).reduce(
    (s: number, t: any) => s + (LIMPEZAS_POR_MES[t.periodicidade] ?? 0),
    0,
  );

  if (!(porMes > 0)) return 0;

  return Math.round((mensal / porMes) * 100) / 100;
}
