import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Entradas vistas no extrato do banco.
 * O dinheiro entrou — não há dúvida disso. O que falta é saber de quem é.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const q = req.nextUrl.searchParams;
  const meses = Math.max(1, Math.min(24, Number(q.get("meses")) || 3));
  const desde = new Date();
  desde.setMonth(desde.getMonth() - meses);

  let sel = auth.db
    .from("entradas_banco")
    .select("*, clientes(nome)")
    .gte("data", desde.toISOString().slice(0, 10))
    .order("identificada_em", { ascending: true, nullsFirst: true })
    .order("data", { ascending: false })
    .limit(300);
  if (q.get("pendentes") === "1") sel = sel.is("identificada_em", null);

  const { data } = await sel;
  const lista = data || [];
  const pend = lista.filter((x: any) => !x.identificada_em);
  const r2 = (n: number) => Math.round(n * 100) / 100;

  return NextResponse.json({
    ok: true,
    entradas: lista,
    totais: {
      pendentes: pend.length,
      valorPendente: r2(pend.reduce((s: number, x: any) => s + Number(x.valor), 0)),
      identificadas: lista.length - pend.length,
      recebidoPeriodo: r2(lista.reduce((s: number, x: any) => s + Number(x.valor), 0)),
    },
  });
}

// POST { valor, data, remetente?, identificador?, clienteId?, observacao? }
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const b = await req.json().catch(() => ({}));

  const valor = Number(b?.valor);
  if (!valor || valor <= 0) return NextResponse.json({ ok: false, erro: "valor_invalido" }, { status: 400 });

  // Se já se sabe de quem é (o caso mais comum), registra e credita de uma vez —
  // e amarra às lavagens escolhidas, se houver.
  if (b?.clienteId) {
    const { data, error } = await auth.db.rpc("sureya_entrada_identificada", {
      p_valor: valor,
      p_data: b?.data || new Date().toISOString().slice(0, 10),
      p_cliente: b.clienteId,
      p_remetente: b?.remetente || null,
      p_identificador: b?.identificador || null,
      p_observacao: b?.observacao || null,
      p_debitos: Array.isArray(b?.debitos) && b.debitos.length ? b.debitos : null,
    });
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    const r = (Array.isArray(data) ? data[0] : data) || {};
    return NextResponse.json({
      ok: true, id: r.r_entrada, movimento: r.r_movimento,
      quitados: r.r_quitados || 0, sobrou: Number(r.r_sobrou) || 0,
    });
  }

  // sem dono ainda: fica na fila de identificação
  const { data, error } = await auth.db.rpc("sureya_registrar_entrada_banco", {
    p_valor: valor,
    p_data: b?.data || new Date().toISOString().slice(0, 10),
    p_remetente: b?.remetente || null,
    p_cliente: null,
    p_identificador: b?.identificador || null,
    p_observacao: b?.observacao || null,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data });
}

// PUT { entradaId, clienteId } — diz de quem é; sem clienteId, desfaz
export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const b = await req.json().catch(() => ({}));
  if (!b?.entradaId) return NextResponse.json({ ok: false, erro: "entrada_obrigatoria" }, { status: 400 });

  if (!b?.clienteId) {
    const { error } = await auth.db.rpc("sureya_desidentificar_entrada", { p_entrada: b.entradaId });
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, desfeito: true });
  }

  const { data, error } = await auth.db.rpc("sureya_identificar_entrada", {
    p_entrada: b.entradaId, p_cliente: b.clienteId,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, movimentoId: data });
}

// DELETE ?id= — remove a entrada (lançou errado)
export async function DELETE(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, erro: "id_obrigatorio" }, { status: 400 });
  await auth.db.rpc("sureya_desidentificar_entrada", { p_entrada: id });
  await auth.db.from("entradas_banco").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
