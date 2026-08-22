import { NextRequest, NextResponse } from "next/server";
import { exigirLogado } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * As ruas de uma quadra, na ordem em que se caminha.
 *
 * Existe para que a tela de cadastro no campo ofereça uma LISTA em vez de um
 * campo de digitar. Foi digitação livre que transformou quatro quadras em
 * treze — "QD 1", "Q1", "Qd 1", "Q01" e "Quadra 1" eram o mesmo lugar. Com a
 * rua o risco é o mesmo: "RUA 5", "Rua 5" e "R5" virariam três ruas.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;

  const quadraId = req.nextUrl.searchParams.get("quadraId");
  if (!quadraId) {
    return NextResponse.json({ ok: false, erro: "quadra_obrigatoria" }, { status: 400 });
  }

  const { data, error } = await auth.db
    .from("ruas")
    .select("id,nome,tipo,ordem,observacao")
    .eq("quadra_id", quadraId)
    .order("ordem");

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ruas: data || [] });
}
