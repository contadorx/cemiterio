import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { registrarErro } from "@/lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET -> lista membros da org
export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const { data } = await auth.db.from("membros").select("user_id,papel,nome,created_at").order("created_at");
  return NextResponse.json({ ok: true, membros: data || [] });
}

// POST { nome, email, senha, papel } -> cria usuário no Auth + vincula como membro.
// Usa service role (admin) para criar a conta. Só admin pode chamar.
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const org = await orgAtual(auth.db);
  if (!org) return NextResponse.json({ ok: false, erro: "sem_org" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const nome = (body?.nome || "").trim();
  const email = (body?.email || "").trim().toLowerCase();
  const senha = body?.senha || "";
  const papel = body?.papel === "campo" ? "campo" : "admin";

  if (!email || senha.length < 6) {
    return NextResponse.json({ ok: false, erro: "email_ou_senha_invalidos (mín. 6)" }, { status: 400 });
  }

  const adm = supabaseAdmin();
  try {
    const { data: novo, error } = await adm.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    });
    if (error || !novo?.user) {
      return NextResponse.json({ ok: false, erro: error?.message || "falha_criar_usuario" }, { status: 400 });
    }

    const { error: eMembro } = await adm
      .from("membros")
      .insert({ org_id: org, user_id: novo.user.id, papel, nome });
    if (eMembro) {
      // desfaz a criação se o vínculo falhar
      await adm.auth.admin.deleteUser(novo.user.id).catch(() => {});
      return NextResponse.json({ ok: false, erro: eMembro.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, userId: novo.user.id });
  } catch (e: any) {
    await registrarErro("criar_membro", e, { email, papel });
    return NextResponse.json({ ok: false, erro: "erro_interno" }, { status: 500 });
  }
}
