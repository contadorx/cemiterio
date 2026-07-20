import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { limparCacheDisparos } from "@/lib/disparos";
import { auditar } from "@/lib/auditoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET -> { ok, ativo } : estado atual da chave mestra de disparos automáticos.
export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const { data } = await auth.db.from("orgs").select("disparos_ativos").eq("id", org).maybeSingle();
  return NextResponse.json({ ok: true, ativo: !!(data as any)?.disparos_ativos });
}

// PUT { ativo: boolean } -> liga/desliga os disparos automáticos.
export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const ativo = !!body?.ativo;

  const { error } = await auth.db.from("orgs").update({ disparos_ativos: ativo }).eq("id", org);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // deixa registrado quem ligou/desligou (auditar nunca lança)
  await auditar(auth.db, org, auth.userId, ativo ? "disparos_ligados" : "disparos_desligados",
    { tipo: "org", id: org }, { ativo });

  limparCacheDisparos(); // efeito imediato no servidor
  return NextResponse.json({ ok: true, ativo });
}
