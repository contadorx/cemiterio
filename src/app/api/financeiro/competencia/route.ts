import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { previewCompetencia, fecharCompetencia } from "@/lib/competencia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * O fechamento pela tela. A regra vive em `lib/competencia.ts`, compartilhada
 * com o cron do dia 1 — duplicar cálculo de dinheiro em dois lugares é como
 * um deles acaba divergindo do outro sem ninguém notar.
 *
 * GET  → prévia: mostra o que entraria, sem gravar nada.
 * POST → grava.
 */
export async function GET(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  try {
    const p = await previewCompetencia(
      org,
      req.nextUrl.searchParams.get("competencia") || undefined
    );
    return NextResponse.json({ ok: true, ...p });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const b = await req.json().catch(() => ({}));

  try {
    const r = await fecharCompetencia(org, b?.competencia || undefined);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e.message }, { status: 500 });
  }
}
