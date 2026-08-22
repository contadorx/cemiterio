import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A CONFERÊNCIA DE CADASTRO — Build 7, etapa 1.
 *
 * Sem `familiaId`: a lista de famílias, da mais simples para a mais
 * complicada, com quantas pendências cada uma tem.
 *
 * Com `familiaId`: o checklist daquela família, item por item.
 *
 * As perguntas moram no banco (`sureya_conferencia_cadastro`, migration 0080).
 * Aqui só se pergunta.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const familiaId = req.nextUrl.searchParams.get("familiaId");

  if (familiaId) {
    const { data, error } = await auth.db
      .rpc("sureya_conferencia_cadastro", { p_familia: familiaId });
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, itens: data || [] });
  }

  const { data, error } = await auth.db
    .from("sureya_candidatas_ao_piloto")
    .select("familia_id,familia,jazigos,pessoas,contratado,pendencias,o_que_falta")
    .limit(400);

  // LISTA VAZIA POR ERRO SE LÊ COMO "ESTÁ TUDO CONFERIDO".
  // Mesma regra do funil e do saldo: falha aparece, não vira zero.
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const familias = (data || []) as any[];
  return NextResponse.json({
    ok: true,
    familias,
    resumo: {
      total: familias.length,
      prontas: familias.filter((f) => Number(f.pendencias) === 0).length,
      prontasContratadas: familias.filter(
        (f) => Number(f.pendencias) === 0 && f.contratado).length,
    },
  });
}
