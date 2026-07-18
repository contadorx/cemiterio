import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { calcularCapacidade } from "@/lib/capacidade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const cap = await calcularCapacidade();
  return NextResponse.json({ ok: true, ...cap });
}
