import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

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
