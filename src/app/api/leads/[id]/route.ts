import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { acao: 'converter', nome } -> cria o cliente com o telefone do lead
// POST { acao: 'descartar' }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => ({}));
  const acao = body?.acao;

  const { data: lead } = await db
    .from("leads")
    .select("id,telefone,nome_wa,status")
    .eq("id", params.id)
    .maybeSingle();
  if (!lead) return NextResponse.json({ ok: false, erro: "nao_encontrado" }, { status: 404 });

  if (acao === "descartar") {
    await db.from("leads").update({ status: "descartado" }).eq("id", params.id);
    return NextResponse.json({ ok: true });
  }

  if (acao === "converter") {
    const org = await orgAtual(db);
    if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

    const nome = (body?.nome || (lead as any).nome_wa || "Cliente").trim();
    const { data: cli, error } = await db
      .from("clientes")
      .insert({
        org_id: org,
        nome,
        telefone: (lead as any).telefone,
        modo: "copiloto",
        ativo_ia: true,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    await db.from("leads").update({ status: "convertido" }).eq("id", params.id);
    return NextResponse.json({ ok: true, clienteId: (cli as any).id });
  }

  return NextResponse.json({ ok: false, erro: "acao_invalida" }, { status: 400 });
}
