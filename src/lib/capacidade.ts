import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import { DIAS_CICLO } from "./agenda";

export interface CapacidadeLocal {
  cemiterioId: string | null;
  nome: string;
  diasSemana: number[] | null;   // null = todos os dias de trabalho da casa
  capacidadeMensal: number;
  cargaMensal: number;
  folgaMensal: number;
  utilizacao: number;
  planosRecorrentes: number;
}

export interface Capacidade {
  capacidadeMensal: number;   // limpezas que a equipe dá conta por mês
  cargaMensal: number;        // limpezas que os planos recorrentes já consomem
  folgaMensal: number;        // sobra
  utilizacao: number;         // 0-1
  mediaPorTumulo: number;     // limpezas/mês por túmulo recorrente
  cabemTumulos: number;       // estimativa de quantos túmulos ainda cabem
  planosRecorrentes: number;
  /** o mesmo cálculo, cemitério a cemitério (vazio quando só existe um) */
  porCemiterio: CapacidadeLocal[];
}

const SEMANAS_MES = 52 / 12;

/**
 * CAPACIDADE — quanto a equipe dá conta, e quanto os planos já consomem.
 *
 * DUAS COISAS ESTAVAM ERRADAS AQUI, e as duas escondiam trabalho:
 *
 * 1. A EQUIPE NÃO CONTAVA. Esta função usava só `orgs.limpezas_por_dia` — o
 *    padrão da casa — enquanto o alocador soma a capacidade de CADA ajudante
 *    ativa (`membros.limpezas_por_dia`). Com duas pessoas em campo, o painel
 *    mostrava metade do que a agenda realmente distribuía, e a conta de
 *    "cabem X túmulos novos" saía pela metade.
 *
 * 2. DUAS COLUNAS DE JORNADA. Aqui lia-se `orgs.dias_trabalhados_semana`, e no
 *    alocador, `orgs.dias_semana` (a lista de dias). Tirar o sábado numa não
 *    mexia na outra. Agora as duas telas leem a MESMA lista, e o número de dias
 *    é o tamanho dela.
 *
 * E, com 0044, a conta passa a existir também POR CEMITÉRIO: um local que só é
 * atendido às terças tem um teto muito menor que o da casa inteira, e era isso
 * que ficava invisível ao abrir o segundo cemitério.
 */
