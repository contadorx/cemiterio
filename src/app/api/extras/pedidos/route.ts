import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?clienteId= &status= — pedidos de extras
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const q = req.nextUrl.searchParams;

  let sel = auth.db
    .from("pedidos_extras")
    .select("*, clientes(nome), tumulos(identificacao)")
    .order("data_pedido", { ascending: false })
    .limit(200);
  if (q.get("clienteId")) sel = sel.eq("cliente_id", q.get("clienteId"));
  if (q.get("status")) sel = sel.eq("status", q.get("status"));

  const { data } = await sel;
  const lista = data || [];
  const r2 = (n: number) => Math.round(n * 100) / 100;

  return NextResponse.json({
    ok: true,
    pedidos: lista,
    totais: {
      pedidos: lista.filter((p: any) => p.status === "pedido").length,
      aEntregar: r2(lista.filter((p: any) => p.status === "pedido")
        .reduce((s: number, p: any) => s + Number(p.total), 0)),
      entregueMes: r2(lista.filter((p: any) =>
        p.status === "entregue" &&
        String(p.data_entrega || "").slice(0, 7) === new Date().toISOString().slice(0, 7))
        .reduce((s: number, p: any) => s + Number(p.total), 0)),
    },
  });
}

// POST { clienteId, extraId?, nome, quantidade, precoUnit, tumuloId?, observacao? }
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  const b = await req.json().catch(() => ({}));

  if (!b?.clienteId || !b?.nome) {
    return NextResponse.json({ ok: false, erro: "cliente_e_nome_obrigatorios" }, { status: 400 });
  }
  const qtd = Math.max(0.01, Number(b?.quantidade) || 1);
  const preco = Math.max(0, Number(b?.precoUnit) || 0);

  const { data, error } = await auth.db.from("pedidos_extras").insert({
    org_id: org,
    cliente_id: b.clienteId,
    tumulo_id: b?.tumuloId || null,
    extra_id: b?.extraId || null,
    servico_id: b?.servicoId || null,
    nome: String(b.nome).trim(),
    quantidade: qtd,
    preco_unit: preco,
    total: Math.round(qtd * preco * 100) / 100,
    observacao: b?.observacao || null,
  }).select("id").single();

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: (data as any)?.id });
}

// PUT { pedidoId, acao: 'entregar' | 'cancelar', fotoUrl? }
export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const b = await req.json().catch(() => ({}));
  if (!b?.pedidoId) return NextResponse.json({ ok: false, erro: "pedido_obrigatorio" }, { status: 400 });

  if (b.acao === "cancelar") {
    await auth.db.from("pedidos_extras").update({ status: "cancelado" }).eq("id", b.pedidoId);
    return NextResponse.json({ ok: true });
  }

  // entregar: lança o débito na conta da família
  const { data, error } = await auth.db.rpc("sureya_entregar_extra", {
    p_pedido: b.pedidoId, p_foto: b?.fotoUrl || null,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, movimentoId: data });
}
