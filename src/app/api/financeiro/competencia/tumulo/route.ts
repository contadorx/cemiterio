import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import {
  debitoDaCompetencia, competenciaDe, type TumuloCobranca,
} from "@/lib/conta-corrente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * PÔR NA CONTA O QUE JÁ VENCEU — de um túmulo só.
 *
 * POR QUE ISTO PRECISA EXISTIR
 * O fechamento automático roda no dia 1 e olha o mês corrente. Mas a Sureya
 * está cadastrando agora contratos que começaram meses atrás: uma família que
 * paga desde março entra no sistema em agosto, e o extrato dela nasceria vazio
 * — como se nada fosse devido.
 *
 * Aqui o sistema percorre da data de início até o mês atual e lança tudo que
 * aquele plano teria gerado. O extrato passa a contar a verdade desde o
 * começo.
 *
 * GET  → prévia: quais meses entrariam e quanto somam, sem gravar.
 * POST → lança.
 *
 * A trava contra cobrar duas vezes continua sendo o índice único
 * (tumulo_id, competencia): rodar isto depois do fechamento automático, ou
 * duas vezes seguidas, não duplica nada.
 */

async function calcular(db: any, org: string, tumuloId: string) {
  const { data: t, error } = await db
    .from("tumulos")
    .select("id,familia_id,valor_lavagem,valor_base,periodicidade,freq_pagamento,contratado,inicio_cobranca,created_at")
    .eq("id", tumuloId)
    .eq("org_id", org)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!t) throw new Error("tumulo_nao_encontrado");
  if (!(t as any).contratado) throw new Error("tumulo_sem_plano");
  if (!(t as any).familia_id) throw new Error("tumulo_sem_familia");

  const alvo: TumuloCobranca = {
    tumuloId: (t as any).id,
    familiaId: (t as any).familia_id,
    contratado: true,
    valorLavagem: Number((t as any).valor_lavagem || 0),
    valorBase: (t as any).valor_base ?? "mes",
    periodicidade: (t as any).periodicidade,
    freqPagamento: (t as any).freq_pagamento,
    inicioCobranca: (t as any).inicio_cobranca ?? null,
  };

  const inicio = (t as any).inicio_cobranca
    ? String((t as any).inicio_cobranca).slice(0, 10)
    : competenciaDe(new Date((t as any).created_at));

  // Do início até o mês corrente, inclusive. O mês que ainda não terminou
  // entra: a manutenção dele já está contratada, e é assim que o fechamento
  // automático do dia 1 também faz.
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

  // O que já está na conta não entra de novo na prévia — mostrar um total que
  // o banco vai recusar só assusta.
  const { data: jaFeitos } = await db
    .from("conta_corrente")
    .select("competencia")
    .eq("tumulo_id", tumuloId)
    .eq("origem", "competencia");

  const feitos = new Set((jaFeitos || []).map((x: any) => String(x.competencia).slice(0, 10)));
  const novos = previstos.filter((l) => !feitos.has(String(l.competencia).slice(0, 10)));

  return { org, novos, jaLancados: previstos.length - novos.length, inicio };
}

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const tumuloId = req.nextUrl.searchParams.get("tumuloId");
  if (!tumuloId) return NextResponse.json({ ok: false, erro: "tumulo_obrigatorio" }, { status: 400 });

  try {
    const r = await calcular(auth.db, org, tumuloId);
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
  const tumuloId = String(b?.tumuloId || "");
  if (!tumuloId) return NextResponse.json({ ok: false, erro: "tumulo_obrigatorio" }, { status: 400 });

  try {
    const r = await calcular(auth.db, org, tumuloId);

    // Um a um: em lote, um único conflito derrubaria a transação inteira e
    // nenhum mês entraria.
    let lancados = 0, repetidos = 0, total = 0;
    for (const l of r.novos) {
      const { error } = await auth.db.from("conta_corrente").insert({
        org_id: org,
        familia_id: l.familiaId,
        tumulo_id: l.tumuloId,
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
