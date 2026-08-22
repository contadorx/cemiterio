"use client";

import { useState } from "react";
import { MARCA } from "@/lib/marca";
import { SITE } from "@/lib/site";

/**
 * O formulário do site. Curto de propósito.
 *
 * Cada campo a mais derruba uma parte de quem ia preencher. Nome e telefone são
 * obrigatórios porque sem eles não dá para responder; o resto é opcional e
 * existe só para a primeira conversa já começar adiantada.
 */

const c = MARCA.cores;

export default function FormularioContato() {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [jazigo, setJazigo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [empresa, setEmpresa] = useState(""); // armadilha de robô
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const r = await fetch("/api/contato", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nome, telefone, jazigo, mensagem, empresa }),
      }).then((x) => x.json());
      if (r?.ok) setPronto(true);
      else setErro(r?.mensagem || "Não consegui enviar. Tente pelo WhatsApp.");
    } catch {
      setErro("Não consegui enviar. Tente pelo WhatsApp.");
    } finally {
      setEnviando(false);
    }
  }

  if (pronto) {
    return (
      <div style={s.ok}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>✓</div>
        <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>{SITE.form.ok}</p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} style={s.form}>
      <label style={s.rot}>
        Seu nome
        <input
          style={s.input}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
          autoComplete="name"
        />
      </label>

      <label style={s.rot}>
        Telefone com DDD
        <input
          style={s.input}
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 90000-0000"
        />
      </label>

      <label style={s.rot}>
        Quem está no jazigo, ou a quadra e o número <span style={s.opc}>(se souber)</span>
        <input
          style={s.input}
          value={jazigo}
          onChange={(e) => setJazigo(e.target.value)}
          placeholder="Ex.: minha mãe, Maria de Souza — ou quadra 12, número 4"
        />
      </label>

      <label style={s.rot}>
        Quer contar mais alguma coisa? <span style={s.opc}>(opcional)</span>
        <textarea
          style={{ ...s.input, minHeight: 88, resize: "vertical" }}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
        />
      </label>

      {/* armadilha: fica fora da tela, só robô preenche */}
      <input
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={empresa}
        onChange={(e) => setEmpresa(e.target.value)}
        style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
      />

      {erro ? <p style={s.erro}>{erro}</p> : null}

      <button type="submit" disabled={enviando} style={{ ...s.botao, opacity: enviando ? 0.6 : 1 }}>
        {enviando ? "Enviando…" : "Quero que me chamem"}
      </button>

      <p style={s.lgpd}>{SITE.lgpd}</p>
    </form>
  );
}

const s: Record<string, React.CSSProperties> = {
  form: { display: "grid", gap: 16, maxWidth: 520, margin: "0 auto", textAlign: "left", position: "relative" },
  rot: { display: "grid", gap: 6, fontSize: 14, fontWeight: 600, color: c.navy },
  opc: { fontWeight: 400, color: c.suave },
  input: {
    padding: "13px 14px",
    border: `1px solid ${c.linha}`,
    borderRadius: 10,
    fontSize: 16, // 16px evita o zoom automático do iPhone
    fontFamily: "inherit",
    background: "#fff",
    color: c.navy,
    width: "100%",
    boxSizing: "border-box",
  },
  botao: {
    padding: "16px 22px",
    background: c.navy,
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: 17,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  erro: { margin: 0, color: "#b91c1c", fontSize: 14, fontWeight: 600 },
  lgpd: { margin: 0, fontSize: 12.5, color: c.suave, lineHeight: 1.6 },
  ok: {
    maxWidth: 520,
    margin: "0 auto",
    padding: 28,
    background: "#fff",
    border: `1px solid ${c.linha}`,
    borderRadius: 14,
    color: c.navy,
    textAlign: "center",
  },
};
