import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { normalizarTelefone } from "@/lib/evolution";
import { processarMensagem } from "@/lib/atendimento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Extrai telefone + texto + se tem mídia do payload do Evolution (messages.upsert).
function parsePayload(body: any): {
  telefone: string;
  texto: string;
  temMidia: boolean;
  fromMe: boolean;
  ehGrupo: boolean;
} | null {
  const data = body?.data;
  const key = data?.key;
  if (!key?.remoteJid) return null;

  const remoteJid: string = key.remoteJid;
  const ehGrupo = remoteJid.endsWith("@g.us");
  const fromMe = !!key.fromMe;

  const telefone = normalizarTelefone(remoteJid.split("@")[0]);

  const msg = data?.message || {};
  const texto =
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    "";

  const temMidia = !!(msg.imageMessage || msg.documentMessage || msg.videoMessage);

  return { telefone, texto, temMidia, fromMe, ehGrupo };
}

export async function POST(req: NextRequest) {
  // 1) Segurança: Evolution manda o segredo (header ou query).
  const segredo =
    req.headers.get("x-webhook-secret") ||
    req.nextUrl.searchParams.get("secret");
  if (segredo !== env.webhookSecret()) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // ignora payload inválido sem erro
  }

  // Só nos interessa mensagem recebida.
  const evento = body?.event;
  if (evento && evento !== "messages.upsert") {
    return NextResponse.json({ ok: true, ignorado: evento });
  }

  const p = parsePayload(body);
  if (!p) return NextResponse.json({ ok: true, ignorado: "sem_mensagem" });
  if (p.fromMe) return NextResponse.json({ ok: true, ignorado: "propria" });
  if (p.ehGrupo) return NextResponse.json({ ok: true, ignorado: "grupo" });
  if (!p.texto && !p.temMidia)
    return NextResponse.json({ ok: true, ignorado: "vazio" });

  try {
    const r = await processarMensagem({
      telefone: p.telefone,
      texto: p.texto,
      temMidia: p.temMidia,
      mensagemRaw: body?.data,
    });
    return NextResponse.json({ ok: true, resultado: r });
  } catch (e: any) {
    console.error("[webhook] erro ao processar:", e?.message || e);
    // 200 mesmo em erro: evita reentrega em loop do Evolution. Erro fica no log.
    return NextResponse.json({ ok: false, erro: "processamento" });
  }
}

// health check
export async function GET() {
  return NextResponse.json({ ok: true, servico: "sureya-webhook" });
}
