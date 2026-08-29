import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { auditar } from "@/lib/auditoria";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O QUE FOI PROMETIDO E AINDA NÃO FOI RESPONDIDO (0142).
 *
 * Medido em 29/08, em produção: das 25 respostas a mensagens de família, 11
 * (44%) prometiam voltar — "deixa eu conferir isso direitinho e já te falo" —
 * e **nenhuma** deixava registro. A família ficava esperando um retorno que
 * ninguém sabia que devia.
 *
 * Seis dessas onze eram "recebi seu comprovante, vou conferir e te confirmo".
 * Essa promessa é verdadeira: o comprovante fica `a_conferir` até alguém
 * confirmar. O que faltava era o caminho de volta — medido junto: 94
 * lançamentos, zero conferidos.
 *
 * GET   o que está em aberto, o mais vencido primeiro.
 * POST  { id, desfecho } fecha um: "respondido" ou "nao_cabe".
 *
 * NADA AQUI ENVIA NADA. Fechar um compromisso é dizer que o assunto foi
 * resolvido; a mensagem, se houver, sai pela fila de sempre, com o seu toque.
 */

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const { data, error } = await auth.db.rpc("sureya_compromissos_abertos", { p_org: org });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // UMA DEFINICAO SO DE "EM ABERTO".
  //
  // A tela da conversa quer as promessas daquela conversa; o "Precisa de voce"
  // quer todas. A tentacao era dar uma consulta propria para cada uma — e e
  // assim que nascem duas regras que discordam (0092, 0105, 0115, 0137, 0140).
  // Aqui a RPC continua sendo a unica que decide o que esta aberto e o que
  // esta atrasado; o filtro so escolhe um pedaco do que ela devolveu.
  const conversa = (req.nextUrl.searchParams.get("conversa") || "").trim();
  const todos = (data as any[]) || [];
  const lista = conversa ? todos.filter((c) => c.conversa_id === conversa) : todos;

  return NextResponse.json({
    ok: true,
    compromissos: lista,
    atrasados: lista.filter((c) => c.atrasado).length,
  });
}

export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({} as any));
  const id = String(b?.id || "").trim();
  const desfecho = String(b?.desfecho || "").trim();

  if (!id) return NextResponse.json({ ok: false, erro: "sem_id" }, { status: 400 });

  // DOIS DESFECHOS, E ELES DIZEM COISAS DIFERENTES.
  //
  // "respondido" = a família ouviu a resposta. "nao_cabe" = a promessa perdeu
  // sentido (ela resolveu sozinha, o assunto morreu). Um botão só de "feito"
  // misturaria as duas, e daqui a três meses ninguém saberia se a família foi
  // respondida ou se a pendência foi varrida para debaixo do tapete.
  if (!["respondido", "nao_cabe"].includes(desfecho)) {
    return NextResponse.json(
      { ok: false, erro: "desfecho_invalido",
        mensagem: "Diga se a família foi respondida ou se o assunto não cabe mais." },
      { status: 400 });
  }

  const { error } = await auth.db
    .from("compromissos")
    .update({
      cumprido_em: new Date().toISOString(),
      cumprido_por: auth.userId || null,
      desfecho,
    })
    .eq("id", id)
    .eq("org_id", org)
    // JÁ CUMPRIDO NÃO SE CUMPRE DE NOVO: sem isto, um duplo toque reescreveria
    // a data e o autor de um fechamento que já tinha dono.
    .is("cumprido_em", null);

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  await auditar(auth.db, org, auth.userId || null, "cumpriu_compromisso",
    { tipo: "compromisso", id }, { desfecho });

  return NextResponse.json({ ok: true });
}
