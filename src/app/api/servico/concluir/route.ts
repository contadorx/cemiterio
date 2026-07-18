import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { subirFotoServico, notificarFamilia } from "@/lib/servico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { servicoId, fotoDepoisBase64, mimetype, fotoAntesBase64?, lat?, lng? }
// A foto do DEPOIS fecha o serviço e é a mesma que vai pra família.
export async function POST(req: NextRequest) {
  const db = supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, erro: "nao_autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const servicoId: string = body?.servicoId;
  const fotoDepois: string = body?.fotoDepoisBase64;
  const mimetype: string = body?.mimetype || "image/jpeg";
  const fotoAntes: string | undefined = body?.fotoAntesBase64;
  const lat = body?.lat != null ? Number(body.lat) : null;
  const lng = body?.lng != null ? Number(body.lng) : null;

  if (!servicoId || !fotoDepois) {
    return NextResponse.json({ ok: false, erro: "foto_depois_obrigatoria" }, { status: 400 });
  }

  // sobe fotos
  const urlDepois = await subirFotoServico(servicoId, fotoDepois, mimetype, "depois");
  const urlAntes = fotoAntes ? await subirFotoServico(servicoId, fotoAntes, mimetype, "antes") : null;

  if (!urlDepois) {
    return NextResponse.json({ ok: false, erro: "falha_upload_foto" }, { status: 500 });
  }

  // marca executado
  const { data: serv, error } = await db
    .from("servicos")
    .update({
      status: "executado",
      data_executada: new Date().toISOString(),
      foto_depois_url: urlDepois,
      foto_antes_url: urlAntes,
      executora_id: user.id,
    })
    .eq("id", servicoId)
    .select("tumulo_id")
    .single();
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

  // se o túmulo ainda não tem GPS, grava o ponto marcado agora (backstop visual)
  if (lat != null && lng != null && (serv as any)?.tumulo_id) {
    await db
      .from("tumulos")
      .update({ lat, lng })
      .eq("id", (serv as any).tumulo_id)
      .is("lat", null);
  }

  // dispara a foto pra família (transacional, direto — não passa pelo copiloto)
  const notificado = await notificarFamilia(servicoId, urlDepois);

  return NextResponse.json({ ok: true, notificado });
}
