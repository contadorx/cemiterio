import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Visão de GESTÃO do negócio (não é o extrato das famílias).
 * Entradas x saídas por categoria, resultado do mês e custo estimado de IA.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);

  const mes = req.nextUrl.searchParams.get("mes") || new Date().toISOString().slice(0, 7);
  const ini = `${mes}-01`;
  const d = new Date(ini + "T00:00:00");
  const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [{ data: fluxo }, { data: lancs }, { data: cats }, { data: orgRow }, { data: usoIa }] =
    await Promise.all([
      db.rpc("sureya_fluxo_caixa", { p_mes: mes }),
      db.from("lancamentos")
        .select("id,tipo,valor,data,descricao,automatico,categorias_financeiras(nome,grupo)")
        .gte("data", ini).lte("data", fim).order("data", { ascending: false }).limit(200),
      db.from("categorias_financeiras").select("id,nome,tipo,grupo").eq("ativa", true).order("tipo").order("nome"),
      db.from("orgs").select("custo_ia_por_chamada").eq("id", org).maybeSingle(),
      db.from("uso_ia").select("dia,chamadas,tokens_entrada,tokens_saida,custo_real")
        .gte("dia", ini).lte("dia", fim).order("dia"),
    ]);

  // custo de IA estimado no mês
  const custoUnit = Number((orgRow as any)?.custo_ia_por_chamada) || 0.05;
  const chamadas = (usoIa || []).reduce((s: number, u: any) => s + (Number(u.chamadas) || 0), 0);
  const diasComUso = (usoIa || []).length;
  // custo REAL medido por tokens; se ainda não houver medição, cai na estimativa
  const custoMedido = (usoIa || []).reduce((s: number, u: any) => s + (Number(u.custo_real) || 0), 0);
  const tokens = (usoIa || []).reduce(
    (a: any, u: any) => ({
      entrada: a.entrada + (Number(u.tokens_entrada) || 0),
      saida: a.saida + (Number(u.tokens_saida) || 0),
    }), { entrada: 0, saida: 0 });
  const medido = custoMedido > 0;
  const custoIa = Math.round((medido ? custoMedido : chamadas * custoUnit) * 100) / 100;

  // recebido das famílias no mês (entra como entrada operacional, mesmo sem lançamento manual)
  const { data: movs } = await db
    .from("movimentos").select("tipo,valor,status_conc,data")
    .gte("data", ini).lte("data", fim).eq("status_conc", "confirmado");
  const recebidoFamilias = (movs || [])
    .filter((m: any) => m.tipo === "credito")
    .reduce((s: number, m: any) => s + Number(m.valor), 0);

  let entradas = 0, saidas = 0;
  for (const f of (fluxo || []) as any[]) {
    if (f.tipo === "entrada") entradas += Number(f.total);
    else saidas += Number(f.total);
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  return NextResponse.json({
    ok: true,
    mes,
    fluxo: fluxo || [],
    lancamentos: lancs || [],
    categorias: cats || [],
    resumo: {
      entradas: r2(entradas),
      saidas: r2(saidas),
      resultado: r2(entradas - saidas),
      recebidoFamilias: r2(recebidoFamilias),
      naoLancado: r2(Math.max(0, recebidoFamilias - entradas)),
    },
    ia: {
      medido,
      tokensEntrada: tokens.entrada,
      tokensSaida: tokens.saida,
      chamadas,
      diasComUso,
      custoUnitario: custoUnit,
      custoMes: custoIa,
      custoPorDia: diasComUso ? r2(custoIa / diasComUso) : 0,
      mediaChamadasDia: diasComUso ? Math.round(chamadas / diasComUso) : 0,
    },
  });
}

// POST { tipo, valor, data, categoriaId, descricao }
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const valor = Number(b?.valor);
  if (!valor || valor <= 0) return NextResponse.json({ ok: false, erro: "valor_invalido" }, { status: 400 });
  const tipo = b?.tipo === "entrada" ? "entrada" : "saida";

  const { error } = await auth.db.from("lancamentos").insert({
    org_id: org, tipo, valor,
    data: b?.data || new Date().toISOString().slice(0, 10),
    categoria_id: b?.categoriaId || null,
    descricao: b?.descricao || null,
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
