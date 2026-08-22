import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Service role: usado SÓ no servidor (webhook). Ignora RLS,
// então TODO acesso filtra org_id explicitamente com env.orgId().
export function supabaseAdmin() {
  return createClient(env.SUPABASE_URL, env.supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
