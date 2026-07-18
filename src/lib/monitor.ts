import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";

// Registra um erro no banco (erros_log) para o dono ver no painel.
// Nunca lança — monitoramento não pode derrubar o fluxo principal.
export async function registrarErro(
  contexto: string,
  erro: unknown,
  detalhe?: Record<string, any>
): Promise<void> {
  try {
    const db = supabaseAdmin();
    let org: string | null = null;
    try {
      org = env.orgId();
    } catch {
      org = null;
    }
    const mensagem =
      erro instanceof Error ? erro.message : typeof erro === "string" ? erro : JSON.stringify(erro);
    await db.from("erros_log").insert({
      org_id: org,
      contexto,
      mensagem: String(mensagem).slice(0, 1000),
      detalhe: detalhe || null,
    });
  } catch (e) {
    // último recurso: só console
    console.error("[monitor] não consegui registrar erro:", (e as any)?.message || e);
  }
}
