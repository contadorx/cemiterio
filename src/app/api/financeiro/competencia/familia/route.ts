import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import {
  debitoDaCompetencia, competenciaDe, type FamiliaCobranca,
} from "@/lib/conta-corrente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * PÔR NA CONTA O QUE JÁ VENCEU — de uma família só.
 *
 * O fechamento automático roda no dia 1 e olha o mês corrente. Mas a Sureya
 * está cadastrando agora contratos que começaram meses atrás: uma família que
 * paga desde março entra no sistema em agosto, e o extrato nasceria vazio,
 * como se nada fosse devido.
 *
 * Aqui o sistema percorre do início da cobrança até o mês atual e lança tudo
 * que o contrato teria gerado.
 *
 * GET  → prévia: quais meses entrariam e quanto somam, sem gravar.
 * POST → lança.
 *
 * A trava contra duplicar é o índice único (familia_id, competencia): rodar
 * isto depois do fechamento automático, ou duas vezes, não repete nada.
 */

async function calcular(db: any, org: string, familiaId: string) {
  const { data: f, error } = await db
    .from("familias")
    .select("id,valor_mensal,valor_base,freq_pagamento,contratado,inicio_cobranca,modo_cobranca,created_at")
    .eq("id", familiaId)
    .eq("org_id", org)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!f) throw new Error("familia_nao_encontrada");
  if (!(f as any).contratado) throw new Error("familia_sem_plano");
  // No modo consumo não existe "mês em aberto": o débito nasce de cada
  // limpeza. Oferecer o botão aqui geraria cobrança em duplicidade.
  if ((f as any).modo_cobranca !== "competencia") throw new Error("familia_modo_consumo");

  const alvo: FamiliaCobranca = {
    familiaId: (f as any).id,
    contratado: true,
    valorMensal: Number((f as any).valor_mensal || 0),
    valorBase: (f as any).valor_base ?? "mes",
    freqPagamento: (f as any).freq_pagamento,
    inicioCobranca: (f as any).inicio_cobranca ?? null,
  };

  const inicio = (f as any).inicio_cobranca
    ? String((f as any).inicio_cobranca).slice(0, 10)
    : competenciaDe(new Date((f as any).created_at));

  // Do início até o mês corrente, inclusive. O mês que ainda não terminou
  // entra: a manutenção dele já está contratada, e é o mesmo critério do
  // fechamento do dia 1.
  const hoje = competenciaDe(new Date());
  const meses: string[] = [];
  const d = new Date(`${inicio}T12:00:00`);
  let guarda = 0;
  while (competenciaDe(d) <= hoje && guarda++ < 240) {
    meses.push(competenciaDe(d));
    d.setMonth(d.getMonth() + 1);
  }

  const previstos = meses
    .map((m) => debitoDaCompetencia(alvo, m))
    .filter((l): l is NonNullable<typeof l> => l !== null);

  // O que já está na conta não entra na prévia: mostrar um total que o banco
  // vai recusar só assusta.
  const { data: jaFeitos } = await db
    .from("conta_corrente")
    .select("competencia")
    .eq("familia_id", familiaId)
    .eq("origem", "competencia");

  const feitos = new Set((jaFeitos || []).map((x: any) => String(x.competencia).slice(0, 10)));
  const novos = previstos.filter((l) => !feitos.has(String(l.competencia).slice(0, 10)));

  return { novos, jaLancados: previstos.length - novos.length, inicio };
}

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const familiaId = req.nextUrl.searchParams.get("familiaId");
  if (!familiaId) return NextResponse.json({ ok: false, erro: "familia_obrigatoria" }, { status: 400 });

  try {
    const r = await calcular(auth.db, org, familiaId);
    return NextResponse.json({
      ok: true,
      inicio: r.inicio,
      novos: r.novos.length,
      jaLancados: r.jaLancados,
      total: Math.round(r.novos.reduce((s, l) => s + l.valor, 0) * 100) / 100,
      meses: r.novos.map((l) => l.competencia),
    });
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
  if (!familiaId) return NextResponse.json({ ok: false, erro: "familia_obrigatoria" }, { status: 400 });

  try {
    const r = await calcular(auth.db, org, familiaId);

    // Um a um: em lote, um único conflito derrubaria a transação inteira e
    // nenhum mês entraria.
    let lancados = 0, repetidos = 0, total = 0;
    for (const l of r.novos) {
      const { error } = await auth.db.from("conta_corrente").insert({
        org_id: org,
        familia_id: l.familiaId,
        tumulo_id: null,
        tipo: "debito",
        origem: "competencia",
        competencia: l.competencia,
        valor: l.valor,
        descricao: l.descricao,
        data: l.competencia,
      });
      if (!error) { lancados++; total += l.valor; }
      else if (error.code === "23505") repetidos++;
      else throw new Error(error.message);
    }

    return NextResponse.json({
      ok: true, lancados, repetidos,
      total: Math.round(total * 100) / 100,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: String(e?.message || e) }, { status: 400 });
  }
}
