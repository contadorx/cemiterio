import { env } from "./env";

// Administração da instância do Evolution (conexão do WhatsApp).
// Formatos de resposta variam entre versões — os parsers abaixo toleram os comuns.

function headers() {
  return { "Content-Type": "application/json", apikey: env.evolutionKey() };
}
function base() {
  return env.evolutionUrl().replace(/\/$/, "");
}
function inst() {
  return env.evolutionInstance();
}

async function req(method: string, path: string, body?: any) {
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    /* corpo não-JSON */
  }
  return { ok: res.ok, status: res.status, json, texto };
}

export type EstadoConexao = "conectado" | "conectando" | "desconectado" | "inexistente" | "erro";

export async function statusConexao(): Promise<{ estado: EstadoConexao; detalhe?: string }> {
  const r = await req("GET", `/instance/connectionState/${inst()}`);
  if (r.status === 404) return { estado: "inexistente" };
  if (!r.ok) return { estado: "erro", detalhe: r.texto.slice(0, 300) };

  const state =
    r.json?.instance?.state || r.json?.state || r.json?.instance?.connectionStatus || "";
  if (state === "open") return { estado: "conectado" };
  if (state === "connecting") return { estado: "conectando" };
  if (state === "close" || state === "closed") return { estado: "desconectado" };
  return { estado: "erro", detalhe: `estado desconhecido: ${state}` };
}

async function criarInstancia(): Promise<{ ok: boolean; detalhe?: string }> {
  const r = await req("POST", "/instance/create", {
    instanceName: inst(),
    integration: "WHATSAPP-BAILEYS",
    qrcode: true,
  });
  if (r.ok) return { ok: true };
  // já existe? tratamos como ok
  if (r.status === 403 || /already|exists|em uso/i.test(r.texto)) return { ok: true };
  return { ok: false, detalhe: r.texto.slice(0, 300) };
}

function extrairQr(json: any): string | null {
  const b64 =
    json?.base64 ||
    json?.qrcode?.base64 ||
    json?.instance?.qrcode?.base64 ||
    json?.qr?.base64 ||
    null;
  if (!b64) return null;
  return b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`;
}

// Garante a instância e retorna o QR (ou o estado, se já conectado).
export async function conectar(): Promise<{
  estado: EstadoConexao;
  qr?: string | null;
  detalhe?: string;
}> {
  const st = await statusConexao();
  if (st.estado === "conectado") return { estado: "conectado" };

  if (st.estado === "inexistente") {
    const c = await criarInstancia();
    if (!c.ok) return { estado: "erro", detalhe: c.detalhe };
  }

  const r = await req("GET", `/instance/connect/${inst()}`);
  if (!r.ok) return { estado: "erro", detalhe: r.texto.slice(0, 300) };

  const qr = extrairQr(r.json);
  return { estado: "conectando", qr, detalhe: qr ? undefined : "QR não veio na resposta" };
}

export async function desconectar(): Promise<{ ok: boolean; detalhe?: string }> {
  const r = await req("DELETE", `/instance/logout/${inst()}`);
  if (r.ok) return { ok: true };
  return { ok: false, detalhe: r.texto.slice(0, 300) };
}

// Aponta o webhook da instância para o nosso endpoint (tenta formato v2, depois v1).
export async function configurarWebhook(urlWebhook: string): Promise<{ ok: boolean; detalhe?: string }> {
  const eventos = ["MESSAGES_UPSERT"];

  // v2: corpo aninhado
  let r = await req("POST", `/webhook/set/${inst()}`, {
    webhook: { enabled: true, url: urlWebhook, events: eventos, base64: true, byEvents: false },
  });
  if (r.ok) return { ok: true };

  // v1: corpo plano
  r = await req("POST", `/webhook/set/${inst()}`, {
    enabled: true,
    url: urlWebhook,
    events: eventos,
    webhook_by_events: false,
    webhook_base64: true,
  });
  if (r.ok) return { ok: true };

  return { ok: false, detalhe: r.texto.slice(0, 300) };
}
