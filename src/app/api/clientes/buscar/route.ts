import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Busca leve de família — nome ou telefone.
 *
 * O GET de /api/clientes carrega a carteira inteira com túmulos, planos e
 * movimentos: pesado demais para um campo de busca que roda a cada tecla. Aqui
 * volta só o que a caixinha precisa mostrar.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ ok: true, clientes: [] });

  const termo = q.replace(/[%,]/g, " ");
  const { data, error } = await auth.db
    .from("clientes")
    .select("id,nome,telefone")
    .or(`nome.ilike.%${termo}%,telefone.ilike.%${termo}%`)
    .order("nome")
    .limit(20);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, clientes: data || [] });
}
