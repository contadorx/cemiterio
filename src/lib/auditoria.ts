import type { SupabaseClient } from "@supabase/supabase-js";

// Registra uma ação sensível. Nunca lança — auditoria não derruba operação.
export async function auditar(
  db: SupabaseClient,
  orgId: string,
  userId: string | null,
  acao: string,
  alvo?: { tipo?: string; id?: string },
  detalhe?: Record<string, any>
): Promise<void> {
  try {
    await db.from("auditoria").insert({
      org_id: orgId,
      user_id: userId,
      acao,
      alvo_tipo: alvo?.tipo || null,
      alvo_id: alvo?.id || null,
      detalhe: detalhe || null,
    });
  } catch (e) {
    console.error("[auditoria] falhou:", (e as any)?.message || e);
  }
}
