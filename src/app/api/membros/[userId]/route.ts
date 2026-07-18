import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH { papel } -> troca o papel do membro (admin/campo)
export async function PATCH(req: NextRequest, { params }: { params: { userId: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  if (params.userId === auth.userId) {
    return NextResponse.json({ ok: false, erro: "nao_pode_alterar_a_si" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const papel = body?.papel === "campo" ? "campo" : "admin";
  const { error } = await auth.db.from("membros").update({ papel }).eq("org_id", org).eq("user_id", params.userId);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE -> remove o membro (e a conta de auth)
export async function DELETE(_req: NextRequest, { params }: { params: { userId: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  if (params.userId === auth.userId) {
    return NextResponse.json({ ok: false, erro: "nao_pode_remover_a_si" }, { status: 400 });
  }

  const adm = supabaseAdmin();
  await adm.from("membros").delete().eq("org_id", org).eq("user_id", params.userId);
  await adm.auth.admin.deleteUser(params.userId).catch(() => {});
  return NextResponse.json({ ok: true });
}
