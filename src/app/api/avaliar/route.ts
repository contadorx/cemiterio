import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST público { token, nota, comentario } — registra a avaliação pelo token.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = body?.token || "";
  const nota = Number(body?.nota);
  const comentario = body?.comentario || "";
  if (token.length < 12 || !(nota >= 1 && nota <= 5)) {
    return NextResponse.json({ ok: false, erro: "parametros" }, { status: 400 });
  }

  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.rpc("sureya_responder_avaliacao", {
    p_token: token,
    p_nota: nota,
    p_comentario: comentario,
  });
  if (error || !data) {
    return NextResponse.json({ ok: false, erro: "link_invalido_ou_usado" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
