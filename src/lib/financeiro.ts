import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";

export interface Saldo {
  saldo: number;      // só confirmados: créditos − débitos
  aConferir: number;  // créditos pendentes de conferência
}

export async function calcularSaldo(clienteId: string): Promise<Saldo> {
  const db = supabaseAdmin();
  const { data } = await db
    .from("movimentos")
    .select("tipo,valor,status_conc")
    .eq("org_id", env.orgId())
    .eq("cliente_id", clienteId);

  let saldo = 0;
  let aConferir = 0;
  for (const m of data || []) {
    const st = (m as any).status_conc;
    const v = Number((m as any).valor) || 0;
    if (st === "rejeitado") continue;
    if (st === "a_conferir") {
      if ((m as any).tipo === "credito") aConferir += v;
      continue;
    }
    saldo += (m as any).tipo === "credito" ? v : -v;
  }
  return { saldo: Math.round(saldo * 100) / 100, aConferir: Math.round(aConferir * 100) / 100 };
}

export function saldoTexto(s: Saldo): string {
  let base: string;
  if (Math.abs(s.saldo) < 0.005) base = "em dia";
  else if (s.saldo > 0) base = `adiantado R$ ${s.saldo.toFixed(2)}`;
  else base = `em aberto R$ ${Math.abs(s.saldo).toFixed(2)}`;
  return s.aConferir > 0.005 ? `${base} (R$ ${s.aConferir.toFixed(2)} a conferir)` : base;
}
