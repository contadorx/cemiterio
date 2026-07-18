import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rascunhos da IA aguardando uma pessoa (acao_humana ainda nula).
export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const { data } = await db
    .from("interacoes_ia")
    .select("id,assunto,rascunho,created_at,cliente_id,clientes(nome,telefone)")
    .is("acao_humana", null)
    .order("created_at", { ascending: true });

  const rascunhos = (data || []).map((r: any) => ({
    id: r.id,
    assunto: r.assunto,
    rascunho: r.rascunho,
    clienteId: r.cliente_id,
    cliente: r.clientes?.nome || r.clientes?.telefone || "—",
    quando: r.created_at,
  }));

  return NextResponse.json({ ok: true, rascunhos });
}
