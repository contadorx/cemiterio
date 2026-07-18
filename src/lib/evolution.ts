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
