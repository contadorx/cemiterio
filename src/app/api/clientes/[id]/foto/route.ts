import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { base64, mimetype } — foto da família (ajuda a lembrar de quem se trata)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  if (!b?.base64) return NextResponse.json({ ok: false, erro: "sem_foto" }, { status: 400 });

  const adm = supabaseAdmin();
  const ext = String(b.mimetype || "").includes("png") ? "png" : "jpg";
  const caminho = `clientes/${params.id}/${Date.now()}.${ext}`;

  const { error: erroUp } = await adm.storage
    .from("servicos")
    .upload(caminho, Buffer.from(b.base64, "base64"), {
      contentType: b.mimetype || "image/jpeg",
      upsert: true,
    });
  if (erroUp) return NextResponse.json({ ok: false, erro: erroUp.message }, { status: 500 });

  const { data: pub } = adm.storage.from("servicos").getPublicUrl(caminho);
  const url = pub?.publicUrl || null;

  const { error } = await adm
    .from("clientes").update({ foto_url: url })
    .eq("id", params.id).eq("org_id", env.orgId());
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, url });
}

// DELETE — tira a foto
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const { error } = await auth.db.from("clientes").update({ foto_url: null }).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
