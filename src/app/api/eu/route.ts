import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Quem o sistema acha que eu sou.
 * Serve para depurar acesso: se o painel te jogar para /campo, abra /api/eu e
 * veja o papel que veio do banco para o SEU user_id (nao o da equipe).
 * Nao expoe nada que o proprio usuario ja nao possa ver.
 */
export async function GET() {
  const db = supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, erro: "nao_autenticado", dica: "faca login em /login" }, { status: 401 });
  }

  const { data: meu, error } = await db
    .from("membros")
    .select("org_id,user_id,papel,nome,ativo")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: equipe } = await db.from("membros").select("user_id,papel,nome,ativo");

  return NextResponse.json({
    ok: true,
    email: user.email,
    userId: user.id,
    membro: meu || null,
    papel: (meu as any)?.papel || null,
    podePainel: (meu as any)?.papel === "admin",
    erroConsulta: error?.message || null,
    equipeVisivel: (equipe || []).length,
    dica: meu
      ? undefined
      : "nao existe linha em 'membros' para este user_id — rode a migration 0029 para conferir/corrigir",
  });
}
