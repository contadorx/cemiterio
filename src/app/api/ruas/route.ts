import { NextRequest, NextResponse } from "next/server";
import { exigirLogado, exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { auditar } from "@/lib/auditoria";
import { formaDaRua, mesmoLugar } from "@/lib/lugar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * As ruas de uma quadra, na ordem em que se caminha.
 *
 * Existe para que a tela de cadastro no campo ofereça uma LISTA em vez de um
 * campo de digitar. Foi digitação livre que transformou quatro quadras em
 * treze — "QD 1", "Q1", "Qd 1", "Q01" e "Quadra 1" eram o mesmo lugar. Com a
 * rua o risco é o mesmo: "RUA 5", "Rua 5" e "R5" virariam três ruas.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;

  const quadraId = req.nextUrl.searchParams.get("quadraId");
  if (!quadraId) {
    return NextResponse.json({ ok: false, erro: "quadra_obrigatoria" }, { status: 400 });
  }

  const { data, error } = await auth.db
    .from("ruas")
    .select("id,nome,tipo,ordem,observacao")
    .eq("quadra_id", quadraId)
    .order("ordem");

  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ruas: data || [] });
}

/**
 * CRIAR A RUA — sem ela o jazigo fica fora do roteiro.
 *
 * A rota de cadastro de jazigo exige a rua e explica por quê: "é ela que
 * coloca o jazigo na ordem da caminhada. Sem rua, o túmulo fica fora do
 * roteiro e a Nina só descobre andando."
 *
 * Mesma proteção da quadra: "R5", "rua 5" e "RUA 05" são a mesma rua, e o
 * índice único (quadra_id, nome) não sabe disso.
 */
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;
  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({} as any));
  const quadraId = String(b?.quadraId || "").trim();
  const nome = formaDaRua(String(b?.nome || ""));
  const tipo = ["principal", "rua", "transversal"].includes(String(b?.tipo || ""))
    ? String(b.tipo) : "rua";

  if (!quadraId) {
    return NextResponse.json({ ok: false, erro: "quadra_obrigatoria",
      mensagem: "Diga em qual quadra a rua fica." }, { status: 400 });
  }
  if (!nome) {
    return NextResponse.json({ ok: false, erro: "nome_obrigatorio",
      mensagem: "A rua precisa de um nome. Ex.: RUA 1." }, { status: 400 });
  }

  // A rua herda o cemitério da quadra — `ruas.cemiterio_id` é NOT NULL, e
  // deixar quem chama informá-lo abriria a porta para uma rua apontando para
  // um cemitério diferente do da sua própria quadra.
  const { data: quadra } = await db
    .from("quadras").select("id,codigo,cemiterio_id").eq("id", quadraId).maybeSingle();
  if (!quadra) {
    return NextResponse.json({ ok: false, erro: "quadra_nao_encontrada" }, { status: 404 });
  }

  const { data: existentes } = await db
    .from("ruas").select("id,nome,ordem,seq_cadastro").eq("quadra_id", quadraId).order("ordem");
  const igual = (existentes || []).find((r: any) => mesmoLugar(r.nome, nome, "rua"));
  if (igual) {
    return NextResponse.json({
      ok: false, erro: "rua_ja_existe",
      mensagem: `Esta rua já está cadastrada como "${(igual as any).nome}".`,
      rua: igual,
    }, { status: 409 });
  }

  const proxima = ((existentes || []).reduce(
    (m: number, r: any) => Math.max(m, Number(r.ordem) || 0), 0)) + 1;

  const { data, error } = await db
    .from("ruas")
    .insert({
      org_id: org, quadra_id: quadraId,
      cemiterio_id: (quadra as any).cemiterio_id,
      nome, tipo,
      ordem: proxima,
      // `seq_cadastro` guarda a ordem em que a rua foi cadastrada, e a 0126
      // usa isso para aprender a ordem da caminhada. Nasce igual à ordem e é
      // ajustada depois pelo que a Nina de fato anda.
      seq_cadastro: proxima,
      observacao: String(b?.observacao || "").trim() || null,
    })
    .select("id,nome,tipo,ordem")
    .single();
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  await auditar(db, org, auth.userId || null, "criou_rua",
    { tipo: "rua", id: (data as any).id },
    { quadra: (quadra as any).codigo, nome });

  return NextResponse.json({ ok: true, rua: data });
}
