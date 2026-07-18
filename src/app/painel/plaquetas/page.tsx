"use client";

import { useCallback, useEffect, useState } from "react";
import { PainelNav, painel, cor } from "../ui";
import { MARCA } from "@/lib/marca";

export default function Plaquetas() {
  const [itens, setItens] = useState<any[]>([]);
  const [semPortal, setSemPortal] = useState(0);
  const [quadras, setQuadras] = useState<any[]>([]);
  const [f, setF] = useState({ quadra: "", rua: "", busca: "", incluirTeste: false });
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">("carregando");
  const [gerando, setGerando] = useState(false);

  const carregar = useCallback(async () => {
    setEstado("carregando");
    const p = new URLSearchParams({ origem: window.location.origin });
    if (f.quadra) p.set("quadra", f.quadra);
    if (f.rua) p.set("rua", f.rua);
    if (f.busca) p.set("busca", f.busca);
    if (f.incluirTeste) p.set("incluirTeste", "1");
    const r = await fetch(`/api/plaquetas?${p}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setItens(r.plaquetas); setSemPortal(r.semPortal); setEstado("ok"); }
    else setEstado("erro");
  }, [f]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    fetch("/api/quadras").then((x) => x.json()).then((r) => r.ok && setQuadras(r.quadras)).catch(() => {});
  }, []);

  async function gerarEmLote() {
    const escopo = f.quadra ? "quadra" : "todos";
    const alvo = f.quadra
      ? `os jazigos da quadra selecionada`
      : `todos os ${semPortal} jazigos sem portal`;
    if (!confirm(`Gerar o link do portal para ${alvo}? Cada jazigo ganha um QR próprio.`)) return;
    setGerando(true);
    const r = await fetch("/api/plaquetas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ escopo, quadraId: f.quadra || undefined }),
    }).then((x) => x.json()).catch(() => null);
    setGerando(false);
    if (r?.ok) { alert(`${r.gerados} portal(is) gerado(s).`); carregar(); }
    else alert("Falhou ao gerar.");
  }

  const ruas = [...new Set(itens.map((i) => i.rua).filter(Boolean))].sort();

  return (
    <div style={painel.wrap}>
      <div className="naoImprimir">
        <PainelNav atual="/painel/plaquetas" />
      </div>
      <div style={painel.conteudo}>
        <div className="naoImprimir">
          <h1 style={painel.h1}>Plaquetas QR</h1>

          {semPortal > 0 && (
            <div style={{ ...painel.card, borderLeft: "4px solid #d97706", background: "#fffbeb" }}>
              <strong style={{ color: "#92400e" }}>
                {semPortal} jazigo(s) ainda sem portal
              </strong>
              <p style={{ color: "#78350f", fontSize: 14, margin: "6px 0 10px" }}>
                A plaqueta só existe depois que o jazigo tem um link de portal. Gere em lote
                — pode fazer por quadra, para imprimir e colar uma rua por vez.
              </p>
              <button style={painel.botao} onClick={gerarEmLote} disabled={gerando}>
                {gerando ? "Gerando…" : f.quadra ? "Gerar para esta quadra" : "Gerar para todos"}
              </button>
            </div>
          )}

          <div style={{ ...painel.card, padding: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select style={{ ...painel.input, width: "auto" }} value={f.quadra}
                      onChange={(e) => setF({ ...f, quadra: e.target.value, rua: "" })}>
                <option value="">Todas as quadras</option>
                {quadras.map((q) => <option key={q.id} value={q.id}>{q.codigo}</option>)}
              </select>
              <select style={{ ...painel.input, width: "auto" }} value={f.rua}
                      onChange={(e) => setF({ ...f, rua: e.target.value })}>
                <option value="">Todas as ruas</option>
                {ruas.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <input style={{ ...painel.input, flex: 1, minWidth: 160 }} value={f.busca}
                     onChange={(e) => setF({ ...f, busca: e.target.value })}
                     placeholder="Buscar família ou jazigo…" />
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: cor.cinza }}>
                <input type="checkbox" checked={f.incluirTeste}
                       onChange={(e) => setF({ ...f, incluirTeste: e.target.checked })} />
                mostrar dados de teste
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
              <button style={painel.botao} onClick={() => window.print()}>
                Imprimir {itens.length} plaqueta(s)
              </button>
              <span style={{ color: cor.cinza, fontSize: 13 }}>
                Imprima em papel adesivo e proteja, ou leve a uma gráfica para fazer em alumínio.
              </span>
            </div>
          </div>
        </div>

        {estado === "carregando" && <p style={{ color: cor.cinza }}>Gerando QR codes…</p>}
        {estado === "ok" && itens.length === 0 && (
          <p style={{ color: cor.cinza }}>
            Nenhuma plaqueta com esses filtros. {semPortal > 0 && "Gere os portais acima primeiro."}
          </p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 16 }}>
          {itens.map((p) => (
            <div key={p.id} style={etiqueta}>
              <div style={{ fontSize: 11, letterSpacing: 1, color: "#c6a15b", textTransform: "uppercase" }}>
                {MARCA.nome}
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.qr} alt="QR" style={{ width: 150, height: 150, margin: "8px 0" }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: "#12284b" }}>
                {p.falecido || p.identificacao}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {p.quadra}{p.rua ? ` · ${p.rua}` : ""}
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
                Aponte a câmera para ver os cuidados
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`@media print {
        .naoImprimir { display: none !important; }
        body { background: #fff !important; }
      }`}</style>
    </div>
  );
}

const etiqueta: React.CSSProperties = {
  border: "1px solid #e7e0cf",
  borderRadius: 10,
  padding: 14,
  textAlign: "center",
  background: "#fff",
  breakInside: "avoid",
};
