import webpush from "web-push";
import { supabaseAdmin } from "./supabase-admin";
import { env } from "./env";

/**
 * NOTIFICAÇÃO NO NAVEGADOR
 *
 * O ponto não é avisar de tudo — é avisar do que não pode esperar:
 * família que escreveu e ainda não foi respondida.
 * Notificação demais vira ruído e a pessoa desliga.
 */

let configurado = false;
function configurar(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!configurado) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:contato@zeloememoria.com.br",
      pub,
      priv
    );
    configurado = true;
  }
  return true;
}

export interface Aviso {
  titulo: string;
  corpo: string;
  url?: string;
  tag?: string;          // avisos com a mesma tag se substituem (não empilham)
}

/** Manda para todos os aparelhos de quem está no painel. */
export async function avisar(aviso: Aviso, userIds?: string[]): Promise<number> {
  if (!configurar()) return 0;

  const db = supabaseAdmin();
  let q = db.from("assinaturas_push").select("id,endpoint,p256dh,auth").eq("org_id", env.orgId());
  if (userIds?.length) q = q.in("user_id", userIds);
  const { data: assinaturas } = await q;

  const payload = JSON.stringify({
    titulo: aviso.titulo,
    corpo: aviso.corpo,
    url: aviso.url || "/painel/conversas",
    tag: aviso.tag || "zm",
  });

  let enviados = 0;
  for (const a of (assinaturas || []) as any[]) {
    try {
      await webpush.sendNotification(
        { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
        payload
      );
      enviados++;
      await db.from("assinaturas_push")
        .update({ ultima_uso: new Date().toISOString() }).eq("id", a.id);
    } catch (e: any) {
      // 404/410 = a pessoa desinstalou ou limpou os dados: a assinatura morreu
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await db.from("assinaturas_push").delete().eq("id", a.id);
      }
    }
  }
  return enviados;
}

/** Aviso de mensagem nova de uma família. */
export async function avisarMensagemNova(nomeCliente: string, texto: string, conversaId: string) {
  const resumo = (texto || "").slice(0, 90) + ((texto || "").length > 90 ? "…" : "");
  return avisar({
    titulo: nomeCliente,
    corpo: resumo || "mandou uma mensagem",
    url: `/painel/conversas/${conversaId}`,
    tag: `conversa-${conversaId}`,   // mensagens da mesma conversa não empilham
  });
}
