import { NextRequest, NextResponse } from "next/server";
import { exigirLogado } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { base64, mimetype, tipo: 'enquadramento' | 'referencia' }
//  enquadramento = foto de longe, mostrando o túmulo entre os vizinhos (localiza)
//  referencia    = close da lápide (confirma)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  const base64 = b?.base64;
  const mimetype = b?.mimetype || "image/jpeg";
  const tipo = b?.tipo === "referencia" ? "referencia" : "enquadramento";
  if (!base64) return NextResponse.json({ ok: false, erro: "sem_imagem" }, { status: 400 });

  try {
    const adm = supabaseAdmin();
    const ext = (mimetype.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const path = `${env.orgId()}/tumulos/${params.id}/${tipo}-${Date.now()}.${ext}`;
    const bytes = Buffer.from(base64, "base64");

    const { error } = await adm.storage
      .from("servicos")
      .upload(path, bytes, { contentType: mimetype, upsert: true });
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    const url = adm.storage.from("servicos").getPublicUrl(path).data?.publicUrl;
    const campo = tipo === "referencia" ? "foto_referencia_url" : "foto_enquadramento_url";

    await adm.from("tumulos").update({ [campo]: url }).eq("id", params.id).eq("org_id", env.orgId());
    return NextResponse.json({ ok: true, url });
  } catch (e: any) {
    return NextResponse.json({ ok: false, erro: e?.message || "falha" }, { status: 500 });
  }
}
