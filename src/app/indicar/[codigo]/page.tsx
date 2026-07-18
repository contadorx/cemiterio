"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

export default function Indicar() {
  const params = useParams();
  const codigo = params?.codigo as string;
  const [nome, setNome] = useState("");
  const [tel, setTel] = useState("");
  const [estado, setEstado] = useState<"form" | "enviando" | "ok" | "erro">("form");

  async function enviar() {
    if (!nome && !tel) return;
    setEstado("enviando");
    const r = await fetch("/api/indicar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, nome, tel }),
    }).then((x) => x.json()).catch(() => null);
    setEstado(r?.ok ? "ok" : "erro");
  }

  if (estado === "ok") {
    return (
      <div style={s.wrap}>
        <div style={s.card}>
          <div style={s.emoji}>🌿</div>
          <h1 style={s.h1}>Recebido, obrigado!</h1>
          <p style={s.p}>Vamos entrar em contato em breve para cuidar com o mesmo carinho.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.marca}>🕊 Sureya</div>
        <h1 style={s.h1}>Você foi indicado por quem confia na gente</h1>
        <p style={s.p}>
          Cuidamos da limpeza e manutenção de túmulos no Cemitério da Saudade, com foto de cada visita.
          Deixe seu contato que a gente conversa sem compromisso.
        </p>
        <input style={s.input} placeholder="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        <input style={s.input} placeholder="Seu WhatsApp" value={tel} onChange={(e) => setTel(e.target.value)} />
        {estado === "erro" && <p style={{ ...s.p, color: "#dc2626" }}>Não consegui registrar. Confira o link e tente de novo.</p>}
        <button style={{ ...s.botao, opacity: nome || tel ? 1 : 0.5 }} onClick={enviar} disabled={(!nome && !tel) || estado === "enviando"}>
          {estado === "enviando" ? "Enviando..." : "Quero saber mais"}
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
  h1: { fontSize: 24, fontWeight: 400, margin: "0 0 8px" },
  p: { color: "#6b7280", fontSize: 15, lineHeight: 1.6, margin: "0 0 16px" },
  input: { width: "100%", padding: 12, borderRadius: 10, border: "1px solid #e7e0cf", fontFamily: "inherit", fontSize: 15, boxSizing: "border-box", marginBottom: 12 },
  botao: { width: "100%", padding: 14, fontSize: 16, fontWeight: 700, borderRadius: 10, border: "none", background: NAVY, color: "#fff", cursor: "pointer", marginTop: 4 },
};
