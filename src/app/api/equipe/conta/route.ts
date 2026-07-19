import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin, exigirLogado } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Conta-corrente da equipe: o que a ajudante tem a receber e o que já foi pago.
 * Ela compra material do próprio bolso — enquanto não é paga, o dinheiro dela
 * está no negócio.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;
  const membro = req.nextUrl.searchParams.get("membro");

  const [{ data: saldos }, { data: lancs }, { data: equipe }] = await Promise.all([
    auth.db.rpc("sureya_saldo_equipe"),
    auth.db.from("conta_equipe")
      .select("*, compras_material(quantidade, materiais(nome))")
      .order("data", { ascending: false }).limit(200),
    auth.db.from("membros").select("user_id,nome,papel").eq("ativo", true),
  ]);

  const lista = (lancs || []).filter((l: any) => !membro || l.membro_id === membro);
  const r2 = (n: number) => Math.round(n * 100) / 100;

  return NextResponse.json({
    ok: true,
    saldos: saldos || [],
    lancamentos: lista,
    equipe: (equipe || []).filter((m: any) => m.papel === "campo"),
    totais: {
      aPagar: r2((saldos || []).reduce((s: number, x: any) => s + Number(x.a_receber), 0)),
      pagoNoMes: r2(lista
        .filter((l: any) => l.pago_em &&
          String(l.pago_em).slice(0, 7) === new Date().toISOString().slice(0, 7))
        .reduce((s: number, l: any) => s + Number(l.valor), 0)),
    },
  });
}

// POST { membroId, materialId, quantidade, valor, data } — Nina comprou material
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const b = await req.json().catch(() => ({}));

  if (!b?.membroId || !b?.materialId) {
    return NextResponse.json({ ok: false, erro: "membro_e_material_obrigatorios" }, { status: 400 });
  }
  const { data, error } = await auth.db.rpc("sureya_reembolso_material", {
    p_membro: b.membroId,
    p_material: b.materialId,
    p_quantidade: Number(b?.quantidade) || 1,
    p_valor: Number(b?.valor) || 0,
    p_data: b?.data || new Date().toISOString().slice(0, 10),
    p_comprovante: b?.comprovante || null,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data });
}

// PUT { membroId, valor?, descricao? } — pagar o que ela tem a receber
export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const b = await req.json().catch(() => ({}));
  if (!b?.membroId) return NextResponse.json({ ok: false, erro: "membro_obrigatorio" }, { status: 400 });

  const { data, error } = await auth.db.rpc("sureya_pagar_equipe", {
    p_membro: b.membroId,
    p_valor: b?.valor ? Number(b.valor) : null,
    p_data: b?.data || new Date().toISOString().slice(0, 10),
    p_descricao: b?.descricao || null,
  });
  if (error) {
    const amigavel = error.message.includes("nada_a_pagar")
      ? "Não há nada em aberto para esta pessoa."
      : error.message;
    return NextResponse.json({ ok: false, erro: amigavel }, { status: 400 });
  }
  const r = (Array.isArray(data) ? data[0] : data) || {};
  return NextResponse.json({
    ok: true, pago: Number(r.pago) || 0, itens: r.itens_quitados || 0,
  });
}

// DELETE ?id= — remove um lançamento ainda não pago (lançou errado)
export async function DELETE(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, erro: "id_obrigatorio" }, { status: 400 });

  const { data: l } = await auth.db
    .from("conta_equipe").select("pago_em").eq("id", id).maybeSingle();
  if ((l as any)?.pago_em) {
    return NextResponse.json(
      { ok: false, erro: "Este item já foi pago — não dá para remover." }, { status: 400 });
  }
  await auth.db.from("conta_equipe").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
