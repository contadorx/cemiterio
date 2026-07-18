import { env } from "./env";

// Normaliza telefone p/ dígitos (E.164 sem +). Ex: "+55 (11) 99999-9999" -> "5511999999999"
export function normalizarTelefone(raw: string): string {
  return (raw || "").replace(/\D/g, "");
}

// Envia texto pelo WhatsApp da instância configurada.
export async function enviarWhatsapp(telefone: string, texto: string): Promise<void> {
  const numero = normalizarTelefone(telefone);
  const url = `${env.evolutionUrl()}/message/sendText/${env.evolutionInstance()}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.evolutionKey(),
    },
    body: JSON.stringify({ number: numero, text: texto }),
  });

  if (!res.ok) {
    const detalhe = await res.text().catch(() => "");
    throw new Error(`Evolution sendText falhou (${res.status}): ${detalhe}`);
  }
}

// Baixa a mídia de uma mensagem em base64.
// 1) se o payload já veio com base64 (webhookBase64=true), usa direto;
// 2) senão pede ao Evolution (getBase64FromMediaMessage).
export async function baixarMidiaBase64(
  mensagemRaw: any
): Promise<{ base64: string; mimetype: string } | null> {
  // caso 1: já veio no webhook
  const inline = mensagemRaw?.message?.base64 || mensagemRaw?.base64;
  if (inline) {
    const mt =
      mensagemRaw?.message?.imageMessage?.mimetype ||
      mensagemRaw?.message?.documentMessage?.mimetype ||
      "image/jpeg";
    return { base64: inline, mimetype: mt };
  }

  // caso 2: buscar no Evolution
  try {
    const url = `${env.evolutionUrl()}/chat/getBase64FromMediaMessage/${env.evolutionInstance()}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: env.evolutionKey() },
      body: JSON.stringify({ message: mensagemRaw }),
    });
    if (!res.ok) {
      console.error("[evolution] getBase64 falhou:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const j: any = await res.json();
    const base64 = j?.base64 || j?.media || null;
    if (!base64) return null;
    const mimetype =
      j?.mimetype ||
      mensagemRaw?.message?.imageMessage?.mimetype ||
      mensagemRaw?.message?.documentMessage?.mimetype ||
      "image/jpeg";
    return { base64, mimetype };
  } catch (e) {
    console.error("[evolution] getBase64 exceção:", (e as any)?.message || e);
    return null;
  }
}
