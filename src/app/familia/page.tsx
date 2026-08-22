"use client";

import { useState } from "react";
import Link from "next/link";
import { MARCA } from "@/lib/marca";
import { linkWhats } from "@/lib/site";

/**
 * /familia — "perdi o link do acompanhamento".
 *
 * O portal da família mora em /familia/TOKEN. O token chega uma vez, no
 * WhatsApp, e some na conversa. Esta página é a porta para quem não acha mais.
 *
 * Ela NÃO mostra o link na tela: manda no WhatsApp do número digitado. E a
 * resposta é sempre a mesma, seja o número cliente ou não — senão qualquer um
 * usaria este campo para descobrir quem é cliente da casa (ver o comentário da
 * rota /api/familia/link).
 */

const c = MARCA.cores;

export default function PortaDaFamilia() {
  const [telefone, setTelefone] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [estado, setEstado] = useState<"parado" | "enviando" | "pronto">("parado");
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setEstado("enviando");
    try {
      const r = await fetch("/api/familia/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ telefone, empresa }),
      }).then((x) => x.json());
      if (r?.ok) {
        setMsg(r.mensagem || "");
        setEstado("pronto");
      } else {
        setErro(r?.mensagem || "Não consegui enviar agora.");
        setEstado("parado");
      }
    } catch {
      setErro("Não consegui enviar agora. Chame no WhatsApp.");
      setEstado("parado");
    }
  }

  return (
    <main style={s.pagina}>
      <div style={s.caixa}>
        <Link href="/" style={s.voltar}>
          ← {MARCA.nome}
        </Link>

        <h1 style={s.h1}>Acompanhamento da sua família</h1>
        <p style={s.texto}>
          É a página com as fotos de cada visita ao jazigo. O link é só seu e não expira —
          mas costuma se perder na conversa do WhatsApp.
        </p>

        {estado === "pronto" ? (
          <div style={s.ok}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>✓</div>
            <p style={{ margin: 0, fontSize: 16.5, lineHeight: 1.65 }}>{msg}</p>
            <p style={{ margin: "16px 0 0", fontSize: 14, color: c.suave, lineHeight: 1.6 }}>
              Não chegou em alguns minutos? Pode ser que o número cadastrado seja outro —
              o de quem contratou.{" "}
              <a href={linkWhats("Ola! Nao consegui receber o link do acompanhamento.")}
                 style={s.link} target="_blank" rel="noopener">
                Fale com a gente
              </a>
              .
            </p>
          </div>
        ) : (
          <form onSubmit={enviar} style={s.form}>
            <label style={s.rot}>
              Seu telefone, com DDD
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

            <p style={s.aviso}>
              O link vai para o WhatsApp deste número. Ele não aparece aqui na tela —
              é assim que a gente garante que o acompanhamento da sua família não abre
              para quem não é da casa.
            </p>

            <input
              tabIndex={-1}
              aria-hidden="true"
              autoComplete="off"
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
            />

            {erro ? <p style={s.erro}>{erro}</p> : null}

            <button type="submit" disabled={estado === "enviando"} style={{ ...s.botao, opacity: estado === "enviando" ? 0.6 : 1 }}>
              {estado === "enviando" ? "Enviando…" : "Receber meu link no WhatsApp"}
            </button>
          </form>
        )}

        <p style={s.rodape}>
          Prefere resolver conversando?{" "}
          <a href={linkWhats("Ola! Queria o link do acompanhamento do jazigo da minha familia.")}
             style={s.link} target="_blank" rel="noopener">
            Chame no WhatsApp
          </a>
          .
        </p>
      </div>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  pagina: {
    minHeight: "100vh",
    background: c.cream,
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    color: c.navy,
    display: "grid",
    placeItems: "center",
    padding: 24,
  },
  caixa: {
    width: "100%",
    maxWidth: 480,
    background: "#fff",
    border: `1px solid ${c.linha}`,
    borderRadius: 18,
    padding: 32,
    position: "relative",
  },
  voltar: { color: c.suave, textDecoration: "none", fontSize: 14, fontWeight: 600 },
  h1: { fontSize: 25, margin: "18px 0 10px", lineHeight: 1.25, letterSpacing: -0.3 },
  texto: { margin: "0 0 26px", fontSize: 15.5, color: c.suave, lineHeight: 1.7 },
  form: { display: "grid", gap: 16 },
  rot: { display: "grid", gap: 6, fontSize: 14, fontWeight: 600 },
  input: {
    padding: "13px 14px",
    border: `1px solid ${c.linha}`,
    borderRadius: 10,
    fontSize: 16,
    fontFamily: "inherit",
    color: c.navy,
    width: "100%",
    boxSizing: "border-box",
  },
  aviso: { margin: 0, fontSize: 13.5, color: c.suave, lineHeight: 1.65 },
  erro: { margin: 0, color: "#b91c1c", fontSize: 14, fontWeight: 600 },
  botao: {
    padding: "16px 22px",
    background: c.navy,
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontSize: 16.5,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  ok: {
    padding: 24,
    background: c.cream,
    border: `1px solid ${c.linha}`,
    borderRadius: 14,
    textAlign: "center",
  },
  rodape: { margin: "26px 0 0", fontSize: 14, color: c.suave, textAlign: "center" },
  link: { color: c.navy, fontWeight: 700 },
};
