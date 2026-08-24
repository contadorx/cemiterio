import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { executarCampanha, preverCampanha, PUBLICOS, type Publico } from "@/lib/campanha";
import { auditar } from "@/lib/auditoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const { data } = await auth.db
    .from("campanhas")
    .select("id,nome,publico,criados,executada_em")
    .order("executada_em", { ascending: false })
    .limit(20);

  // QUANTAS FAMÍLIAS RECEBERIAM, ANTES DE DISPARAR.
  //
  // Sem este número o público é um nome sem tamanho: "ativos" já selecionou
  // quase ninguém em silêncio uma vez, porque olhava uma tabela que esvaziou.
  // Ver a contagem antes é o que impede um aviso sair para três casas achando
  // que saiu para trezentas — ou o contrário.
  const p = req.nextUrl.searchParams.get("prever");
  let previa = null;
  if (p && PUBLICOS.some((x) => x.id === p)) {
    try { previa = await preverCampanha(p as Publico); } catch { previa = null; }
  }

  return NextResponse.json({
    ok: true, campanhas: data || [], publicos: PUBLICOS, previa,
  });
}

/**
 * POST { nome, mensagem, publico } — enche a FILA DE LIBERAÇÃO. Não envia.
 *
 * Até aqui isto escrevia em `interacoes_ia`, a lista solta de rascunhos que a
 * 0094 apagou: a campanha rodava, dizia "criei 338" e os 338 caíam num lugar
 * sem tela. Agora caem na fila, no grupo "Demais", onde há marcar em lote,
 * enviar em lote e parar no meio.
 */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const body = await req.json().catch(() => ({}));
  const nome = (body?.nome || "").trim();
  const mensagem = (body?.mensagem || "").trim();
  const publico: Publico = PUBLICOS.some((x) => x.id === body?.publico)
    ? body.publico
    // "todas" como padrão, e não um público estreito: um aviso que sai para
    // menos gente do que se pensava é mais difícil de perceber do que um que
    // sai para mais — a fila ainda está entre ele e a família.
    : "todas";

  if (!nome || mensagem.length < 10) {
    return NextResponse.json(
      { ok: false, erro: "nome_e_mensagem_obrigatorios",
        mensagem: "Dê um nome ao aviso e escreva a mensagem (ao menos 10 letras)." },
      { status: 400 });
  }

  const r = await executarCampanha({ nome, mensagem, publico });

  const org = await orgAtual(auth.db);
  if (org) await auditar(auth.db, org, auth.userId, "executou_campanha", { tipo: "campanha", id: r.campanhaId || undefined }, { nome, publico, criados: r.criados });

  return NextResponse.json({ ok: true, ...r });
}
