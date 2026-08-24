import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?id= — de quem pode ser esta entrada
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, erro: "id_obrigatorio" }, { status: 400 });

  // p_org fica de fora de proposito: aqui existe sessao de usuario, e
  // `current_org_id()` resolve. O parametro existe para quem chama SEM sessão
  // (o cron, o teste) — foi por não ter isso que a 0103 quebrou.
  const { data, error } = await auth.db.rpc("sureya_palpites_entrada", { p_entrada: id });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, palpites: data || [] });
}
