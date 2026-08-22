import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "./env";

// Client com a sessão do humano logado no painel. Respeita RLS —
// usado quando a Nina/Leandro aprova rascunhos e move o score.
export function supabaseServer() {
  const store = cookies();
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options?: any }[]) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // chamado de um Server Component sem resposta mutável — ignorar
        }
      },
    },
  });
}
