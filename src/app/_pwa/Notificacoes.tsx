"use client";

import { useEffect, useState } from "react";

/** Converte a chave VAPID (base64url) para o formato que o navegador espera. */
function paraUint8(base64: string): BufferSource {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}

/**
 * Ativar avisos no navegador.
 * Só avisa do que não pode esperar: família que escreveu e não foi respondida.
 */
export default function Notificacoes({ compacto }: { compacto?: boolean }) {
  const [estado, setEstado] = useState<"carregando" | "indisponivel" | "desligado" | "ligado" | "negado">("carregando");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
        setEstado("indisponivel");
        return;
      }
      if (Notification.permission === "denied") { setEstado("negado"); return; }
      const r = await fetch("/api/push").then((x) => x.json()).catch(() => null);
      if (!r?.chave) { setEstado("indisponivel"); return; }
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      const sub = await reg?.pushManager.getSubscription().catch(() => null);
      setEstado(sub && r.inscrito ? "ligado" : "desligado");
    })();
  }, []);

  async function ligar() {
    setOcupado(true);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") { setEstado("negado"); return; }

      const { chave } = await fetch("/api/push").then((x) => x.json());
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: paraUint8(chave),
      });
      const j = sub.toJSON() as any;
      const r = await fetch("/api/push", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: j.endpoint, keys: j.keys,
          aparelho: navigator.userAgent.slice(0, 120),
        }),
      }).then((x) => x.json());
      if (r?.ok) {
        setEstado("ligado");
        await fetch("/api/push", { method: "PUT" });   // aviso de teste
      }
    } catch {
      alert("Não consegui ativar os avisos neste aparelho.");
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true);
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    const sub = await reg?.pushManager.getSubscription().catch(() => null);
    if (sub) {
      await fetch(`/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: "DELETE" });
      await sub.unsubscribe().catch(() => null);
    }
    setEstado("desligado");
    setOcupado(false);
  }

  if (estado === "carregando") return null;
  if (estado === "indisponivel") return null;

  const base: React.CSSProperties = compacto
    ? { padding: "6px 12px", fontSize: 13, borderRadius: 8, cursor: "pointer", border: "1px solid #cbd5e1", background: "#fff" }
    : { padding: "10px 16px", fontSize: 14, borderRadius: 10, cursor: "pointer", border: "1px solid #cbd5e1", background: "#fff" };

  if (estado === "negado") {
    return (
      <span style={{ ...base, color: "#92400e", background: "#fffbeb", display: "inline-block" }}>
        Avisos bloqueados neste navegador — libere nas configurações do site
      </span>
    );
  }

  if (estado === "ligado") {
    return (
      <button style={{ ...base, color: "#0f766e", borderColor: "#0f766e", background: "#f0fdfa" }}
              onClick={desligar} disabled={ocupado}>
        🔔 Avisos ligados
      </button>
    );
  }

  return (
    <button style={{ ...base, color: "#12284b", fontWeight: 600 }} onClick={ligar} disabled={ocupado}>
      {ocupado ? "Ativando…" : "🔕 Ativar avisos no celular"}
    </button>
  );
}
