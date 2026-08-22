import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";

// Chave mestra dos disparos automáticos (orgs.disparos_ativos).
//
// Quando DESLIGADO:
//   • a IA não responde sozinha (vira rascunho para aprovação);
//   • a fila de reenvio e os disparos proativos ficam parados.
// Entrada de mensagens e respostas MANUAIS não passam por aqui — seguem sempre.
//
// Fail-safe: se por qualquer motivo não der para ler o banco, devolvemos FALSE
// (não dispara). É melhor deixar de responder do que disparar sem querer no meio
// de uma migração.

let cache: { valor: boolean; ate: number } | null = null;
const TTL_MS = 15_000; // 15s: instantâneo o bastante ao ligar/desligar, sem bater no banco a cada envio

export async function disparosAtivos(): Promise<boolean> {
  if (cache && Date.now() < cache.ate) return cache.valor;
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("orgs")
      .select("disparos_ativos")
      .eq("id", env.orgId())
      .maybeSingle();
    if (error) throw error;
    const valor = !!(data as any)?.disparos_ativos;
    cache = { valor, ate: Date.now() + TTL_MS };
    return valor;
  } catch (e) {
    console.error("[disparos] não consegui ler o estado, assumindo DESLIGADO:", (e as any)?.message || e);
    return false;
  }
}

// Chamado logo após ligar/desligar pela tela, para o efeito ser imediato.
export function limparCacheDisparos() {
  cache = null;
}
