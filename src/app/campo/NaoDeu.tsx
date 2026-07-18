"use client";

import { useState } from "react";

/**
 * "Não deu para fazer" — sem julgamento, com o motivo.
 * O jazigo volta para a fila com prioridade alta e o motivo vira ocorrência,
 * para o dono enxergar o padrão (chuva, água, acesso, não achou).
 */
export default function NaoDeu({ it, onFechar, onPronto }: {
  it: any; onFechar: () => void; onPronto: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [outro, setOutro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const motivos = [
    "Começou a chover",
    "Acabou a água",
    "Faltou material",
    "Não achei o jazigo",
    "O acesso estava fechado",
    "Não deu tempo hoje",
    "Não estava passando bem",
  ];

  async function enviar() {
    const texto = (motivo === "Outro" ? outro : motivo).trim();
    if (!texto) return alert("Me conta rapidinho o que houve.");
    setEnviando(true);
    const r = await fetch("/api/campo/nao-feito", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servicoId: it.id, motivo: texto }),
    }).then((x) => x.json()).catch(() => null);
    setEnviando(false);
    if (r?.ok) onPronto();
    else alert("Não consegui registrar agora. Tente de novo.");
  }

  return (
    <div style={s.overlay}>
      <div style={s.caixa}>
        <div style={s.topo}>
          <strong style={{ fontSize: 18 }}>Não deu para fazer hoje</strong>
          <button style={s.fechar} onClick={onFechar}>✕</button>
        </div>
        <p style={s.nome}>{it.falecido || it.tumulo}</p>
        <p style={s.dica}>
          Sem problema. Me conta o que houve que eu deixo para amanhã, no começo da lista.
        </p>

        {(motivos || []).map((m) => (
          <button key={m}
            style={{ ...s.opcao, ...(motivo === m ? s.opcaoMarcada : {}) }}
            onClick={() => setMotivo(m)}>
            {m}
          </button>
        ))}
        <button style={{ ...s.opcao, ...(motivo === "Outro" ? s.opcaoMarcada : {}) }}
                onClick={() => setMotivo("Outro")}>
          Outro motivo
        </button>

        {motivo === "Outro" && (
          <textarea style={s.input} value={outro} onChange={(e) => setOutro(e.target.value)}
                    placeholder="O que aconteceu?" />
        )}

        <button style={s.botao} onClick={enviar} disabled={enviando || !motivo}>
          {enviando ? "Registrando…" : "Deixar para amanhã"}
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 },
  caixa: { background: "#fff", width: "100%", maxWidth: 520, borderRadius: "16px 16px 0 0", padding: 18, maxHeight: "92vh", overflowY: "auto" },
  topo: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  fechar: { background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#475569" },
  nome: { fontSize: 18, fontWeight: 700, color: "#12284b", margin: "4px 0 6px" },
  dica: { color: "#475569", fontSize: 18, margin: "0 0 14px" },
  opcao: { width: "100%", minHeight: 60, padding: 18, background: "#fff", color: "#0f172a", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 18, textAlign: "left", cursor: "pointer", marginBottom: 8 },
  opcaoMarcada: { background: "#fffbeb", borderColor: "#fde68a", fontWeight: 600 },
  input: { width: "100%", padding: 12, fontSize: 18, borderRadius: 10, border: "1px solid #e2e8f0", boxSizing: "border-box", minHeight: 70, fontFamily: "inherit", marginBottom: 10 },
  botao: { width: "100%", minHeight: 60, padding: 18, background: "#0f766e", color: "#fff", border: "none", borderRadius: 14, fontSize: 18, fontWeight: 700, cursor: "pointer", marginTop: 6 },
};
