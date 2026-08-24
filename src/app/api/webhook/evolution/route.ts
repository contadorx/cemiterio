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

// A2: cada evento do Evolution só passa uma vez — E DEIXA DITO POR ONDE SAIU.
//
// POR QUE ISTO MUDOU (0121)
// Até aqui esta tabela guardava só o id da mensagem, e só era escrita DEPOIS
// dos filtros de grupo e de vazio. O webhook decidia o destino de cada
// mensagem — grupo, eco, lead, gravada — devolvia a palavra ao Evolution e
// esquecia. Ninguém guardava.
//
// No dia 23/08 chegaram 70 eventos. Um virou lead, um virou mensagem, e 68
// não deixaram rastro nenhum. Quando a pergunta foi "o comprovante da Josiane
// chegou?", não havia resposta possível: nem sim, nem não. Só dedução.
//
// Agora toda mensagem que bate no servidor abre uma linha ANTES de qualquer
// filtro, e fecha essa linha com o desfecho. `sureya_rastro_telefone` responde
// pelo número, e `sureya_saude_whatsapp` responde pelo conjunto.
export type Desfecho =
  | "sem_mensagem" | "grupo" | "vazio" | "duplicado"
  | "espelho_cliente" | "espelho_eco" | "espelho_lead" | "espelho_nada"
  | "lead" | "ignorado" | "escalado" | "gravada" | "erro";

// Evento sem chave de mensagem não tem como ser deduplicado. Ele cai todo numa
// linha só, cujo `visto_em` vai andando: serve para saber QUE existe esse tipo
// de tráfego, não para contá-lo.
const SEM_ID = "sem-id";

async function abrirRastro(msgId: string | null, telefone: string | null): Promise<"novo" | "repetido"> {
  const db = supabaseAdmin();
  const org = env.orgId();
  const id = msgId || SEM_ID;
  const agora = new Date().toISOString();

  const { data, error } = await db
    .from("eventos_webhook")
    .upsert(
      { org_id: org, evolution_msg_id: id, telefone, visto_em: agora },
      { onConflict: "org_id,evolution_msg_id", ignoreDuplicates: true }
    )
    .select("id");

  if (error) {
    // O rastro não pode derrubar a mensagem. Sem ele o evento segue, só fica
    // cego — que era o estado do sistema inteiro antes da 0121.
    console.error("[webhook] rastro falhou (segue mesmo assim):", error.message);
    return "novo";
  }
  if (data && data.length > 0) return "novo";
  if (id === SEM_ID) {
    await db.from("eventos_webhook").update({ visto_em: agora })
      .eq("org_id", org).eq("evolution_msg_id", id);
    return "novo";
  }

  // JÁ EXISTE. Se a passagem anterior MORREU no meio, o Evolution reenviando é
  // a segunda chance — e recusá-la como "duplicado" era perder a mensagem de
  // vez. Só o que terminou é que tranca.
  const { data: antes } = await db
    .from("eventos_webhook")
    .select("desfecho")
    .eq("org_id", org).eq("evolution_msg_id", id)
    .maybeSingle();

  const podeRefazer = !antes || (antes as any).desfecho === "erro";
  await db.from("eventos_webhook")
    .update({ visto_em: agora, ...(podeRefazer ? { desfecho: null } : {}) })
    .eq("org_id", org).eq("evolution_msg_id", id);

  return podeRefazer ? "novo" : "repetido";
}

async function fecharRastro(msgId: string | null, desfecho: Desfecho): Promise<void> {
  try {
    const db = supabaseAdmin();
    await db.from("eventos_webhook")
      .update({ desfecho })
      .eq("org_id", env.orgId())
      .eq("evolution_msg_id", msgId || SEM_ID);
  } catch (e: any) {
    console.error("[webhook] não consegui carimbar o desfecho:", e?.message || e);
  }
}

/** Fecha o rastro e devolve a resposta ao Evolution na mesma frase. */
async function encerrar(msgId: string | null, desfecho: Desfecho, extra?: Record<string, any>) {
  await fecharRastro(msgId, desfecho);
  return NextResponse.json({ ok: true, desfecho, ...(extra || {}) });
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

  // O RASTRO ABRE ANTES DOS FILTROS.
  //
  // Grupo e vazio saíam daqui sem deixar linha nenhuma, e eram justamente a
  // maior fatia do tráfego. "68 eventos sem rastro" não era um mistério: era
  // esta ordem. Agora a linha nasce primeiro e o filtro só a carimba.
  const msgId = p?.msgId || null;
  const estado = await abrirRastro(msgId, p?.telefone || null);

  if (!p) return encerrar(msgId, "sem_mensagem");
  if (estado === "repetido") return encerrar(msgId, "duplicado");
  if (p.ehGrupo) return encerrar(msgId, "grupo");
  if (!p.texto && !p.temMidia && !p.temAudio) return encerrar(msgId, "vazio");

  try {

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
      // O ESPELHO TAMBÉM PRECISA DIZER O QUE FEZ. `{tipo:"nada"}` é o caso
      // em que a mensagem é descartada de propósito — mídia sem legenda para
      // um número que não é família nem lead. Descartar de propósito e perder
      // sem saber davam na mesma linha em branco.
      const carimbo: Desfecho =
        esp.tipo === "cliente" ? "espelho_cliente"
        : esp.tipo === "eco"   ? "espelho_eco"
        : esp.tipo === "lead"  ? "espelho_lead"
        : "espelho_nada";
      return encerrar(msgId, carimbo, { resultado: "saida" });
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
      return encerrar(msgId, "lead");
    }
    if (reg.tipo === "ignorado" || reg.tipo === "escalado") {
      return encerrar(msgId, reg.tipo, { motivo: (reg as any).motivo });
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
    return encerrar(msgId, "gravada", { transcrito });
  } catch (e: any) {
    console.error("[webhook] erro ao processar:", e?.message || e);
    await registrarErro("webhook", e, { telefone: p?.telefone });
    await carimbarRotina("webhook", false, undefined, e?.message || String(e));
    // `erro` não é um desfecho final: `abrirRastro` deixa o Evolution
    // reenviar esta mesma mensagem e processá-la de novo. Antes, a linha de
    // dedupe já estava gravada quando a falha acontecia — e a segunda chance
    // era recusada como duplicada. A mensagem morria ali, calada.
    await fecharRastro(msgId, "erro");
    return NextResponse.json({ ok: false, erro: "processamento" });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, servico: "sureya-webhook" });
}
