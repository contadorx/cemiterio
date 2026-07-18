import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { env } from "@/lib/env";
import { normalizarTelefone } from "@/lib/evolution";
import { registrarEntrada, aguardarEProcessar } from "@/lib/atendimento";
import { tratarLead } from "@/lib/leads";
import { transcreverAudio } from "@/lib/transcricao";
import { avisarMensagemNova } from "@/lib/push";
import { baixarMidiaBase64 } from "@/lib/evolution";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { registrarErro } from "@/lib/monitor";

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

    // ÁUDIO: transcreve antes de registrar, para a conversa já nascer com o texto.
    // A família manda áudio porque é mais fácil que digitar — o sistema não pode
    // devolver "[áudio]" e obrigar alguém a ouvir para saber do que se trata.
    let textoFinal = p.texto;
    let transcrito = false;
    if (p.temAudio && !p.texto) {
      try {
        const midia = await baixarMidiaBase64(body?.data);
        if (midia?.base64) {
          const t = await transcreverAudio(midia.base64, midia.mimetype || "audio/ogg");
          if (t && t.trim()) {
            textoFinal = t.trim();
            transcrito = true;
          }
        }
      } catch (e: any) {
        console.error("[webhook] falha ao transcrever áudio:", e?.message || e);
      }
    }

    const reg = await registrarEntrada({
      telefone: p.telefone,
      texto: textoFinal,
      transcrito,
      temMidia: p.temMidia,
      temAudio: p.temAudio,
      mensagemRaw: body?.data,
    });

    if (reg.tipo === "lead") {
      await tratarLead(
        p.telefone,
        textoFinal || (p.temAudio ? "[áudio que não consegui transcrever]" : "[mídia]"),
        p.pushName
      );
      return NextResponse.json({ ok: true, resultado: "lead" });
    }
    if (reg.tipo === "ignorado" || reg.tipo === "escalado") {
      return NextResponse.json({ ok: true, resultado: reg.tipo });
    }

    // Sem agendador: responde ao Evolution já e processa a rajada em background,
    // esperando a janela de debounce. Funciona no plano Hobby (sem cron/minuto).
    // avisa no celular de quem cuida do painel — só de família, só o que
    // ainda não foi respondido. Não trava o webhook se falhar.
    waitUntil(
      avisarMensagemNova(reg.nomeCliente || "Uma família", textoFinal || "[mídia]", reg.conversaId)
        .catch(() => 0)
    );
    waitUntil(aguardarEProcessar(reg.conversaId));
    return NextResponse.json({ ok: true, resultado: "agendado", transcrito });
  } catch (e: any) {
    console.error("[webhook] erro ao processar:", e?.message || e);
    await registrarErro("webhook", e, { telefone: p?.telefone });
    return NextResponse.json({ ok: false, erro: "processamento" });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, servico: "sureya-webhook" });
}
