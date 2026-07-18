import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const { data } = await db
    .from("leads")
    .select("id,telefone,nome_wa,mensagens,status,created_at,updated_at")
    .in("status", ["novo", "em_conversa"])
    .order("updated_at", { ascending: false });

  return NextResponse.json({ ok: true, leads: data || [] });
}
