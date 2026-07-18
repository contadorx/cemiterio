import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Endpoint público (sem login). Usa a chave anon + RPCs SECURITY DEFINER,
// que só expõem dados não-sensíveis do túmulo pelo token.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") || "";
  if (token.length < 16) {
    return NextResponse.json({ ok: false, erro: "token_invalido" }, { status: 400 });
  }

  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [{ data: cab, error: e1 }, { data: hist, error: e2 }, { data: irmaos }] = await Promise.all([
    db.rpc("sureya_portal_cabecalho", { p_token: token }),
    db.rpc("sureya_portal_historico", { p_token: token }),
    db.rpc("sureya_portal_irmaos", { p_token: token }),
  ]);

  if (e1 || e2 || !cab || (Array.isArray(cab) && cab.length === 0)) {
    return NextResponse.json({ ok: false, erro: "nao_encontrado" }, { status: 404 });
  }

  const cabecalho = Array.isArray(cab) ? cab[0] : cab;
  return NextResponse.json({ ok: true, cabecalho, historico: hist || [], irmaos: irmaos || [] });
}
