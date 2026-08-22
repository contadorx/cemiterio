import type { SupabaseClient } from "@supabase/supabase-js";

// org_id do usuário autenticado (via membros; RLS deixa ver a própria linha).
export async function orgAtual(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.from("membros").select("org_id").limit(1).maybeSingle();
  return (data as any)?.org_id || null;
}
