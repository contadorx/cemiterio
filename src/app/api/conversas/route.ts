import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

  const { data: convs } = await db
    .from("conversas")
    .select("id,cliente_id,aberta,escalada_humano,ultimo_assunto,updated_at,clientes(nome,telefone)")
    .order("updated_at", { ascending: false })
    .limit(60);

  const ids = (convs || []).map((c: any) => c.id);

  // última mensagem por conversa
  const ultima = new Map<string, { texto: string; autor: string }>();
  if (ids.length) {
    const { data: msgs } = await db
      .from("mensagens")
      .select("conversa_id,texto,autor,created_at")
      .in("conversa_id", ids)
      .order("created_at", { ascending: false });
    for (const m of msgs || []) {
      if (!ultima.has((m as any).conversa_id)) {
        ultima.set((m as any).conversa_id, { texto: (m as any).texto || "", autor: (m as any).autor });
      }
    }
  }

  // conversas com rascunho pendente
  const comRascunho = new Set<string>();
  if (ids.length) {
    const { data: rasc } = await db
      .from("interacoes_ia")
      .select("conversa_id")
      .in("conversa_id", ids)
      .is("acao_humana", null);
    for (const r of rasc || []) comRascunho.add((r as any).conversa_id);
  }

  const lista = (convs || []).map((c: any) => ({
    id: c.id,
    clienteId: c.cliente_id,
    cliente: c.clientes?.nome || c.clientes?.telefone || "—",
    escalada: c.escalada_humano,
    assunto: c.ultimo_assunto,
    quando: c.updated_at,
    ultima: ultima.get(c.id)?.texto || "",
    temRascunho: comRascunho.has(c.id),
  }));

  return NextResponse.json({ ok: true, conversas: lista });
}
