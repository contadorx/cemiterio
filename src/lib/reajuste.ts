import type { SupabaseClient } from "@supabase/supabase-js";
import { calcularSaldosEmLote } from "./financeiro";
import { diaOperacao } from "./vencimento";

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
// Arredonda para o próximo múltiplo de 5 PARA CIMA.
// Antes usava Math.round (múltiplo mais próximo), o que anulava o reajuste:
// R$ 40 corrigido para R$ 41,95 voltava a R$ 40 e o cliente sumia da lista.
// Na prática, 12 de 14 clientes nunca apareciam na tela de Reajustes.
function round5(v: number): number {
  return Math.ceil(v / 5) * 5;
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
    .select("id,cliente_id,cadencia,valor_vigente,data_valor_vigente,ativo,clientes(nome,telefone,familia_id)")
    .eq("ativo", true);

  // SAUDE DE PAGAMENTO — saldo confirmado >= 0 significa bom pagador.
  //
  // Le o razao da FAMILIA (DECISOES.md D-01). Isto muda quem entra na lista de
  // reajuste: uma pessoa em dia cuja FAMILIA esta devendo deixa de ser
  // candidata. E o comportamento certo — reajustar quem deve e pedir briga.
  const saldos = await calcularSaldosEmLote(
    (planos || []).map((p: any) => ({
      id: p.cliente_id,
      familia_id: p.clientes?.familia_id ?? null,
    })),
  );

  const lista: Candidato[] = [];

  for (const p of planos || []) {
    const valorAtual = Number((p as any).valor_vigente) || 0;
    const desde = (p as any).data_valor_vigente || diaOperacao();
    const meses = Math.max(0, mesesEntre(desde));
    const anos = meses / 12;

    const ipcaAcum = Math.pow(1 + ipcaAnual, anos) - 1;
    const corrigido = valorAtual * (1 + ipcaAcum);
    const sugerido = round5(Math.max(corrigido, referencia));

    // sem espaço de reajuste? pula.
    const gap = valorAtual > 0 ? (sugerido - valorAtual) / valorAtual : 0;
    if (gap <= 0.02) continue;

    // Bom pagador = nada VENCIDO em aberto (0114). Quem tem o semestre
    // lancado e o vencimento em dezembro nao e mau pagador.
    const bomPagador = (saldos.get((p as any).cliente_id)?.vencido ?? 0) >= -0.005;

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
