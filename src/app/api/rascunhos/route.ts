import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rascunhos da IA aguardando uma pessoa (acao_humana ainda nula).
export async function GET() {
  const db = supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

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
