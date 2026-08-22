"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar() {
    setErro("");
    setCarregando(true);
    const db = supabaseBrowser();
    const { error } = await db.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) {
      setErro("E-mail ou senha inválidos.");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    window.location.href = params.get("redir") || "/campo";
  }

  return (
    <main style={s.wrap}>
      <div style={s.card}>
        <h1 style={s.titulo}>Sureya</h1>
        <input
          style={s.input}
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          style={s.input}
          type="password"
          placeholder="Senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && entrar()}
        />
        {erro && <p style={s.erro}>{erro}</p>}
        <button style={s.botao} onClick={entrar} disabled={carregando}>
          {carregando ? "Entrando..." : "Entrar"}
        </button>
      </div>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", display: "grid", placeItems: "center", background: "#0f172a", fontFamily: "system-ui", padding: 20 },
  card: { width: "100%", maxWidth: 360, background: "#fff", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 12 },
  titulo: { margin: "0 0 8px", fontSize: 28, textAlign: "center", color: "#0f172a" },
  input: { padding: 16, fontSize: 18, borderRadius: 12, border: "1px solid #cbd5e1" },
  botao: { padding: 18, fontSize: 20, fontWeight: 700, borderRadius: 12, border: "none", background: "#0f766e", color: "#fff" },
  erro: { color: "#dc2626", margin: 0, fontSize: 14 },
};
