import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { normalizarTelefone } from "@/lib/evolution";
import { registrarEntrada, processarConversa } from "@/lib/atendimento";
import { tratarLead } from "@/lib/leads";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parsePayload(body: any): {
  telefone: string;
  texto: string;
  temMidia: boolean;
  temAudio: boolean;
  fromMe: boolean;
  ehGrupo: boolean;
  msgId: string | null;
  pushName: string | null;
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

  const temAudio = !!msg.audioMessage;
  const temMidia = !!(msg.imageMessage || msg.documentMessage || msg.videoMessage);

  return {
    telefone,
    texto,
    temMidia,
    temAudio,
    fromMe,
    ehGrupo,
    msgId: key.id || null,
    pushName: data?.pushName || null,
  };
}

// A2: cada evento do Evolution só passa uma vez.
async function eventoJaVisto(msgId: string): Promise<boolean> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("eventos_webhook")
    .upsert(
      { org_id: env.orgId(), evolution_msg_id: msgId },
      { onConflict: "org_id,evolution_msg_id", ignoreDuplicates: true }
    )
    .select("id");
  if (error) {
    console.error("[webhook] dedup falhou (segue mesmo assim):", error.message);
    return false;
  }
  return !data || data.length === 0; // nada inserido = duplicado
}

export async function POST(req: NextRequest) {
  const segredo =
    req.headers.get("x-webhook-secret") || req.nextUrl.searchParams.get("secret");
  if (segredo !== env.webhookSecret()) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const evento = body?.event;
  if (evento && evento !== "messages.upsert" && evento !== "MESSAGES_UPSERT") {
    return NextResponse.json({ ok: true, ignorado: evento });
  }

  const p = parsePayload(body);
  if (!p) return NextResponse.json({ ok: true, ignorado: "sem_mensagem" });
  if (p.fromMe) return NextResponse.json({ ok: true, ignorado: "propria" });
  if (p.ehGrupo) return NextResponse.json({ ok: true, ignorado: "grupo" });
  if (!p.texto && !p.temMidia && !p.temAudio)
    return NextResponse.json({ ok: true, ignorado: "vazio" });

  try {
    if (p.msgId && (await eventoJaVisto(p.msgId))) {
      return NextResponse.json({ ok: true, ignorado: "duplicado" });
    }

    const reg = await registrarEntrada({
      telefone: p.telefone,
      texto: p.texto,
      temMidia: p.temMidia,
      temAudio: p.temAudio,
      mensagemRaw: body?.data,
    });

    if (reg.tipo === "lead") {
      await tratarLead(p.telefone, p.texto || (p.temAudio ? "[áudio]" : "[mídia]"), p.pushName);
      return NextResponse.json({ ok: true, resultado: "lead" });
    }
    if (reg.tipo === "ignorado" || reg.tipo === "escalado") {
      return NextResponse.json({ ok: true, resultado: reg.tipo });
    }

    if (reg.processarAgora) {
      const r = await processarConversa(reg.conversaId);
      return NextResponse.json({ ok: true, resultado: r });
    }
    return NextResponse.json({ ok: true, resultado: "aguardando_rajada" });
  } catch (e: any) {
    console.error("[webhook] erro ao processar:", e?.message || e);
    return NextResponse.json({ ok: false, erro: "processamento" });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, servico: "sureya-webhook" });
}
