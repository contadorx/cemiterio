import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";

// Controle de custo (A8): conta chamadas do dia e respeita um teto opcional por org.
// Retorna true se PODE chamar o modelo; false se o teto do dia estourou.
export async function podeChamarIa(): Promise<{ pode: boolean; usadas: number; teto: number }> {
  try {
    const db = supabaseAdmin();
    const org = env.orgId();

    const { data: orgRow } = await db.from("orgs").select("teto_ia_dia").eq("id", org).maybeSingle();
    const teto = Number((orgRow as any)?.teto_ia_dia) || 0;

    const { data: total } = await db.rpc("sureya_registrar_uso_ia", { p_org: org });
    const usadas = Number(total) || 0;

    if (teto > 0 && usadas > teto) return { pode: false, usadas, teto };
    return { pode: true, usadas, teto };
  } catch (e) {
    // se o controle falhar, não bloqueia o atendimento
    console.error("[custo-ia] falhou, liberando:", (e as any)?.message || e);
    return { pode: true, usadas: 0, teto: 0 };
  }
}
