import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST -> retorna (ou cria) a conversa aberta do cliente.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const clienteId = params.id;

  const { data: aberta } = await db
    .from("conversas")
    .select("id")
    .eq("cliente_id", clienteId)
    .eq("aberta", true)
    .maybeSingle();
  if (aberta) return NextResponse.json({ ok: true, conversaId: (aberta as any).id });

  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const { data: nova, error } = await db
    .from("conversas")
    .insert({ org_id: org, cliente_id: clienteId, aberta: true })
    .select("id")
    .single();
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, conversaId: (nova as any).id });
}
