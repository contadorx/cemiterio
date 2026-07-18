"use client";

import { useEffect, useState } from "react";
import { PainelNav, painel, cor } from "../ui";

interface Cand {
  planoId: string;
  clienteId: string;
  cliente: string;
  telefone: string;
  cadencia: string;
  valorAtual: number;
  valorSugerido: number;
  mesesSemReajuste: number;
  ipcaAcumuladoPct: number;
  bomPagador: boolean;
  temperatura: number;
  faixa: "fria" | "morna" | "quente";
}

const CORES: Record<string, string> = { quente: "#dc2626", morna: "#d97706", fria: "#0f766e" };

export default function Reajustes() {
  const [itens, setItens] = useState<Cand[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [valores, setValores] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [flash, setFlash] = useState("");

  async function carregar() {
    const r = await fetch("/api/reajuste/candidatos").then((x) => x.json());
    if (r.ok) {
      setItens(r.candidatos);
      const v: Record<string, number> = {};
      r.candidatos.forEach((c: Cand) => (v[c.planoId] = c.valorSugerido));
      setValores(v);
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  async function gerarMensagem(c: Cand) {
    setOcupado(c.planoId);
    const r = await fetch("/api/reajuste/mensagem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planoId: c.planoId, valorNovo: valores[c.planoId] }),
    }).then((x) => x.json());
    setOcupado(null);
    if (r.ok) {
      setMsg({ ...msg, [c.planoId]: r.mensagem });
      setAberto(c.planoId);
    }
  }

  async function enviar(c: Cand) {
    setOcupado(c.planoId);
    await fetch("/api/reajuste/aplicar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "enviar", clienteId: c.clienteId, texto: msg[c.planoId] }),
    });
    setOcupado(null);
    setFlash("Mensagem enviada. Aplique o novo valor quando o cliente aceitar.");
    setTimeout(() => setFlash(""), 4000);
  }

  async function aplicar(c: Cand) {
    if (!confirm(`Aplicar R$ ${valores[c.planoId].toFixed(2)} para ${c.cliente}?`)) return;
    setOcupado(c.planoId);
    await fetch("/api/reajuste/aplicar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "aplicar", planoId: c.planoId, valorNovo: valores[c.planoId] }),
    });
    setOcupado(null);
    carregar();
    setFlash("Novo valor aplicado.");
    setTimeout(() => setFlash(""), 3000);
  }

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/reajustes" />
      <div style={painel.conteudo}>
        <h1 style={painel.h1}>Reajustes — temperatura de aumento</h1>
        {flash && <div style={{ ...painel.card, background: "#ecfdf5", color: "#065f46" }}>{flash}</div>}
        {itens.length === 0 && <p style={{ color: cor.cinza }}>Nenhum preço defasado no momento.</p>}

        {itens.map((c) => (
          <div key={c.planoId} style={painel.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <strong style={{ color: cor.navy }}>{c.cliente}</strong>
                <div style={{ fontSize: 13, color: cor.cinza }}>
                  {c.mesesSemReajuste} meses sem reajuste · IPCA estimado +{c.ipcaAcumuladoPct}% ·{" "}
                  {c.bomPagador ? "bom pagador" : "⚠ com pendência"}
                </div>
              </div>
              <span style={{ background: CORES[c.faixa], color: "#fff", padding: "4px 12px", borderRadius: 999, fontWeight: 700, fontSize: 13 }}>
                {c.faixa} · {c.temperatura}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
              <span style={{ color: cor.cinza }}>
                de <b style={{ textDecoration: "line-through" }}>R$ {c.valorAtual.toFixed(2)}</b> para
              </span>
              <input
                type="number"
                style={{ ...painel.input, width: 110 }}
                value={valores[c.planoId] ?? c.valorSugerido}
                onChange={(e) => setValores({ ...valores, [c.planoId]: Number(e.target.value) })}
              />
              <button style={painel.botaoSec} disabled={ocupado === c.planoId} onClick={() => gerarMensagem(c)}>
                {ocupado === c.planoId ? "…" : "Gerar mensagem"}
              </button>
              <button style={painel.botao} disabled={ocupado === c.planoId} onClick={() => aplicar(c)}>
                Aplicar novo valor
              </button>
            </div>

            {aberto === c.planoId && (
              <div style={{ marginTop: 12 }}>
                <label style={painel.rotulo}>Mensagem de reajuste (revise antes de enviar)</label>
                <textarea
                  style={{ ...painel.input, minHeight: 120, resize: "vertical", fontFamily: "inherit" }}
                  value={msg[c.planoId] || ""}
                  onChange={(e) => setMsg({ ...msg, [c.planoId]: e.target.value })}
                />
                <button style={{ ...painel.botao, marginTop: 8 }} disabled={ocupado === c.planoId} onClick={() => enviar(c)}>
                  Enviar no WhatsApp
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
