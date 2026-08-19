import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { competenciaDe } from "@/lib/conta-corrente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * FECHAR O MÊS NO MODO CONSUMO.
 *
 * O QUE ISTO RESOLVE
 * Cada limpeza debita o que vale. Se a Nina esquecer uma semana, a família é
 * debitada por três limpezas e sobra crédito.
 *
 * Mas o combinado é MENSAL: a família paga R$ 100 pelo mês, não R$ 25 por
 * limpeza. Sem fechar, esse crédito vira desconto no mês seguinte sem ninguém
 * ter decidido — e a Sureya descobre a perda quando o dinheiro não entra.
 *
 * O ajuste completa a diferença entre o que o mês valia e o que as limpezas
 * consumiram, e fica registrado com nome: "faltou 1 limpeza".
 *
 * NÃO É AUTOMÁTICO, de propósito. A Sureya pode preferir deixar o crédito com
 * a família justamente porque não entregou o serviço. Cobrar por uma limpeza
 * que não aconteceu é uma decisão dela, não do sistema.
 *
 * GET  → prévia: quanto falta, e quantas limpezas.
 * POST → lança o ajuste.
 */

async function calcular(db: any, org: string, familiaId: string, competencia: string) {
  const { data: fam } = await db
    .from("familias")
    .select("id,valor_mensal,valor_base,freq_pagamento,contratado,modo_cobranca")
    .eq("id", familiaId)
    .eq("org_id", org)
    .maybeSingle();

  const f = fam as any;
  if (!f) throw new Error("familia_nao_encontrada");
  if (!f.contratado) throw new Error("familia_sem_plano");
  if (f.modo_cobranca !== "consumo") throw new Error("familia_modo_competencia");

  const MESES: Record<string, number> = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };
  const bruto = Number(f.valor_mensal || 0);
  const devidoNoMes = f.valor_base === "cobranca"
    ? bruto / (MESES[f.freq_pagamento] || 1)
    : bruto;

  // Os lançamentos daquele mês. `data` é o dia do lançamento, e é por ele que
  // a lavagem entra no mês — a competência dela é nula.
  const d = new Date(`${competencia}T12:00:00`);
  d.setMonth(d.getMonth() + 1);
  const fimExclusivo = d.toISOString().slice(0, 10);

  const { data: doMes } = await db
    .from("conta_corrente")
    .select("id,origem,valor,data")
    .eq("familia_id", familiaId)
    .gte("data", competencia)
    .lt("data", fimExclusivo);

  const linhas = (doMes || []) as any[];
  const lavagens = linhas.filter((l) => l.origem === "lavagem");
  const consumido = lavagens.reduce((s, l) => s + Number(l.valor || 0), 0);
  const jaAjustado = linhas.some((l) => l.origem === "ajuste");

  const falta = Math.round((devidoNoMes - consumido) * 100) / 100;

  return {
    devidoNoMes: Math.round(devidoNoMes * 100) / 100,
    consumido: Math.round(consumido * 100) / 100,
    limpezas: lavagens.length,
    falta,
    jaAjustado,
  };
}

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const familiaId = req.nextUrl.searchParams.get("familiaId");
  const competencia = req.nextUrl.searchParams.get("competencia") || competenciaDe(new Date());
  if (!familiaId) return NextResponse.json({ ok: false, erro: "familia_obrigatoria" }, { status: 400 });

  try {
    const r = await calcular(auth.db, org, familiaId, competencia);
    return NextResponse.json({ ok: true, competencia, ...r });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: String(e?.message || e) }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const familiaId = String(b?.familiaId || "");
  const competencia = String(b?.competencia || competenciaDe(new Date()));
  if (!familiaId) return NextResponse.json({ ok: false, erro: "familia_obrigatoria" }, { status: 400 });

  try {
    const r = await calcular(auth.db, org, familiaId, competencia);

    if (r.falta <= 0.005) {
      return NextResponse.json({
        ok: false,
        erro: "nada_a_ajustar",
        mensagem: r.falta < -0.005
          ? "As limpezas do mês passaram do valor combinado. Não há o que completar."
          : "O mês já fechou no valor combinado.",
      }, { status: 400 });
    }

    const MES = ["janeiro","fevereiro","março","abril","maio","junho",
                 "julho","agosto","setembro","outubro","novembro","dezembro"];
    const nomeMes = `${MES[Number(competencia.slice(5, 7)) - 1]}/${competencia.slice(2, 4)}`;

    const { error } = await auth.db.from("conta_corrente").insert({
      org_id: org,
      familia_id: familiaId,
      tumulo_id: null,
      tipo: "debito",
      origem: "ajuste",
      competencia,
      valor: r.falta,
      // O nome diz o que aconteceu: quem abrir o extrato daqui a um ano
      // precisa entender que ali faltou serviço, e não que houve uma cobrança
      // extra sem motivo.
      descricao: `Fechamento de ${nomeMes} · ${r.limpezas} limpeza(s) no mês`,
      data: competencia,
    });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { ok: false, erro: "ja_ajustado", mensagem: "Este mês já foi fechado." },
          { status: 409 },
        );
      }
      return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, valor: r.falta, limpezas: r.limpezas });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: String(e?.message || e) }, { status: 400 });
  }
}
