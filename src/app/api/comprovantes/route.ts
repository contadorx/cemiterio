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

  const { data } = await db
    .from("comprovantes")
    .select("id,imagem_url,valor_extraido,data_extraida,id_transacao,created_at,clientes(nome,telefone)")
    .eq("status", "a_conferir")
    .order("created_at", { ascending: true });

  const comprovantes = (data || []).map((c: any) => ({
    id: c.id,
    imagem: c.imagem_url,
    valor: c.valor_extraido,
    data: c.data_extraida,
    idTransacao: c.id_transacao,
    cliente: c.clientes?.nome || c.clientes?.telefone || "—",
    quando: c.created_at,
  }));

  return NextResponse.json({ ok: true, comprovantes });
}
