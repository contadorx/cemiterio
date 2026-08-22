import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O FECHAMENTO DO MÊS — uma lista só.
 *
 * Famílias com saldo em aberto, da mais antiga para a mais recente. É a tela
 * que a Sureya abre uma vez por mês, de cima para baixo, mandando a cobrança
 * pela fila de liberação.
 *
 * A ordem por dívida mais antiga é deliberada: quem está devendo há três
 * meses precisa de uma conversa diferente de quem esqueceu o mês corrente, e
 * é a antiguidade que revela isso — não o valor.
 */
export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const { data, error } = await db
    .from("conta_corrente")
    .select("familia_id,tipo,valor,data,competencia,origem,familias(nome)")
    .eq("org_id", org)
    .limit(5000);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  interface Acc {
    familiaId: string;
    nome: string;
    saldo: number;
    desde: string | null;      // a competência em aberto mais antiga
    ultimoPagamento: string | null;
  }

  const porFamilia = new Map<string, Acc>();

  for (const l of (data || []) as any[]) {
    const id = l.familia_id;
    const atual = porFamilia.get(id) || {
      familiaId: id,
      nome: l.familias?.nome || "(sem nome)",
      saldo: 0,
      desde: null,
      ultimoPagamento: null,
    };

    const valor = Number(l.valor);
    if (l.tipo === "debito") {
      atual.saldo += valor;
      const quando = l.competencia || l.data;
      if (quando && (!atual.desde || quando < atual.desde)) atual.desde = quando;
    } else {
      atual.saldo -= valor;
      if (l.data && (!atual.ultimoPagamento || l.data > atual.ultimoPagamento)) {
        atual.ultimoPagamento = l.data;
      }
    }
    porFamilia.set(id, atual);
  }

  const dinheiro = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const emAberto = [...porFamilia.values()]
    .map((f) => ({ ...f, saldo: Math.round(f.saldo * 100) / 100 }))
    .filter((f) => f.saldo > 0.005)
    .sort((a, b) => (a.desde || "9999").localeCompare(b.desde || "9999"))
    .map((f) => ({ ...f, frase: `Em aberto · ${dinheiro(f.saldo)}` }));

  const totalEmAberto = Math.round(
    emAberto.reduce((s, f) => s + f.saldo, 0) * 100
  ) / 100;

  return NextResponse.json({
    ok: true,
    familias: emAberto,
    quantas: emAberto.length,
    totalEmAberto,
  });
}
