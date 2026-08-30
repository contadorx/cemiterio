import { NextRequest, NextResponse } from "next/server";
import { exigirLogado, exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { auditar } from "@/lib/auditoria";
import { formaDaQuadra, mesmoLugar } from "@/lib/lugar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lista as quadras para os seletores de localização.
export async function GET() {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;
  const { data } = await auth.db
    .from("quadras")
    .select("id,codigo,ordem,cemiterio_id,cemiterios(nome)")
    .order("ordem");
  return NextResponse.json({ ok: true, quadras: data || [] });
}

/**
 * CRIAR A QUADRA — o primeiro passo de um cemitério novo.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO NÃO EXISTIA, E POR QUE PRECISA EXISTIR AGORA
 * ---------------------------------------------------------------------------
 * As 4 quadras e 44 ruas do Cemitério da Saudade nasceram de uma migration. Não
 * havia caminho pelo painel — e nunca fez falta, porque só havia um cemitério
 * e ele já vinha pronto.
 *
 * Com o Santa Lídia (cadastrado em 23/08, com 0 quadras) isso trava tudo: a
 * rota de cadastro de jazigo EXIGE que a quadra exista, e responde "Escolha a
 * quadra na lista" — com a lista vazia. Não há por onde começar.
 *
 * A DIGITAÇÃO LIVRE VOLTA AQUI, E COM ELA O DEFEITO DAS TREZE QUADRAS. Por
 * isso o nome passa por `formaDaQuadra` antes de gravar, e a rota RECUSA
 * quando o mesmo lugar já existe escrito de outro jeito — o índice único do
 * banco só pega "Q1" contra "Q1"; "QD 1" passaria por ele.
 */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({} as any));
  const cemiterioId = String(b?.cemiterioId || "").trim();
  const codigo = formaDaQuadra(String(b?.codigo || ""));

  if (!cemiterioId) {
    return NextResponse.json({ ok: false, erro: "cemiterio_obrigatorio",
      mensagem: "Diga em qual cemitério a quadra fica." }, { status: 400 });
  }
  if (!codigo) {
    return NextResponse.json({ ok: false, erro: "codigo_obrigatorio",
      mensagem: "A quadra precisa de um código. Ex.: Q1." }, { status: 400 });
  }

  // O cemitério tem de ser desta org — RLS já protege a leitura, mas uma
  // mensagem clara vale mais que um erro de chave estrangeira.
  const { data: cem } = await db
    .from("cemiterios").select("id,nome").eq("id", cemiterioId).maybeSingle();
  if (!cem) {
    return NextResponse.json({ ok: false, erro: "cemiterio_nao_encontrado" }, { status: 404 });
  }

  // O MESMO LUGAR COM OUTRO NOME. É esta checagem que o índice único não faz.
  const { data: existentes } = await db
    .from("quadras").select("id,codigo,ordem").eq("cemiterio_id", cemiterioId).order("ordem");
  const igual = (existentes || []).find((q: any) => mesmoLugar(q.codigo, codigo, "quadra"));
  if (igual) {
    return NextResponse.json({
      ok: false, erro: "quadra_ja_existe",
      mensagem: `Esta quadra já está cadastrada como "${(igual as any).codigo}".`,
      quadra: igual,
    }, { status: 409 });
  }

  // A ordem é a da caminhada, e o padrão é a ordem de cadastro: quem cadastra
  // está lá, andando o cemitério na ordem em que ele existe.
  const proxima = ((existentes || []).reduce(
    (m: number, q: any) => Math.max(m, Number(q.ordem) || 0), 0)) + 1;

  const { data, error } = await db
    .from("quadras")
    .insert({ org_id: org, cemiterio_id: cemiterioId, codigo,
              ordem: Number.isFinite(Number(b?.ordem)) && b?.ordem !== null && b?.ordem !== ""
                     ? Number(b.ordem) : proxima })
    .select("id,codigo,ordem")
    .single();
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  await auditar(db, org, auth.userId || null, "criou_quadra",
    { tipo: "quadra", id: (data as any).id }, { cemiterio: (cem as any).nome, codigo });

  return NextResponse.json({ ok: true, quadra: data });
}
