import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";
import { enviarWhatsapp, enviarWhatsappMidia } from "./evolution";
import { disparosAtivos } from "./disparos";

const MAX_TENTATIVAS = 5;

function backoffMin(tentativa: number): number {
  return Math.min(60, Math.pow(2, tentativa)); // 2,4,8,16,32,60 min
}

async function enfileirar(
  telefone: string,
  tipo: "texto" | "midia",
  payload: Record<string, any>,
  erro: string
) {
  const db = supabaseAdmin();
  await db.from("fila_envios").insert({
    org_id: env.orgId(),
    telefone,
    tipo,
    payload,
    tentativas: 1,
    status: "pendente",
    ultimo_erro: erro.slice(0, 500),
    proximo_retry: new Date(Date.now() + backoffMin(1) * 60_000).toISOString(),
  });
}

// Envio de texto com retry silencioso: nunca lança; retorna se saiu na hora.
export async function enviarTextoComRetry(telefone: string, texto: string): Promise<boolean> {
  try {
    await enviarWhatsapp(telefone, texto);
    return true;
  } catch (e: any) {
    console.error("[envio] texto falhou, enfileirando:", e?.message || e);
    await enfileirar(telefone, "texto", { texto }, String(e?.message || e));
    return false;
  }
}

export async function enviarMidiaComRetry(
  telefone: string,
  media: string,
  caption: string
): Promise<boolean> {
  try {
    await enviarWhatsappMidia(telefone, media, caption);
    return true;
  } catch (e: any) {
    console.error("[envio] mídia falhou, enfileirando:", e?.message || e);
    await enfileirar(telefone, "midia", { media, caption }, String(e?.message || e));
    return false;
  }
}

// Processa a fila (chamado pelo cron por minuto).
export async function processarFilaEnvios(): Promise<{ enviados: number; falhas: number; pausado?: boolean }> {
  // Chave mestra desligada: não drena a fila. Os itens continuam pendentes e
  // saem sozinhos assim que os disparos forem religados.
  if (!(await disparosAtivos())) {
    return { enviados: 0, falhas: 0, pausado: true };
  }

  const db = supabaseAdmin();
  const org = env.orgId();
  const agora = new Date().toISOString();

  const { data: pendentes } = await db
    .from("fila_envios")
    .select("id,telefone,tipo,payload,tentativas")
    .eq("org_id", org)
    .eq("status", "pendente")
    .lte("proximo_retry", agora)
    .limit(20);

  let enviados = 0;
  let falhas = 0;

  for (const f of pendentes || []) {
    const p = (f as any).payload || {};

    // -------------------------------------------------------------------
    // A MESMA MENSAGEM NAO PODE SAIR DUAS VEZES PARA A FAMILIA.
    //
    // Este cron roda A CADA MINUTO e maxDuration e de 60s: duas execucoes se
    // sobrepoem com facilidade. Como o item so virava "enviado" DEPOIS do
    // envio, as duas liam "pendente" e as duas mandavam — a familia recebia a
    // mesma foto (ou a mesma cobranca) em dobro. Numa mensagem de luto, isso
    // e constrangedor; numa cobranca, e pior.
    //
    // A CORRECAO SEM MIGRATION: em vez de um status novo (o enum
    // sureya_status_envio so tem pendente/enviado/falhou), empurramos o
    // proximo_retry para 5 minutos a frente ANTES de enviar. A busca la em
    // cima so pega quem tem proximo_retry <= agora, entao a execucao vizinha
    // nao enxerga mais este item.
    //
    // A condicao `.lte("proximo_retry", agora)` no proprio UPDATE e o que
    // torna isso atomico: se a outra execucao ja empurrou, este update nao
    // acha linha e devolve null — e a gente pula. Nao e lock, e escrita
    // condicional no banco (mesma ideia do `processada` em atendimento.ts).
    //
    // Efeito colateral bom: se o processo morrer no meio do envio, o item
    // volta sozinho a ficar elegivel em 5 minutos, sem gastar uma tentativa.
    // -------------------------------------------------------------------
    const { data: meu } = await db
      .from("fila_envios")
      .update({ proximo_retry: new Date(Date.now() + 5 * 60_000).toISOString() })
      .eq("id", (f as any).id)
      .eq("status", "pendente")
      .lte("proximo_retry", agora)   // <- a trava: so pega quem ainda esta livre
      .select("id")
      .maybeSingle();
    if (!meu) continue;              // outra execucao pegou este item

    try {
      if ((f as any).tipo === "midia") {
        await enviarWhatsappMidia((f as any).telefone, p.media, p.caption || "");
      } else {
        await enviarWhatsapp((f as any).telefone, p.texto || "");
      }
      await db.from("fila_envios").update({ status: "enviado" }).eq("id", (f as any).id);
      enviados++;
    } catch (e: any) {
      const t = ((f as any).tentativas || 0) + 1;
      const esgotou = t >= MAX_TENTATIVAS;
      await db
        .from("fila_envios")
        .update({
          tentativas: t,
          status: esgotou ? "falhou" : "pendente",
          ultimo_erro: String(e?.message || e).slice(0, 500),
          proximo_retry: new Date(Date.now() + backoffMin(t) * 60_000).toISOString(),
        })
        .eq("id", (f as any).id);
      falhas++;
    }
  }

  return { enviados, falhas };
}
