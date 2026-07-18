import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const { data } = await db.from("config_ia").select("conhecimento_base,tom,msg_lead_inicial").maybeSingle();
  return NextResponse.json({
    ok: true,
    conhecimento: (data as any)?.conhecimento_base || "",
    tom: (data as any)?.tom || "",
    msgLead: (data as any)?.msg_lead_inicial || "",
  });
}

// PUT { conhecimento, tom }
export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const org = await orgAtual(db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { error } = await db.from("config_ia").upsert({
    org_id: org,
    conhecimento_base: body?.conhecimento ?? null,
    tom: body?.tom ?? null,
    msg_lead_inicial: body?.msgLead ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
