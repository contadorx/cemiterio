import { NextRequest, NextResponse } from "next/server";
import { exigirLogado } from "@/lib/roles";
import { orgAtual } from "@/lib/org";
import { avisar } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — a chave pública, para o navegador se inscrever
export async function GET() {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;
  const chave = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
  const { count } = await auth.db
    .from("assinaturas_push").select("id", { count: "exact", head: true }).eq("user_id", auth.userId);
  return NextResponse.json({ ok: true, chave, inscrito: (count || 0) > 0 });
}

// POST { endpoint, keys: { p256dh, auth }, aparelho }
export async function POST(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;
  const org = await orgAtual(auth.db);
  const b = await req.json().catch(() => ({}));
  if (!b?.endpoint || !b?.keys?.p256dh || !b?.keys?.auth) {
    return NextResponse.json({ ok: false, erro: "assinatura_invalida" }, { status: 400 });
  }

  const { error } = await auth.db.from("assinaturas_push").upsert({
    org_id: org, user_id: auth.userId,
    endpoint: b.endpoint, p256dh: b.keys.p256dh, auth: b.keys.auth,
    aparelho: b?.aparelho || null,
  }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PUT — manda um aviso de teste para conferir se está funcionando
export async function PUT() {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;
  const n = await avisar({
    titulo: "Zelo & Memória",
    corpo: "Pronto — os avisos estão funcionando neste aparelho. 🌿",
    url: "/painel/conversas",
    tag: "teste",
  }, [auth.userId]);
  return NextResponse.json({ ok: true, enviados: n });
}

// DELETE ?endpoint= — desinscreve
export async function DELETE(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;
  const ep = req.nextUrl.searchParams.get("endpoint");
  let q = auth.db.from("assinaturas_push").delete().eq("user_id", auth.userId);
  if (ep) q = q.eq("endpoint", ep);
  await q;
  return NextResponse.json({ ok: true });
}
