import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

  const id = params.id;

  const { data: conv } = await db
    .from("conversas")
    .select("id,cliente_id,escalada_humano,clientes(nome,telefone)")
    .eq("id", id)
    .maybeSingle();
  if (!conv) return NextResponse.json({ ok: false, erro: "nao_encontrada" }, { status: 404 });

  const [{ data: msgs }, { data: rasc }] = await Promise.all([
    db.from("mensagens").select("autor,direcao,texto,created_at").eq("conversa_id", id).order("created_at", { ascending: true }),
    db.from("interacoes_ia").select("id,rascunho,assunto").eq("conversa_id", id).is("acao_humana", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return NextResponse.json({
    ok: true,
    conversa: {
      id: (conv as any).id,
      clienteId: (conv as any).cliente_id,
      cliente: (conv as any).clientes?.nome || (conv as any).clientes?.telefone || "—",
      escalada: (conv as any).escalada_humano,
    },
    mensagens: msgs || [],
    rascunho: rasc || null,
  });
}

// PATCH { escalada_humano } — assumir (true) ou devolver à IA (false)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (typeof body?.escalada_humano !== "boolean") {
    return NextResponse.json({ ok: false, erro: "parametros" }, { status: 400 });
  }

  const { error } = await db
    .from("conversas")
    .update({ escalada_humano: body.escalada_humano })
    .eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
