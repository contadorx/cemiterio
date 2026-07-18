import { NextResponse } from "next/server";
import { exigirLogado } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lista as quadras para os seletores de localização.
export async function GET() {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;
  const { data } = await auth.db
    .from("quadras")
    .select("id,codigo,ordem,cemiterios(nome)")
    .order("ordem");
  return NextResponse.json({ ok: true, quadras: data || [] });
}
