import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { env } from "@/lib/env";
import { normalizarTelefone } from "@/lib/evolution";
import { registrarEntrada, aguardarEProcessar } from "@/lib/atendimento";
import { tratarLead } from "@/lib/leads";
import { registrarSaidaExterna } from "@/lib/espelho";
import { transcreverAudio } from "@/lib/transcricao";
import { avisarMensagemNova } from "@/lib/push";
import { baixarMidiaBase64 } from "@/lib/evolution";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { registrarErro } from "@/lib/monitor";
import { carimbarRotina } from "@/lib/rotinas";

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
  // O SEGREDO DEVE VIR NO HEADER.
  //
  // A URL do webhook fica gravada na configuração da instância e viaja em todo
  // request: um segredo ali aparece no log de acesso do servidor, no log do
  // proxy, e para quem abrir a configuração da Evolution.
  //
  // Desde a mudança de 22/08 o registro manda `x-webhook-secret` (Evolution v2).
  // O `?secret=` continua sendo aceito por um motivo só: instância **v1** não
  // tem campo de header, e recusar ali seria trocar "segredo no log" por
  // "webhook sem autenticação nenhuma" — qualquer um postando mensagem em nome
  // da família.
  //
  // Quando ele é usado, o sistema AVISA. Sem isso, o caminho legado sobrevive
  // para sempre porque ninguém tem como saber que ainda está em uso.
  const noHeader = req.headers.get("x-webhook-secret");
  const naUrl = req.nextUrl.searchParams.get("secret");
  const segredo = noHeader || naUrl;

  if (segredo !== env.webhookSecret()) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  if (!noHeader && naUrl) {
    // Não espera: o aviso não pode atrasar o recebimento da mensagem.
    void registrarErro("webhook/segredo-na-url", "o webhook chegou com o segredo na URL", {
      comoResolver:
        "Abra Configurações → WhatsApp e clique em configurar o webhook. Se a "
        + "instância for v2, o segredo passa para o header e este aviso some. "
        + "Se continuar aparecendo, a instância é v1 e precisa ser atualizada.",
    });
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
  // CARIMBO DE VIDA DO WHATSAPP. Se a Evolution cair, ninguem descobre: o
  // sistema nao faz polling e silencio de WhatsApp e indistinguivel de um dia
  // calmo. Aqui fica gravado o instante da ultima mensagem que ENTROU, e o
  // painel avisa quando esse instante fica velho demais.
  await carimbarRotina("webhook", true, { evento: evento || "messages.upsert" });

  if (!p) return NextResponse.json({ ok: true, ignorado: "sem_mensagem" });
  if (p.ehGrupo) return NextResponse.json({ ok: true, ignorado: "grupo" });
  if (!p.texto && !p.temMidia && !p.temAudio)
    return NextResponse.json({ ok: true, ignorado: "vazio" });

  try {
    if (p.msgId && (await eventoJaVisto(p.msgId))) {
      return NextResponse.json({ ok: true, ignorado: "duplicado" });
    }

    // SAIDA: o que ela digitou direto no celular. Antes isso era descartado e
    // o painel mostrava so metade da conversa. Agora vira mensagem de saida na
    // conversa da familia (ou na thread do lead que ja existe).
    if (p.fromMe) {
      const esp = await registrarSaidaExterna({
        telefone: p.telefone,
        texto: p.texto,
        temMidia: p.temMidia,
        temAudio: p.temAudio,
      });
      return NextResponse.json({ ok: true, resultado: "saida", espelho: esp.tipo });
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
    await carimbarRotina("webhook", false, undefined, e?.message || String(e));
    return NextResponse.json({ ok: false, erro: "processamento" });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, servico: "sureya-webhook" });
}
