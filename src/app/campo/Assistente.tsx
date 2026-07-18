"use client";

import { useEffect, useRef, useState } from "react";

interface Briefing {
  saudacao: string;
  totalHoje: number;
  quadras: string[];
  atencoes: string[];
  materiais: string[];
  pendencias: number;
  meta: string;
}

export default function Assistente({ onMudou }: { onMudou: () => void }) {
  const [b, setB] = useState<Briefing | null>(null);
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState<{ papel: "ajudante" | "sistema"; texto: string }[]>([]);
  const [entrada, setEntrada] = useState("");
  const [pensando, setPensando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/campo/briefing")
      .then((x) => x.json())
      .then((r) => r.ok && setB(r.briefing))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, pensando]);

  const atalhos = ["Está chovendo", "Acabou a água", "Faltou material", "Não achei o túmulo", "Terminei tudo"];

  async function enviar(texto?: string) {
    const t = (texto ?? entrada).trim();
    if (!t || pensando) return;
    const novo = [...msgs, { papel: "ajudante" as const, texto: t }];
    setMsgs(novo);
    setEntrada("");
    setPensando(true);

    const r = await fetch("/api/campo/conversa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ historico: novo }),
    }).then((x) => x.json()).catch(() => null);
    setPensando(false);

    if (r?.ok) {
      setMsgs([...novo, { papel: "sistema", texto: r.resposta }]);
      if (r.registrou) onMudou();
    } else {
      setMsgs([...novo, { papel: "sistema", texto: "Não consegui registrar agora. Tenta de novo daqui a pouco." }]);
    }
  }

  async function puxarMais() {
    const r = await fetch("/api/campo/puxar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantidade: 5 }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      setMsgs((m) => [...m, { papel: "sistema", texto: `Puxei ${r.puxados} túmulo(s) para hoje. Já estão na sua lista.` }]);
      setAberto(true);
      onMudou();
    }
  }

  async function fecharDia() {
    if (!confirm("Encerrar o dia? O que não foi feito volta para a lista e é priorizado nos próximos dias.")) return;
    const obs = prompt("Quer deixar alguma observação sobre o dia? (opcional)") || "";
    const r = await fetch("/api/campo/fechar-dia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ observacoes: obs }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      alert(`Dia encerrado. ${r.feitos} feito(s)${r.devolvidos ? `, ${r.devolvidos} remarcado(s) para os próximos dias.` : "."}\n\nObrigado pelo seu trabalho hoje. 🌿`);
      setAberto(false);
      onMudou();
    }
  }

  return (
    <div style={s.wrap}>
      {b && (
        <div style={s.briefing}>
          <div style={s.saudacao}>{b.saudacao}</div>
          <div style={s.meta}>{b.meta}</div>
          {b.quadras.length > 0 && <div style={s.linha}>📍 Quadras: {b.quadras.join(", ")}</div>}
          {b.atencoes.map((a, i) => (
            <div key={i} style={s.atencao}>⚠️ {a}</div>
          ))}
          {b.materiais.length > 0 && <div style={s.atencao}>🧴 Repor: {b.materiais.join(", ")}</div>}
          {b.pendencias > 0 && <div style={s.linha}>📋 {b.pendencias} de outros dias esperando</div>}
        </div>
      )}

      <div style={s.acoes}>
        <button style={s.botaoFala} onClick={() => setAberto(!aberto)}>
          {aberto ? "Fechar conversa" : "💬 Falar com o apoio"}
        </button>
        <button style={s.botaoSec} onClick={puxarMais}>+ Puxar mais</button>
        <button style={s.botaoSec} onClick={fecharDia}>Encerrar dia</button>
      </div>

      {aberto && (
        <div style={s.chat}>
          <div style={s.mensagens}>
            {msgs.length === 0 && (
              <p style={s.dica}>Me conta como está indo, ou toque num atalho abaixo.</p>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ textAlign: m.papel === "ajudante" ? "right" : "left", marginBottom: 8 }}>
                <span style={m.papel === "ajudante" ? s.balaoMinha : s.balaoDele}>{m.texto}</span>
              </div>
            ))}
            {pensando && <p style={s.dica}>…</p>}
            <div ref={fim} />
          </div>

          <div style={s.atalhos}>
            {atalhos.map((a) => (
              <button key={a} style={s.atalho} onClick={() => enviar(a)}>{a}</button>
            ))}
          </div>

          <textarea
            style={s.input}
            value={entrada}
            onChange={(e) => {
              setEntrada(e.target.value);
              // cresce conforme a pessoa escreve, até um limite confortável
              const el = e.target;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 220) + "px";
            }}
            rows={3}
            placeholder="Escreva aqui o que aconteceu…"
          />
          <button style={s.enviar} onClick={() => enviar()} disabled={pensando || !entrada.trim()}>
            {pensando ? "Enviando…" : "Enviar recado"}
          </button>
        </div>
      )}
    </div>
  );
}

const TEAL = "#0f766e";
const s: Record<string, React.CSSProperties> = {
  wrap: { marginBottom: 16 },
  briefing: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, marginBottom: 10 },
  saudacao: { fontSize: 20, fontWeight: 800, color: "#0f172a" },
  meta: { fontSize: 16, color: TEAL, fontWeight: 600, margin: "4px 0 8px" },
  linha: { fontSize: 14, color: "#475569", marginTop: 4 },
  atencao: { fontSize: 14, color: "#92400e", background: "#fef3c7", borderRadius: 8, padding: "8px 10px", marginTop: 6 },
  acoes: { display: "flex", gap: 8, flexWrap: "wrap" },
  botaoFala: { flex: 1, minWidth: 150, padding: 14, background: TEAL, color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer" },
  botaoSec: { padding: "14px 16px", background: "#fff", color: "#0f172a", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  chat: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, marginTop: 10 },
  mensagens: { maxHeight: 260, overflowY: "auto", marginBottom: 10 },
  dica: { fontSize: 15, color: "#475569", margin: "6px 0" },
  balaoMinha: { display: "inline-block", maxWidth: "85%", background: TEAL, color: "#fff", padding: "10px 14px", borderRadius: 14, fontSize: 15, textAlign: "left" },
  balaoDele: { display: "inline-block", maxWidth: "85%", background: "#e2e8f0", color: "#0f172a", padding: "10px 14px", borderRadius: 14, fontSize: 15, textAlign: "left" },
  atalhos: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 },
  atalho: { minHeight: 52, padding: "14px 18px", background: "#f1f5f9", border: "2px solid #e7e0cf", borderRadius: 999, fontSize: 16, fontWeight: 600, cursor: "pointer", color: "#0f172a" },
  input: { width: "100%", padding: 16, fontSize: 18, borderRadius: 12, border: "2px solid #e7e0cf",
           boxSizing: "border-box", minHeight: 96, resize: "vertical", fontFamily: "inherit",
           lineHeight: 1.5, color: "#0f172a" },
  enviar: { width: "100%", minHeight: 60, padding: "18px 20px", background: TEAL, color: "#fff",
            border: "none", borderRadius: 14, fontSize: 18, fontWeight: 700, cursor: "pointer",
            marginTop: 10 },
};
