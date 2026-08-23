import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O PAINEL DO MÊS — financeiro e operacional na mesma tela.
 *
 * Uma chamada, uma função no banco (`sureya_painel_do_mes`, 0105). Não é
 * economia de rede: é a garantia de que "em aberto" e "inadimplência" saem da
 * MESMA conta. Um painel cujos números discordam por meio real ensina a não
 * confiar em nenhum deles — e foi assim que o aviso da agenda ficou meses sem
 * zerar (0092), com o contador e o movedor usando definições diferentes.
 *
 * `p_org` fica nulo de propósito: aqui existe sessão de painel, então
 * `current_org_id()` resolve e a RLS da organização vale. O parâmetro existe
 * para o cron, que não tem `auth.uid()`.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const mes = req.nextUrl.searchParams.get("mes"); // "AAAA-MM"
  const dia = /^\d{4}-\d{2}$/.test(mes || "") ? `${mes}-01` : null;

  const { data, error } = await auth.db.rpc("sureya_painel_do_mes", {
    p_mes: dia, p_org: null,
  });

  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...(data as any) });
}
