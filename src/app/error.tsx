"use client";

import { useEffect } from "react";

/**
 * Tela de erro do app inteiro.
 *
 * Sem isto, um erro de JavaScript deixa a tela em branco com uma mensagem
 * técnica em inglês — inútil para quem está no cemitério tentando trabalhar.
 * Aqui a pessoa entende o que houve e tem um caminho para sair do lugar.
 */
export default function Erro({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("[erro]", error);
    // avisa o servidor, para o problema aparecer em Config → Diagnóstico
    fetch("/api/erro-cliente", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mensagem: error?.message || "erro desconhecido",
        stack: String(error?.stack || "").slice(0, 1500),
        url: typeof window !== "undefined" ? window.location.pathname : null,
      }),
    }).catch(() => null);
  }, [error]);

  async function limparELembrar() {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const chaves = await caches.keys();
        await Promise.all(chaves.map((k) => caches.delete(k)));
      }
    } catch {
      /* segue mesmo assim */
    }
    window.location.reload();
  }

  return (
    <div style={s.tela}>
      <div style={s.caixa}>
        <div style={{ fontSize: 40 }}>🌿</div>
        <h1 style={s.titulo}>Algo deu errado aqui</h1>
        <p style={s.texto}>
          Não foi culpa sua e nada do que você registrou se perdeu.
          Quase sempre é uma versão antiga guardada no aparelho.
        </p>

        <button style={s.botao} onClick={() => reset()}>
          Tentar de novo
        </button>

        <button style={s.botaoSec} onClick={limparELembrar}>
          Limpar e recarregar
        </button>

        <p style={s.dica}>
          Se continuar assim, avise a Sureya — o erro já foi registrado no sistema.
        </p>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  tela: { minHeight: "100vh", background: "#f7f3e9", display: "flex", alignItems: "center",
          justifyContent: "center", padding: 24, fontFamily: "system-ui, sans-serif" },
  caixa: { maxWidth: 420, textAlign: "center" },
  titulo: { color: "#12284b", fontSize: 23, margin: "10px 0" },
  texto: { color: "#475569", fontSize: 17, lineHeight: 1.6, margin: "0 0 22px" },
  botao: { width: "100%", minHeight: 60, padding: "18px 24px", fontSize: 18, fontWeight: 700,
           background: "#0f766e", color: "#fff", border: "none", borderRadius: 14,
           cursor: "pointer", marginBottom: 12 },
  botaoSec: { width: "100%", minHeight: 56, padding: "16px 24px", fontSize: 17, fontWeight: 600,
              background: "#fff", color: "#12284b", border: "2px solid #e7e0cf",
              borderRadius: 14, cursor: "pointer" },
  dica: { color: "#475569", fontSize: 15, marginTop: 20 },
};
