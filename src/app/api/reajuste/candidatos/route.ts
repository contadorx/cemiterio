import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { calcularTemperatura } from "@/lib/reajuste";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const candidatos = await calcularTemperatura(db);
  return NextResponse.json({ ok: true, candidatos });
}
