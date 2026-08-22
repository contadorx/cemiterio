import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Registra erros que acontecem no navegador, para aparecerem em Config → Diagnóstico.
// Sem login: o erro pode acontecer antes de a sessão carregar.
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    const db = supabaseAdmin();
    await db.from("erros_log").insert({
      org_id: env.orgId(),
      contexto: `navegador${b?.url ? ` · ${b.url}` : ""}`,
      mensagem: String(b?.mensagem || "erro no navegador").slice(0, 300),
      detalhe: String(b?.stack || "").slice(0, 2000),
    });
  } catch {
    /* registrar erro não pode causar erro */
  }
  return NextResponse.json({ ok: true });
}
