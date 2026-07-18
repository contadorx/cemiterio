"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

export default function Avaliar() {
  const params = useParams();
  const token = params?.token as string;
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState("");
  const [estado, setEstado] = useState<"form" | "enviando" | "ok" | "erro">("form");

  async function enviar() {
    if (!nota) return;
    setEstado("enviando");
    const r = await fetch("/api/avaliar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, nota, comentario }),
    }).then((x) => x.json()).catch(() => null);
    setEstado(r?.ok ? "ok" : "erro");
  }

  if (estado === "ok") {
    return (
      <div style={s.wrap}>
        <div style={s.card}>
          <div style={s.emoji}>🌿</div>
          <h1 style={s.h1}>Obrigado!</h1>
          <p style={s.p}>Sua avaliação foi registrada. É muito importante pra nós cuidarmos cada vez melhor.</p>
        </div>
      </div>
    );
  }
  if (estado === "erro") {
    return (
      <div style={s.wrap}>
        <div style={s.card}>
          <p style={s.p}>Este link de avaliação não é válido ou já foi usado.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.marca}>🕊 Sureya</div>
        <h1 style={s.h1}>Como foi o nosso cuidado?</h1>
        <p style={s.p}>Sua opinião ajuda a Sureya a cuidar cada vez melhor.</p>

        <div style={s.estrelas}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setNota(n)} style={s.estrela} aria-label={`${n} estrelas`}>
              <span style={{ opacity: n <= nota ? 1 : 0.25 }}>⭐</span>
            </button>
          ))}
        </div>

        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Quer deixar um recado? (opcional)"
          style={s.textarea}
        />

        <button style={{ ...s.botao, opacity: nota ? 1 : 0.5 }} onClick={enviar} disabled={!nota || estado === "enviando"}>
          {estado === "enviando" ? "Enviando..." : "Enviar avaliação"}
        </button>
      </div>
    </div>
  );
}

const NAVY = "#12284b";
const GOLD = "#c6a15b";
const CREAM = "#f7f3e9";
const s: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", background: CREAM, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "Georgia, serif", color: NAVY },
  card: { background: "#fff", border: "1px solid #e7e0cf", borderRadius: 16, padding: 32, maxWidth: 420, width: "100%", textAlign: "center" },
  marca: { color: GOLD, letterSpacing: 2, textTransform: "uppercase", fontSize: 14, marginBottom: 16 },
  emoji: { fontSize: 40, marginBottom: 8 },
  h1: { fontSize: 26, fontWeight: 400, margin: "0 0 8px" },
  p: { color: "#6b7280", fontSize: 15, lineHeight: 1.6, margin: "0 0 20px" },
  estrelas: { display: "flex", justifyContent: "center", gap: 6, marginBottom: 20 },
  estrela: { background: "none", border: "none", fontSize: 34, cursor: "pointer", padding: 4 },
  textarea: { width: "100%", minHeight: 90, padding: 12, borderRadius: 10, border: "1px solid #e7e0cf", fontFamily: "inherit", fontSize: 15, boxSizing: "border-box", marginBottom: 16, resize: "vertical" },
  botao: { width: "100%", padding: 14, fontSize: 16, fontWeight: 700, borderRadius: 10, border: "none", background: NAVY, color: "#fff", cursor: "pointer" },
};
