import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import { DIAS_CICLO } from "./agenda";

export interface Capacidade {
  capacidadeMensal: number;   // limpezas que a Nina dá conta por mês
  cargaMensal: number;        // limpezas que os planos recorrentes já consomem
  folgaMensal: number;        // sobra
  utilizacao: number;         // 0-1
  mediaPorTumulo: number;     // limpezas/mês por túmulo recorrente
  cabemTumulos: number;       // estimativa de quantos túmulos ainda cabem
  planosRecorrentes: number;
}

// carga/mês de um plano = qtd_por_passagem * 30 / dias_do_ciclo
export async function calcularCapacidade(): Promise<Capacidade> {
  const db = supabaseAdmin();
  const org = env.orgId();

  const { data: orgRow } = await db
    .from("orgs")
    .select("limpezas_por_dia,dias_trabalhados_semana")
    .eq("id", org)
    .maybeSingle();

  const porDia = Number((orgRow as any)?.limpezas_por_dia) || 20;
  const diasSemana = Number((orgRow as any)?.dias_trabalhados_semana) || 6;
  const capacidadeMensal = porDia * diasSemana * (52 / 12);

  const { data: planos } = await db
    .from("planos")
    .select("cadencia,qtd_por_passagem")
    .eq("org_id", org)
    .eq("ativo", true)
    .in("cadencia", Object.keys(DIAS_CICLO));

  let cargaMensal = 0;
  const n = (planos || []).length;
  for (const p of planos || []) {
    const ciclo = DIAS_CICLO[(p as any).cadencia];
    const qtd = Math.max(1, Number((p as any).qtd_por_passagem) || 1);
    cargaMensal += (qtd * 30) / ciclo;
  }

  const folgaMensal = capacidadeMensal - cargaMensal;
  const utilizacao = capacidadeMensal > 0 ? cargaMensal / capacidadeMensal : 0;
  const mediaPorTumulo = n > 0 ? cargaMensal / n : 30 / 30; // fallback: ~1/mês
  const cabemTumulos = mediaPorTumulo > 0 ? Math.max(0, Math.floor(folgaMensal / mediaPorTumulo)) : 0;

  return {
    capacidadeMensal: Math.round(capacidadeMensal),
    cargaMensal: Math.round(cargaMensal),
    folgaMensal: Math.round(folgaMensal),
    utilizacao: Math.round(utilizacao * 100) / 100,
    mediaPorTumulo: Math.round(mediaPorTumulo * 100) / 100,
    cabemTumulos,
    planosRecorrentes: n,
  };
}