export async function calcularCapacidade(): Promise<Capacidade> {
  const db = supabaseAdmin();
  const org = env.orgId();

  const { data: orgRow } = await db
    .from("orgs")
    .select("limpezas_por_dia,dias_trabalhados_semana,dias_semana")
    .eq("id", org)
    .maybeSingle();

  const porDiaPadrao = Number((orgRow as any)?.limpezas_por_dia) || 20;

  // a MESMA lista de dias que o alocador usa; o fallback antigo (um número
  // solto) só entra se a lista não existir
  const diasLista: number[] | null =
    Array.isArray((orgRow as any)?.dias_semana) && (orgRow as any).dias_semana.length
      ? ((orgRow as any).dias_semana as number[])
      : null;
  const diasSemanaCasa = diasLista
    ? diasLista.length
    : Number((orgRow as any)?.dias_trabalhados_semana) || 6;

  // ---- a equipe de campo (é ela quem define a capacidade real) -------------
  let campo: any[] | null = null;
  const r1 = await db
    .from("membros")
    .select("user_id,limpezas_por_dia,ativo,cemiterio_id")
    .eq("org_id", org)
    .eq("papel", "campo");
  campo = r1.data as any;
  if (!campo) {
    const r2 = await db
      .from("membros")
      .select("user_id,limpezas_por_dia,ativo")
      .eq("org_id", org)
      .eq("papel", "campo");
    campo = r2.data as any;
  }
  const equipe = (campo || [])
    .filter((m: any) => m.ativo !== false)
    .map((m: any) => ({
      capacidade: Number(m.limpezas_por_dia) || porDiaPadrao,
      cemiterioId: (m.cemiterio_id as string | null) ?? null,
    }));

  // sem ninguém cadastrado, a casa vale por uma pessoa (como era antes)
  const porDiaTotal = equipe.length
    ? equipe.reduce((s, m) => s + m.capacidade, 0)
    : porDiaPadrao;

  const capacidadeMensal = porDiaTotal * diasSemanaCasa * SEMANAS_MES;

  // ---- a carga que os planos já consomem ----------------------------------
  let planos: any[] | null = null;
  const p1 = await db
    .from("planos")
    .select("cadencia,qtd_por_passagem,lavagens_por_ciclo,tumulos(cemiterio_id)")
    .eq("org_id", org)
    .eq("ativo", true)
    .in("cadencia", Object.keys(DIAS_CICLO));
  planos = p1.data as any;
  if (!planos) {
    const p2 = await db
      .from("planos")
      .select("cadencia,qtd_por_passagem,lavagens_por_ciclo")
      .eq("org_id", org)
      .eq("ativo", true)
      .in("cadencia", Object.keys(DIAS_CICLO));
    planos = p2.data as any;
  }

  const cargaDoPlano = (p: any) => {
    const ciclo = DIAS_CICLO[p.cadencia];
    // o alocador prefere lavagens_por_ciclo; a conta aqui tem que ser a mesma,
    // senão a carga mostrada não é a carga distribuída
    const qtd = Math.max(1, Number(p.lavagens_por_ciclo ?? p.qtd_por_passagem) || 1);
    return (qtd * 30) / ciclo;
  };

  let cargaMensal = 0;
  const n = (planos || []).length;
  for (const p of planos || []) cargaMensal += cargaDoPlano(p);

  const folgaMensal = capacidadeMensal - cargaMensal;
  const utilizacao = capacidadeMensal > 0 ? cargaMensal / capacidadeMensal : 0;
  const mediaPorTumulo = n > 0 ? cargaMensal / n : 1;
  const cabemTumulos = mediaPorTumulo > 0 ? Math.max(0, Math.floor(folgaMensal / mediaPorTumulo)) : 0;

  // ---- a mesma conta, por cemitério ---------------------------------------
  const porCemiterio = await capacidadePorCemiterio(
    db, org, equipe, porDiaPadrao, diasSemanaCasa, planos || [], cargaDoPlano,
  );

  return {
    capacidadeMensal: Math.round(capacidadeMensal),
    cargaMensal: Math.round(cargaMensal),
    folgaMensal: Math.round(folgaMensal),
    utilizacao: Math.round(utilizacao * 100) / 100,
    mediaPorTumulo: Math.round(mediaPorTumulo * 100) / 100,
    cabemTumulos,
    planosRecorrentes: n,
    porCemiterio,
  };
}

async function capacidadePorCemiterio(
  db: ReturnType<typeof supabaseAdmin>,
  org: string,
  equipe: { capacidade: number; cemiterioId: string | null }[],
  porDiaPadrao: number,
  diasSemanaCasa: number,
  planos: any[],
  cargaDoPlano: (p: any) => number,
): Promise<CapacidadeLocal[]> {
  const { data: cems } = await db
    .from("cemiterios")
    .select("id,nome,ativo,ordem,dias_semana")
    .eq("org_id", org)
    .order("ordem")
    .order("nome");

  const lista = (cems || []).filter((c: any) => c.ativo !== false);
  // um cemitério só (ou migration 0044 não rodada): a conta da casa já responde
  if (lista.length < 2) return [];

  return lista.map((c: any) => {
    const dias: number[] | null =
      Array.isArray(c.dias_semana) && c.dias_semana.length ? (c.dias_semana as number[]) : null;
    // quantos dias por semana a equipe vai NESTE lugar
    const diasAqui = dias ? dias.length : diasSemanaCasa;

    // quem atende aqui: amarrado a este cemitério + quem não está amarrado
    const podem = equipe.filter((m) => !m.cemiterioId || m.cemiterioId === c.id);
    const porDia = podem.length ? podem.reduce((s, m) => s + m.capacidade, 0) : porDiaPadrao;

    const capacidade = porDia * diasAqui * SEMANAS_MES;
    const carga = planos
      .filter((p: any) => p.tumulos?.cemiterio_id === c.id)
      .reduce((s: number, p: any) => s + cargaDoPlano(p), 0);

    return {
      cemiterioId: c.id as string,
      nome: (c.nome as string) || "cemitério",
      diasSemana: dias,
      capacidadeMensal: Math.round(capacidade),
      cargaMensal: Math.round(carga),
      folgaMensal: Math.round(capacidade - carga),
      utilizacao: capacidade > 0 ? Math.round((carga / capacidade) * 100) / 100 : 0,
      planosRecorrentes: planos.filter((p: any) => p.tumulos?.cemiterio_id === c.id).length,
    };
  });
}
