"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PainelNav, painel, cor } from "../ui";

interface Conversa {
  id: string;
  tipo?: string;
  fixada?: boolean;
  cliente: string;
  telefone: string;
  assunto: string | null;
  escalada: boolean;
  resolvida: boolean;
  arquivada: boolean;
  atualizada: string;
  rascunhoPendente: boolean;
  ultima: { texto: string; autor: string } | null;
}

const ASSUNTOS: Record<string, string> = {
  cobranca: "💰 Cobrança",
  agendamento: "📅 Agendamento",
  duvida: "❓ Dúvida",
  luto: "🕊 Luto",
  reclamacao: "⚠️ Reclamação",
  outro: "• Outro",
};

export default function Conversas() {
  const [lista, setLista] = useState<Conversa[]>([]);
  const [cont, setCont] = useState({ pendentes: 0, escaladas: 0, arquivadas: 0 });
  const [carregando, setCarregando] = useState(true);
  const [f, setF] = useState({ situacao: "pendentes", assunto: "", busca: "", de: "", ate: "" });
  const [maisFiltros, setMaisFiltros] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => v && p.set(k, String(v)));
    const r = await fetch(`/api/conversas?${p}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setLista(r.conversas); setCont(r.contadores); }
    setCarregando(false);
  }, [f]);

  useEffect(() => { carregar(); }, [carregar]);

  async function acao(id: string, acao: string, confirmar?: string) {
    if (confirmar && !confirm(confirmar)) return;
    const r = await fetch(`/api/conversas/${id}/acao`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) carregar();
    else alert("Falhou: " + (r?.erro || "erro"));
  }

  const abas: [string, string, number | null][] = [
    ["pendentes", "Precisam de você", cont.pendentes],
    ["escaladas", "Escaladas", cont.escaladas],
    ["resolvidas", "Resolvidas", null],
    ["todas", "Todas", null],
    ["arquivadas", "Arquivadas", cont.arquivadas],
  ];

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/conversas" />
      <div style={painel.conteudo}>
        <h1 style={painel.h1}>Conversas</h1>

        {/* situação */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {abas.map(([v, rot, n]) => (
            <button key={v}
              style={f.situacao === v ? painel.botao : painel.botaoSec}
              onClick={() => setF({ ...f, situacao: v })}>
              {rot}{n ? ` (${n})` : ""}
            </button>
          ))}
        </div>

        {/* busca + assunto */}
        <div style={{ ...painel.card, padding: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              style={{ ...painel.input, flex: 1, minWidth: 180 }}
              value={f.busca}
              onChange={(e) => setF({ ...f, busca: e.target.value })}
              placeholder="Buscar por nome ou telefone…"
            />
            <select style={{ ...painel.input, width: "auto" }} value={f.assunto}
                    onChange={(e) => setF({ ...f, assunto: e.target.value })}>
              <option value="">Todos os assuntos</option>
              {Object.entries(ASSUNTOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button style={painel.botaoSec} onClick={() => setMaisFiltros(!maisFiltros)}>
              {maisFiltros ? "− período" : "+ período"}
            </button>
          </div>

          {maisFiltros && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "flex-end" }}>
              <div>
                <label style={painel.rotulo}>De</label>
                <input type="date" style={{ ...painel.input, width: 160 }} value={f.de}
                       onChange={(e) => setF({ ...f, de: e.target.value })} />
              </div>
              <div>
                <label style={painel.rotulo}>Até</label>
                <input type="date" style={{ ...painel.input, width: 160 }} value={f.ate}
                       onChange={(e) => setF({ ...f, ate: e.target.value })} />
              </div>
              <button style={painel.botaoSec}
                      onClick={() => setF({ situacao: f.situacao, assunto: "", busca: "", de: "", ate: "" })}>
                Limpar filtros
              </button>
            </div>
          )}
        </div>

        {carregando && <p style={{ color: cor.cinza }}>Carregando…</p>}
        {!carregando && lista.length === 0 && (
          <div style={painel.card}>
            <p style={{ color: cor.cinza, margin: 0 }}>
              {f.situacao === "pendentes"
                ? "Nada pendente. Tudo que precisava de você já foi resolvido. 🌿"
                : "Nenhuma conversa com esses filtros."}
            </p>
          </div>
        )}

        {lista.map((c) => (
          <div key={c.id} style={{ ...painel.card,
            background: c.tipo === "equipe" ? "#f0fdfa" : "#fff",
            borderLeft: c.tipo === "equipe" ? `4px solid ${cor.teal}`
              : c.rascunhoPendente ? "4px solid #d97706"
              : c.escalada ? "4px solid #dc2626" : `1px solid ${cor.linha}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <Link href={`/painel/conversas/${c.id}`} style={{ textDecoration: "none" }}>
                  <strong style={{ color: cor.navy, fontSize: 16 }}>
                    {c.tipo === "equipe" && "📌 "}{c.cliente}
                  </strong>
                </Link>
                <div style={{ fontSize: 13, color: cor.cinza, marginTop: 2 }}>
                  {c.tipo === "equipe" ? "Recados de quem está no campo"
                    : c.assunto ? ASSUNTOS[c.assunto] || c.assunto : "sem assunto"}
                  {" · "}
                  {new Date(c.atualizada).toLocaleDateString("pt-BR")}
                  {c.rascunhoPendente && <span style={{ color: "#d97706" }}> · rascunho a aprovar</span>}
                  {c.escalada && <span style={{ color: "#dc2626" }}> · escalada</span>}
                  {c.resolvida && !c.arquivada && <span style={{ color: cor.teal }}> · resolvida</span>}
                </div>
                {c.ultima && (
                  <p style={{ color: cor.cinza, fontSize: 14, margin: "6px 0 0" }}>
                    <b>{c.ultima.autor === "cliente" ? "Cliente" : "Nós"}:</b>{" "}
                    {c.ultima.texto.slice(0, 110)}{c.ultima.texto.length > 110 ? "…" : ""}
                  </p>
                )}
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
                <Link href={`/painel/conversas/${c.id}`}
                      style={{ ...painel.botaoSec, textDecoration: "none", padding: "8px 12px" }}>
                  Abrir
                </Link>
                {c.tipo !== "equipe" && !c.arquivada && !c.resolvida && (
                  <button style={{ ...painel.botaoSec, padding: "8px 12px" }}
                          onClick={() => acao(c.id, "resolver")}>Resolver</button>
                )}
                {c.tipo !== "equipe" && !c.arquivada && (
                  <button style={{ ...painel.botaoSec, padding: "8px 12px" }}
                          onClick={() => acao(c.id, "arquivar")}>Arquivar</button>
                )}
                {c.arquivada && (
                  <button style={{ ...painel.botaoSec, padding: "8px 12px" }}
                          onClick={() => acao(c.id, "desarquivar")}>Reabrir</button>
                )}
                {c.tipo !== "equipe" && <button style={{ ...painel.botaoPerigo, padding: "8px 12px" }}
                        onClick={() => acao(c.id, "excluir",
                          `Excluir a conversa com ${c.cliente}? As mensagens serão apagadas. O histórico financeiro não é afetado.`)}>
                  Excluir
                </button>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
