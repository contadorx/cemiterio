import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { ids: string[], acao: 'resolver' | 'arquivar' | 'desarquivar' | 'excluir' }
// Aplica a mesma ação a várias conversas de uma vez. Espelha a rota de ação por
// item ([id]/acao) para não haver divergência de comportamento.
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: any) => typeof x === "string") : [];
  const acao: string = body?.acao || "";

  if (!ids.length) return NextResponse.json({ ok: false, erro: "sem_ids" }, { status: 400 });
  if (ids.length > 500) return NextResponse.json({ ok: false, erro: "muitos_ids" }, { status: 400 });

  const agora = new Date().toISOString();

  const mapa: Record<string, any> = {
    resolver: { resolvida: true, escalada_humano: false },
    reabrir: { resolvida: false, arquivada_em: null },
    arquivar: { arquivada_em: agora, arquivada_por: auth.userId, resolvida: true, aberta: false },
    desarquivar: { arquivada_em: null, arquivada_por: null, aberta: true },
  };

  if (acao === "excluir") {
    // apaga as conversas e o que dependia delas; o histórico financeiro não é tocado
    await db.from("mensagens").delete().in("conversa_id", ids);
    await db.from("interacoes_ia").delete().in("conversa_id", ids);
    const { error } = await db.from("conversas").delete().in("id", ids);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, afetadas: ids.length, excluida: true });
  }

  if (!mapa[acao]) return NextResponse.json({ ok: false, erro: "acao_invalida" }, { status: 400 });

  const { error } = await db.from("conversas").update(mapa[acao]).in("id", ids);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, afetadas: ids.length });
}
