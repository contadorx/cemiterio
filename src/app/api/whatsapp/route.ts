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
    const url = `${origem}/api/webhook/evolution`;
    const r = await configurarWebhook(url, env.webhookSecret());

    // O SEGREDO NAO VOLTA PARA A TELA. A URL completa era impressa no navegador
    // (e ia parar em print, log de acesso e histórico). O servidor configura o
    // webhook com o segredo; a tela só precisa saber que foi configurado.
    //
    // E agora ela também precisa saber ONDE o segredo ficou: na v2 ele vai em
    // header e a URL é limpa; na v1 não há campo de header e ele volta para a
    // URL. Um aviso visível é o que impede a segunda situação de virar
    // permanente por ninguém ter notado.
    return NextResponse.json({
      ...r,
      url,
      segredoNaUrl: r.formato === "v1",
      aviso: r.formato === "v1"
        ? "Esta instância da Evolution é v1 e não aceita header no webhook, "
          + "então o segredo ficou na URL — onde aparece em log de acesso. "
          + "Atualizar a Evolution para a v2 resolve."
        : null,
    });
  }

  return NextResponse.json({ ok: false, erro: "acao_invalida" }, { status: 400 });
}
