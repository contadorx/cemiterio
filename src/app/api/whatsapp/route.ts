import { NextRequest, NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/roles";
import { statusConexao, conectar, desconectar, configurarWebhook } from "@/lib/evolution-admin";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET -> status da conexão da instância
export async function GET() {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;
  const st = await statusConexao();
  return NextResponse.json({ ok: true, ...st, instancia: env.evolutionInstance() });
}

// POST { acao: 'conectar' } -> garante a instância e retorna o QR
// POST { acao: 'desconectar' }
// POST { acao: 'webhook', origem } -> aponta o webhook do Evolution p/ este app
export async function POST(req: NextRequest) {
  const auth = await exigirAdmin();
  if (auth.erro) return auth.erro;

  const body = await req.json().catch(() => ({}));
  const acao = body?.acao;

  if (acao === "conectar") {
    const r = await conectar();
    return NextResponse.json({ ok: r.estado !== "erro", ...r });
  }

  if (acao === "desconectar") {
    const r = await desconectar();
    return NextResponse.json(r);
  }

  if (acao === "webhook") {
    const origem = (body?.origem || "").replace(/\/$/, "");
    if (!origem) return NextResponse.json({ ok: false, erro: "origem_obrigatoria" }, { status: 400 });
    const url = `${origem}/api/webhook/evolution?secret=${env.webhookSecret()}`;
    const r = await configurarWebhook(url);
    return NextResponse.json({ ...r, url });
  }

  return NextResponse.json({ ok: false, erro: "acao_invalida" }, { status: 400 });
}
