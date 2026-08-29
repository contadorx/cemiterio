import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { acao: 'resolver' | 'reabrir' | 'arquivar' | 'desarquivar' | 'excluir' }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const { acao } = await req.json().catch(() => ({ acao: "" }));
  const agora = new Date().toISOString();

  const mapa: Record<string, any> = {
    resolver: { resolvida: true, escalada_humano: false },
    reabrir: { resolvida: false, arquivada_em: null },
    arquivar: { arquivada_em: agora, arquivada_por: auth.userId, resolvida: true, aberta: false },
    desarquivar: { arquivada_em: null, arquivada_por: null, aberta: true },
  };

  if (acao === "excluir") {
    // apaga a conversa e o que dependia dela; o histórico financeiro não é tocado
    await db.from("mensagens").delete().eq("conversa_id", params.id);
    await db.from("interacoes_ia").delete().eq("conversa_id", params.id);
    const { error } = await db.from("conversas").delete().eq("id", params.id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, excluida: true });
  }

  if (!mapa[acao]) return NextResponse.json({ ok: false, erro: "acao_invalida" }, { status: 400 });

  const { error } = await db.from("conversas").update(mapa[acao]).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // ==========================================================================
  // FINALIZAR FECHA O RASCUNHO QUE SOBROU
  // ==========================================================================
  //
  // Medido em 29/08: o crachá de "Precisam de você" dizia 7 e a lista mostrava
  // 1. Das 6 de diferença, CINCO eram conversas já resolvidas que ainda tinham
  // rascunho da IA aberto (`acao_humana is null`).
  //
  // São duas causas somadas, e esta é a segunda: resolver a conversa não
  // fechava o rascunho. Ele ficava "esperando decisão" para sempre, e como
  // `tem_rascunho` entra na conta de quem precisa de você, a conversa voltava
  // a pesar mesmo depois de atendida.
  //
  // `descartou` é a verdade do que aconteceu: a pessoa resolveu o assunto sem
  // usar aquele texto. Marcar como "aprovou" mentiria para o score — a IA
  // aprenderia que acertou uma resposta que nunca saiu.
  if (acao === "resolver" || acao === "arquivar") {
    await db.from("interacoes_ia")
      .update({ acao_humana: "descartou" })
      .eq("conversa_id", params.id)
      .is("acao_humana", null);
  }

  return NextResponse.json({ ok: true });
}
