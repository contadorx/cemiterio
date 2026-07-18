import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { calcularCapacidade } from "@/lib/capacidade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

  const cap = await calcularCapacidade();
  return NextResponse.json({ ok: true, ...cap });
}
