import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { enviarWhatsapp } from "@/lib/evolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { texto } — envia a mensagem no WhatsApp, registra e assume a conversa
// (escalada_humano = true) pra IA não responder por cima.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const texto = (body?.texto || "").trim();
  if (!texto) return NextResponse.json({ ok: false, erro: "texto_vazio" }, { status: 400 });

  const { data: conv } = await db
    .from("conversas")
    .select("id,org_id,cliente_id,clientes(telefone)")
    .eq("id", params.id)
    .maybeSingle();
  if (!conv) return NextResponse.json({ ok: false, erro: "nao_encontrada" }, { status: 404 });

  const telefone = (conv as any).clientes?.telefone;
  if (!telefone) return NextResponse.json({ ok: false, erro: "sem_telefone" }, { status: 400 });

  await enviarWhatsapp(telefone, texto);

  await db.from("mensagens").insert({
    org_id: (conv as any).org_id,
    conversa_id: (conv as any).id,
    cliente_id: (conv as any).cliente_id,
    direcao: "saida",
    autor: "humano",
    texto,
  });

  // assume a conversa
  await db.from("conversas").update({ escalada_humano: true }).eq("id", params.id);

  return NextResponse.json({ ok: true });
}
