/**
 * FREQUÊNCIA DAS LAVAGENS
 *
 * O combinado com a família tem duas partes:
 *   · o PERÍODO de cobrança (mensal, bimestral, semestral…)
 *   · quantas LAVAGENS acontecem dentro dele
 *
 * Mensal + 2 = a cada 15 dias. Mensal + 4 = toda semana.
 * Sem a segunda parte não dava para combinar quinzenal nem semanal.
 */

export const MESES_DO_CICLO: Record<string, number> = {
  mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12, avulso: 0,
};

export const DIAS_DO_CICLO: Record<string, number> = {
  mensal: 30, bimestral: 60, trimestral: 90, semestral: 180, anual: 365, avulso: 0,
};

/** Como o combinado se lê em português. */
export function descreverFrequencia(cadencia: string, lavagens = 1): string {
  const n = Math.max(1, Number(lavagens) || 1);
  if (cadencia === "avulso") return "quando pedirem";

  if (n === 1) {
    return {
      mensal: "uma vez por mês",
      bimestral: "a cada dois meses",
      trimestral: "a cada três meses",
      semestral: "duas vezes por ano",
      anual: "uma vez por ano",
    }[cadencia] || cadencia;
  }

  if (cadencia === "mensal") {
    if (n === 2) return "duas vezes por mês (a cada 15 dias)";
    if (n === 4) return "quatro vezes por mês (toda semana)";
    return `${n} vezes por mês`;
  }
  const periodo: Record<string, string> = {
    bimestral: "a cada dois meses",
    trimestral: "a cada três meses",
    semestral: "por semestre",
    anual: "por ano",
  };
  return `${n} vezes ${periodo[cadencia] || cadencia}`;
}

/** De quantos em quantos dias a Nina volta a este jazigo. */
export function intervaloEmDias(cadencia: string, lavagens = 1): number | null {
  const ciclo = DIAS_DO_CICLO[cadencia];
  if (!ciclo) return null;
  return Math.max(1, Math.round(ciclo / Math.max(1, lavagens)));
}

/** Quantas lavagens por ano — serve para a conta de custo e de agenda. */
export function lavagensPorAno(cadencia: string, lavagens = 1): number {
  const meses = MESES_DO_CICLO[cadencia];
  if (!meses) return 0;
  return Math.round((12 / meses) * Math.max(1, lavagens));
}

/** Atalhos que cobrem quase todos os combinados reais. */
export const ATALHOS_FREQUENCIA: { rotulo: string; cadencia: string; lavagens: number }[] = [
  { rotulo: "Toda semana",        cadencia: "mensal",     lavagens: 4 },
  { rotulo: "A cada 15 dias",     cadencia: "mensal",     lavagens: 2 },
  { rotulo: "Uma vez por mês",    cadencia: "mensal",     lavagens: 1 },
  { rotulo: "A cada 2 meses",     cadencia: "bimestral",  lavagens: 1 },
  { rotulo: "A cada 3 meses",     cadencia: "trimestral", lavagens: 1 },
  { rotulo: "2 vezes por ano",    cadencia: "semestral",  lavagens: 1 },
  { rotulo: "1 vez por ano",      cadencia: "anual",      lavagens: 1 },
  { rotulo: "Só quando pedirem",  cadencia: "avulso",     lavagens: 1 },
];
