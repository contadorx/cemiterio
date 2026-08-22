import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST público { codigo, nome, tel } — registra uma indicação recebida.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const codigo = (body?.codigo || "").trim();
  const nome = body?.nome || "";
  const tel = body?.tel || "";
  if (!codigo || (!nome && !tel)) {
    return NextResponse.json({ ok: false, erro: "parametros" }, { status: 400 });
  }

  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.rpc("sureya_registrar_indicacao", {
    p_codigo: codigo,
    p_nome: nome,
    p_tel: tel,
  });
  if (error || !data) {
    return NextResponse.json({ ok: false, erro: "codigo_invalido" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
