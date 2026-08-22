import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const db = supabaseServer();
  await db.auth.signOut();
  return NextResponse.json({ ok: true });
}
