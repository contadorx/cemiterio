import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { executarCampanha, type Publico } from "@/lib/campanha";
import { auditar } from "@/lib/auditoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const { data } = await auth.db
    .from("campanhas")
    .select("id,nome,publico,criados,executada_em")
    .order("executada_em", { ascending: false })
    .limit(20);
  return NextResponse.json({ ok: true, campanhas: data || [] });
}

// POST { nome, mensagem, publico } -> cria rascunhos em lote (não envia)
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const body = await req.json().catch(() => ({}));
  const nome = (body?.nome || "").trim();
  const mensagem = (body?.mensagem || "").trim();
  const publico: Publico = ["todos", "ativos", "em_aberto", "sem_servico_90d"].includes(body?.publico)
    ? body.publico
    : "ativos";

  if (!nome || mensagem.length < 10) {
    return NextResponse.json({ ok: false, erro: "nome_e_mensagem_obrigatorios" }, { status: 400 });
  }

  const r = await executarCampanha({ nome, mensagem, publico });

  const org = await orgAtual(auth.db);
  if (org) await auditar(auth.db, org, auth.userId, "executou_campanha", { tipo: "campanha", id: r.campanhaId || undefined }, { nome, publico, criados: r.criados });

  return NextResponse.json({ ok: true, ...r });
}
