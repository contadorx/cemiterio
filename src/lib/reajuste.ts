import type { SupabaseClient } from "@supabase/supabase-js";

export interface Candidato {
  planoId: string;
  clienteId: string;
  cliente: string;
  telefone: string;
  cadencia: string;
  valorAtual: number;
  valorSugerido: number;
  mesesSemReajuste: number;
  ipcaAcumuladoPct: number;
  bomPagador: boolean;
  temperatura: number; // 0-100
  faixa: "fria" | "morna" | "quente";
}

function mesesEntre(iso: string, hoje = new Date()): number {
  const d = new Date(iso + "T00:00:00");
  return (hoje.getFullYear() - d.getFullYear()) * 12 + (hoje.getMonth() - d.getMonth());
}
function round5(v: number): number {
  return Math.round(v / 5) * 5;
}

// Lista clientes com preço defasado, ordenados pela urgência do reajuste.
export async function calcularTemperatura(db: SupabaseClient): Promise<Candidato[]> {
  const { data: org } = await db
    .from("orgs")
    .select("valor_referencia_limpeza,ipca_anual_estimado")
    .limit(1)
    .maybeSingle();
  const referencia = Number((org as any)?.valor_referencia_limpeza) || 40;
  const ipcaAnual = Number((org as any)?.ipca_anual_estimado) || 0.045;

  const { data: planos } = await db
    .from("planos")
    .select("id,cliente_id,cadencia,valor_vigente,data_valor_vigente,ativo,clientes(nome,telefone)")
    .eq("ativo", true);

  // saúde de pagamento por cliente (saldo confirmado >= 0 => bom pagador)
  const { data: mov } = await db.from("movimentos").select("cliente_id,tipo,valor,status_conc");
  const saldo = new Map<string, number>();
  for (const m of mov || []) {
    if ((m as any).status_conc !== "confirmado") continue;
    const cur = saldo.get((m as any).cliente_id) || 0;
    const v = Number((m as any).valor) || 0;
    saldo.set((m as any).cliente_id, cur + ((m as any).tipo === "credito" ? v : -v));
  }

  const lista: Candidato[] = [];

  for (const p of planos || []) {
    const valorAtual = Number((p as any).valor_vigente) || 0;
    const desde = (p as any).data_valor_vigente || new Date().toISOString().slice(0, 10);
    const meses = Math.max(0, mesesEntre(desde));
    const anos = meses / 12;

    const ipcaAcum = Math.pow(1 + ipcaAnual, anos) - 1;
    const corrigido = valorAtual * (1 + ipcaAcum);
    const sugerido = round5(Math.max(corrigido, referencia));

    // sem espaço de reajuste? pula.
    const gap = valorAtual > 0 ? (sugerido - valorAtual) / valorAtual : 0;
    if (gap <= 0.02) continue;

    const bomPagador = (saldo.get((p as any).cliente_id) || 0) >= -0.005;

    // temperatura: tempo + defasagem + segurança do pagador
    let t = Math.min(55, meses * 3.5); // ~16 meses -> 55
    t += Math.min(30, gap * 100 * 0.5); // 60% de gap -> 30
    t += bomPagador ? 15 : 0;
    const temperatura = Math.round(Math.max(0, Math.min(100, t)));

    lista.push({
      planoId: (p as any).id,
      clienteId: (p as any).cliente_id,
      cliente: (p as any).clientes?.nome || "—",
      telefone: (p as any).clientes?.telefone || "",
      cadencia: (p as any).cadencia,
      valorAtual,
      valorSugerido: sugerido,
      mesesSemReajuste: meses,
      ipcaAcumuladoPct: Math.round(ipcaAcum * 1000) / 10,
      bomPagador,
      temperatura,
      faixa: temperatura >= 70 ? "quente" : temperatura >= 40 ? "morna" : "fria",
    });
  }

  lista.sort((a, b) => b.temperatura - a.temperatura);
  return lista;
}
