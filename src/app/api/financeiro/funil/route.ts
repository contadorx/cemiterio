import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { calcularSaldosPorFamilia } from "@/lib/financeiro";
import { previewCompetencia } from "@/lib/competencia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O FUNIL DO DINHEIRO (CA-09).
 *
 * O Financeiro já tinha uma porta só no menu — e a auditoria mostrou que a
 * consolidação tinha só EMPURRADO a complexidade para dentro da página: abas,
 * subabas, entrada, fechamento, resultado por jazigo, conferência bancária.
 *
 * O funil é o vocabulário do dinheiro posto em ordem (`src/lib/vocabulario.ts`).
 * Cada etapa é uma pergunta que só faz sentido depois da anterior ter resposta:
 *
 *   a identificar   caiu no banco. De quem é?
 *   a conferir      chegou com dono. Está certo?
 *   a receber       está lançado e não entrou. Quem falta?
 *   fechar o mês    tudo conferido? Então dá para fechar.
 *
 * CADA NÚMERO VEM DA MESMA REGRA DA TELA QUE ELE ABRE — a lição de sempre nesta
 * casa. `a receber` usa `calcularSaldosPorFamilia`, a MESMA função da ficha e
 * da lista de famílias; `fechar` usa `previewCompetencia`, a mesma da tela de
 * fechamento. Uma segunda conta aqui começaria igual e terminaria discordando.
 */
export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  // VAZIO NÃO É ZERO, de novo: etapa que não deu para ler vem `null`, e a tela
  // diz que não soube em vez de anunciar que não há trabalho ali.
  const n = (r: any) => (r?.error ? null : (r?.count ?? 0));

  const [semDono, compAConferir, ccAConferir, familias] = await Promise.all([
    db.from("entradas_banco").select("id", { count: "exact", head: true })
      .eq("org_id", org).is("cliente_id", null),
    db.from("comprovantes").select("id", { count: "exact", head: true })
      .eq("org_id", org).eq("status", "a_conferir"),
    db.from("conta_corrente").select("id", { count: "exact", head: true })
      .eq("org_id", org).eq("status_conc", "a_conferir"),
    db.from("familias").select("id").eq("org_id", org).limit(2000),
  ]);

  // A RECEBER — pela função que a ficha da família usa.
  let aReceber: { familias: number; total: number } | null = null;
  try {
    const ids = (familias.data || []).map((f: any) => f.id);
    const saldos = await calcularSaldosPorFamilia(ids);
    let quantas = 0, total = 0;
    for (const s of saldos.values()) {
      if (s.saldo < -0.005) { quantas++; total += -s.saldo; }
    }
    aReceber = { familias: quantas, total: Math.round(total * 100) / 100 };
  } catch (e) {
    // `calcularSaldosPorFamilia` levanta em vez de devolver zero, de propósito
    // (0122). Aqui a gente respeita isso e diz que não soube.
    console.error("[funil] a receber:", e);
  }

  let fechar: { novos: number; total: number; competencia: string } | null = null;
  try {
    const p: any = await previewCompetencia(org);
    fechar = { novos: p.novos ?? 0, total: p.total ?? 0, competencia: p.competencia };
  } catch (e) {
    console.error("[funil] fechar:", e);
  }

  const conferir = compAConferir?.error || ccAConferir?.error
    ? null
    : (n(compAConferir) || 0) + (n(ccAConferir) || 0);

  return NextResponse.json({
    ok: true,
    identificar: n(semDono),
    conferir,
    aReceber,
    fechar,
  });
}
