import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { auditar } from "@/lib/auditoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * FAMÍLIAS SEM JAZIGO — a faxina depois da fusão (0147).
 *
 * Medido em 29/08, depois de os 11 duplicados serem juntados: 122 famílias sem
 * jazigo nenhum, e 103 das pessoas dentro delas foram criadas no MESMO DIA,
 * 19/08 — a importação da planilha. São contatos que nunca foram vinculados.
 *
 * MAS TRÊS DELAS ESCREVERAM: Eliana, Nena Roberto e Zulmira, com 3, 6 e 3
 * mensagens. `mensagens.cliente_id` é ON DELETE CASCADE — apagar levaria a
 * conversa junto, calada. Essas três a função RECUSA, e diz por quê.
 *
 * A pessoa vai junto com a família de propósito. Deixá-la para trás criaria o
 * órfão que `sureya_lancar` recusa — o mesmo defeito que a 0145 mediu.
 */

export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const { data, error } = await auth.db.rpc("sureya_familias_sem_jazigo", { p_org: org });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  const lista = (data as any[]) || [];
  return NextResponse.json({
    ok: true,
    familias: lista,
    podem: lista.filter((f) => f.pode_apagar).length,
    seguram: lista.filter((f) => !f.pode_apagar).length,
  });
}

export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({} as any));
  const ids: string[] = Array.isArray(b?.familias)
    ? b.familias.map((x: any) => String(x || "").trim()).filter(Boolean)
    : [];
  const ensaio = !!b?.ensaio;
  if (!ids.length) return NextResponse.json({ ok: false, erro: "sem_familia" }, { status: 400 });

  // UMA A UMA, e cada recusa é contada com o motivo.
  //
  // Um `delete ... in (...)` pararia tudo na primeira que o banco recusasse, e
  // a tela mostraria "falhou" sobre 119 famílias por causa de uma. Aqui as que
  // podem sair saem, e as que não podem voltam nomeadas.
  const feitas: string[] = [];
  const recusadas: { id: string; motivo: string }[] = [];

  for (const id of ids) {
    const { error } = await auth.db.rpc("sureya_apagar_familia_sem_jazigo", {
      p_familia: id, p_org: org, p_ensaio: ensaio,
    });
    if (error) {
      recusadas.push({
        id,
        motivo: /familia_tem_historico/.test(error.message)
          ? "tem histórico da família (mensagem, comprovante ou lançamento)"
          : /familia_tem_jazigo/.test(error.message)
          ? "passou a ter jazigo"
          : error.message,
      });
    } else {
      feitas.push(id);
    }
  }

  if (!ensaio && feitas.length) {
    await auditar(auth.db, org, auth.userId || null, "apagou_familias_sem_jazigo",
      { tipo: "familia" }, { quantas: feitas.length, recusadas: recusadas.length });
  }

  return NextResponse.json({ ok: true, ensaio, apagadas: feitas.length, recusadas });
}
