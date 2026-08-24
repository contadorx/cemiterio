import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { env } from "@/lib/env";
import { refazerRoteiro } from "@/lib/agenda";
import { diaOperacao, somaDias } from "@/lib/vencimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * O ROTEIRO ESTÁ VELHO? — e refazer.
 *
 * POR QUE NÃO RECALCULAR SOZINHO
 *
 * A tentação é redistribuir a cada contrato salvo. Seria errado: ela está
 * cadastrando duzentos contratos hoje, e a agenda inteira se remexendo a cada
 * "Salvar" é uma tela que pisca sem ninguém pedir — e duzentas rodadas de
 * alocação para chegar ao mesmo lugar de uma.
 *
 * Então o sistema MEDE e OFERECE: "entraram 34 lavagens desde que você refez o
 * roteiro". Um clique, quando ela decidir que terminou de cadastrar.
 */

/** GET — quanto o roteiro envelheceu desde a última vez que foi refeito. */
export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const db = supabaseAdmin();
  const org = env.orgId();
  const amanha = somaDias(diaOperacao(), 1);

  const { data: cfg } = await db
    .from("orgs").select("roteiro_refeito_em").eq("id", org).maybeSingle();
  const refeitoEm = (cfg as any)?.roteiro_refeito_em || null;

  // QUANTAS LAVAGENS FUTURAS NASCERAM DEPOIS DA ÚLTIMA DISTRIBUIÇÃO COMPLETA.
  //
  // É o número que responde "vale a pena refazer?". Sem `roteiro_refeito_em`
  // gravado (nunca foi refeito), a resposta é "todas as que existem" — que é
  // a verdade: nenhuma delas passou por uma distribuição completa.
  let q = db.from("servicos")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org)
    .in("status", ["pendente", "agendado"])
    .gte("data_prevista", amanha);
  if (refeitoEm) q = q.gt("created_at", refeitoEm);
  const { count: novas } = await q;

  // E QUANTAS ELE PODERIA REMEXER — o tamanho do trabalho, não do problema.
  const { count: soltaveis } = await db.from("servicos")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org)
    .eq("status", "agendado")
    .gte("data_prevista", amanha)
    .is("fixado_em", null)
    .is("iniciado_em", null)
    .is("foto_antes_url", null);

  return NextResponse.json({
    ok: true,
    refeitoEm,
    novasDesdeEntao: Number(novas) || 0,
    redistribuiveis: Number(soltaveis) || 0,
    aPartirDe: amanha,
  });
}

/** POST — refaz de amanhã em diante. */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  try {
    const r = await refazerRoteiro(b?.aPartirDe || undefined);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: String(e?.message || e) }, { status: 500 });
  }
}
