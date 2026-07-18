import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH { falecido_nome?, data_falecimento? ('MM-DD' ou 'AAAA-MM-DD'), data_nascimento? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const db = auth.db;

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, any> = {};

  if (body.falecido_nome !== undefined) patch.falecido_nome = body.falecido_nome || null;

  if (body.data_falecimento !== undefined || body.data_nascimento !== undefined) {
    const datas: { tipo: string; data: string }[] = [];
    const mmdd = (v: string) => (v || "").trim().slice(-5); // aceita completa ou MM-DD
    if (body.data_falecimento) datas.push({ tipo: "falecimento", data: mmdd(body.data_falecimento) });
    if (body.data_nascimento) datas.push({ tipo: "nascimento", data: mmdd(body.data_nascimento) });
    patch.datas_gatilho = datas;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ ok: false, erro: "nada_para_atualizar" }, { status: 400 });
  }

  const { error } = await db.from("tumulos").update(patch).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
