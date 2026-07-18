import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

  const { data } = await db.from("config_ia").select("conhecimento_base,tom").maybeSingle();
  return NextResponse.json({
    ok: true,
    conhecimento: (data as any)?.conhecimento_base || "",
    tom: (data as any)?.tom || "",
  });
}

// PUT { conhecimento, tom }
export async function PUT(req: NextRequest) {
  const db = supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { error } = await db.from("config_ia").upsert({
    org_id: org,
    conhecimento_base: body?.conhecimento ?? null,
    tom: body?.tom ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
