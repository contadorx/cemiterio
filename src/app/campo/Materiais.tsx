"use client";

import { useEffect, useState } from "react";

interface Mat {
  id: string;
  nome: string;
  unidade: string;
  estoque: number;
  alerta_minimo: number;
}

/** Pedido de material pela ajudante: marca o que acabou e avisa o dono. */
export default function Materiais({ onFechar }: { onFechar: () => void }) {
  const [itens, setItens] = useState<Mat[]>([]);
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [outro, setOutro] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    fetch("/api/config/materiais")
      .then((x) => x.json())
      .then((r) => r.ok && setItens(r.materiais))
      .catch(() => {});
  }, []);

  async function enviar() {
    const lista = itens.filter((i) => marcados[i.id]).map((i) => ({ id: i.id, nome: i.nome, acabou: true }));
    if (outro.trim()) lista.push({ id: undefined as any, nome: outro.trim(), acabou: true });
    if (!lista.length && !obs.trim()) return;

    setEnviando(true);
    const r = await fetch("/api/campo/pedido-material", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens: lista, observacao: obs }),
    }).then((x) => x.json()).catch(() => null);
    setEnviando(false);
    if (r?.ok) setPronto(true);
    else alert("Não consegui enviar agora. Tente de novo.");
  }

  if (pronto) {
    return (
      <div style={s.overlay}>
        <div style={s.caixa}>
          <div style={{ fontSize: 40, textAlign: "center" }}>✓</div>
          <p style={s.ok}>Pedido enviado! A Sureya já foi avisada do que está faltando.</p>
          <button style={s.botao} onClick={onFechar}>Fechar</button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.overlay}>
      <div style={s.caixa}>
        <div style={s.topo}>
          <strong style={{ fontSize: 18 }}>O que está faltando?</strong>
          <button style={s.fechar} onClick={onFechar}>✕</button>
        </div>
        <p style={s.dica}>Marque o que acabou ou está no fim. A Sureya recebe o aviso na hora.</p>

        <div style={s.lista}>
          {itens.length === 0 && <p style={s.dica}>Nenhum material cadastrado ainda — use o campo abaixo.</p>}
          {itens.map((i) => {
            const baixo = Number(i.estoque) <= Number(i.alerta_minimo);
            return (
              <label key={i.id} style={{ ...s.item, ...(marcados[i.id] ? s.itemMarcado : {}) }}>
                <input
                  type="checkbox"
                  checked={!!marcados[i.id]}
                  onChange={(e) => setMarcados({ ...marcados, [i.id]: e.target.checked })}
                  style={{ width: 22, height: 22 }}
                />
                <span style={{ flex: 1, textTransform: "capitalize" }}>{i.nome}</span>
                <span style={{ fontSize: 13, color: baixo ? "#dc2626" : "#64748b" }}>
                  {baixo ? "já está baixo" : `${i.estoque} ${i.unidade}`}
                </span>
              </label>
            );
          })}
        </div>

        <input
          style={s.input}
          value={outro}
          onChange={(e) => setOutro(e.target.value)}
          placeholder="Outro item que não está na lista"
        />
        <textarea
          style={{ ...s.input, minHeight: 60, resize: "vertical" }}
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Quer dizer mais alguma coisa? (opcional)"
        />

        <button style={s.botao} onClick={enviar} disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar pedido"}
        </button>
      </div>
    </div>
  );
}

const TEAL = "#0f766e";
const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 },
  caixa: { background: "#fff", width: "100%", maxWidth: 520, borderRadius: "16px 16px 0 0", padding: 18, maxHeight: "92vh", overflowY: "auto" },
  topo: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  fechar: { background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#64748b" },
  dica: { color: "#64748b", fontSize: 14, margin: "4px 0 12px" },
  lista: { marginBottom: 12 },
  item: { display: "flex", alignItems: "center", gap: 12, padding: "14px 12px", border: "1px solid #e2e8f0", borderRadius: 12, marginBottom: 8, fontSize: 16, cursor: "pointer" },
  itemMarcado: { background: "#fef3c7", borderColor: "#fde68a" },
  input: { width: "100%", padding: 12, fontSize: 16, borderRadius: 10, border: "1px solid #e2e8f0", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" },
  botao: { width: "100%", padding: 15, background: TEAL, color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer" },
  ok: { textAlign: "center", fontSize: 16, color: "#0f172a", margin: "10px 0 18px" },
};
