import { NextRequest, NextResponse } from "next/server";
import { exigirLogado } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { env } from "@/lib/env";
import { subirFotoServico } from "@/lib/servico";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { servicoId, fotoBase64?, mimetype? }
// Marca o começo da limpeza. A foto do "antes" entra aqui.
export async function POST(req: NextRequest) {
  const auth = await exigirLogado();
  if (auth.erro) return auth.erro;

  const b = await req.json().catch(() => ({}));
  if (!b?.servicoId) return NextResponse.json({ ok: false, erro: "servico_obrigatorio" }, { status: 400 });

  const adm = supabaseAdmin();
  const org = env.orgId();

  const { data: s } = await adm
    .from("servicos").select("id,iniciado_em,status")
    .eq("org_id", org).eq("id", b.servicoId).maybeSingle();
  if (!s) return NextResponse.json({ ok: false, erro: "servico_nao_encontrado" }, { status: 404 });
  if ((s as any).status === "executado") {
    return NextResponse.json({ ok: false, erro: "ja_concluido" }, { status: 400 });
  }

  let fotoUrl: string | null = null;
  if (b?.fotoBase64) {
    fotoUrl = await subirFotoServico(b.servicoId, b.fotoBase64, b.mimetype || "image/jpeg", "antes");
  }

  const patch: Record<string, any> = { executora_id: auth.userId };
  // se já tinha começado, não sobrescreve o horário
  if (!(s as any).iniciado_em) patch.iniciado_em = new Date().toISOString();
  if (fotoUrl) patch.foto_antes_url = fotoUrl;

  await adm.from("servicos").update(patch).eq("id", b.servicoId).eq("org_id", org);

  return NextResponse.json({
    ok: true,
    iniciadoEm: patch.iniciado_em || (s as any).iniciado_em,
    fotoAntes: fotoUrl,
  });
}
