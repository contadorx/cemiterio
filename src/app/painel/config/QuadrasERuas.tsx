"use client";

import { useCallback, useEffect, useState } from "react";
import { painel, cor } from "../ui";
import { useRecado } from "@/components/Dialogos";

/**
 * AS QUADRAS E AS RUAS DE UM CEMITÉRIO.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO NÃO EXISTIA
 * ---------------------------------------------------------------------------
 * As 4 quadras e 44 ruas do Cemitério da Saudade nasceram de uma migration.
 * Nunca fez falta uma tela: só havia um cemitério, e ele já veio pronto.
 *
 * Com o Santa Lídia (cadastrado em 23/08, com ZERO quadras) isso trava tudo. A
 * rota de cadastro de jazigo exige que a quadra exista e responde "Escolha a
 * quadra na lista" — com a lista vazia. Não há por onde começar.
 *
 * ---------------------------------------------------------------------------
 * A ORDEM É A DA CAMINHADA
 * ---------------------------------------------------------------------------
 * Quadra e rua não são etiqueta: é delas que sai o roteiro do dia. Cadastre na
 * ordem em que você anda o cemitério — a primeira quadra que você vê é a Q1, a
 * primeira rua dela é a RUA 1. A ordem se corrige sozinha depois, com o que a
 * Nina de fato caminha (0126), mas começar na ordem certa poupa esse ajuste.
 *
 * O NOME É NORMALIZADO ANTES DE GRAVAR. "QD 1", "Q1", "Qd 1", "Q01" e
 * "Quadra 1" viram todos Q1 — foi a digitação livre que transformou quatro
 * quadras em treze, e o roteiro do dia se perdia no meio.
 */

type Quadra = { id: string; codigo: string; ordem: number };
type Rua = { id: string; nome: string; tipo: string; ordem: number };

export default function QuadrasERuas({ cemiterioId, cemiterio }: {
  cemiterioId: string; cemiterio: string;
}) {
  const recado = useRecado();
  const [quadras, setQuadras] = useState<Quadra[] | null>(null);
  const [ruas, setRuas] = useState<Record<string, Rua[]>>({});
  const [aberta, setAberta] = useState<string | null>(null);
  const [novaQuadra, setNovaQuadra] = useState("");
  const [novaRua, setNovaRua] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/quadras").then((x) => x.json()).catch(() => null);
    if (!r?.ok) { setQuadras(null); return; }
    // A rota devolve as quadras de todos os cemitérios; aqui só as deste.
    // Filtrar no servidor exigiria um parâmetro novo numa rota que outras
    // cinco telas já usam — e mexer nela para isto seria mudar o que funciona.
    const todas = (r.quadras || []) as any[];
    setQuadras(todas.filter((q) => q.cemiterio_id === cemiterioId || q.cemiterioId === cemiterioId)
                    .map((q) => ({ id: q.id, codigo: q.codigo, ordem: q.ordem })));
  }, [cemiterioId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function carregarRuas(quadraId: string) {
    const r = await fetch(`/api/ruas?quadraId=${encodeURIComponent(quadraId)}`)
      .then((x) => x.json()).catch(() => null);
    setRuas((x) => ({ ...x, [quadraId]: r?.ok ? (r.ruas || []) : [] }));
  }

  async function criarQuadra() {
    const codigo = novaQuadra.trim();
    if (!codigo || ocupado) return;
    setOcupado(true);
    try {
      const r = await fetch("/api/quadras", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cemiterioId, codigo }),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { recado.erro(r?.mensagem || r?.erro || "Não consegui criar."); return; }
      recado.ok(`Quadra ${r.quadra.codigo} criada`);
      setNovaQuadra("");
      await carregar();
      // Abre a quadra nova já: a próxima coisa a fazer é cadastrar as ruas
      // dela, e sem rua o jazigo fica fora do roteiro.
      setAberta(r.quadra.id);
      carregarRuas(r.quadra.id);
    } finally { setOcupado(false); }
  }

  async function criarRua(quadraId: string) {
    const nome = novaRua.trim();
    if (!nome || ocupado) return;
    setOcupado(true);
    try {
      const r = await fetch("/api/ruas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quadraId, nome }),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { recado.erro(r?.mensagem || r?.erro || "Não consegui criar."); return; }
      recado.ok(`${r.rua.nome} criada`);
      setNovaRua("");
      carregarRuas(quadraId);
      carregar();
    } finally { setOcupado(false); }
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${cor.linha}` }}>
      <div style={painel.rotulo}>
        Quadras e ruas
        {quadras !== null && quadras.length === 0 && (
          <b style={{ color: "rgb(var(--zm-aviso))" }}> · nenhuma ainda</b>
        )}
      </div>

      {quadras !== null && quadras.length === 0 && (
        <p style={{ fontSize: 14, color: cor.cinza, margin: "0 0 10px", lineHeight: 1.55 }}>
          <b>Sem quadra não dá para cadastrar jazigo aqui</b> — a tela de cadastro pede que
          você escolha a quadra numa lista, e a lista está vazia. Comece pela primeira quadra
          que você vê ao entrar no {cemiterio.split("—")[0].trim()}, e depois pelas ruas dela.
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input style={{ ...painel.input, margin: 0, maxWidth: 200 }}
               value={novaQuadra} onChange={(e) => setNovaQuadra(e.target.value)}
               onKeyDown={(e) => e.key === "Enter" && criarQuadra()}
               placeholder="Q1" />
        <button style={painel.botaoSec} disabled={ocupado || !novaQuadra.trim()}
                onClick={criarQuadra}>
          Criar quadra
        </button>
      </div>

      {(quadras || []).map((q) => (
        <div key={q.id} style={{
          border: `1px solid ${cor.linha}`, borderRadius: 10, padding: "8px 10px", marginBottom: 8,
        }}>
          <button style={{ ...painel.botaoMiniSec, width: "100%", textAlign: "left" }}
                  onClick={() => {
                    const abrir = aberta === q.id ? null : q.id;
                    setAberta(abrir);
                    setNovaRua("");
                    if (abrir && !ruas[q.id]) carregarRuas(q.id);
                  }}>
            <b>{q.codigo}</b>
            <span style={{ color: cor.cinza }}>
              {" "}· {ruas[q.id] ? `${ruas[q.id].length} rua(s)` : "ver ruas"}
            </span>
          </button>

          {aberta === q.id && (
            <div style={{ marginTop: 8, paddingLeft: 4 }}>
              {(ruas[q.id] || []).length === 0 && (
                <p style={{ fontSize: 13.5, color: "rgb(var(--zm-aviso))", margin: "0 0 8px",
                            lineHeight: 1.5 }}>
                  Sem rua, o jazigo fica de fora do roteiro — e a Nina só descobre andando.
                </p>
              )}
              {(ruas[q.id] || []).map((r) => (
                <div key={r.id} style={{ fontSize: 14, padding: "3px 0" }}>
                  {r.nome}
                  {r.tipo !== "rua" && <span style={{ color: cor.cinza }}> · {r.tipo}</span>}
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <input style={{ ...painel.input, margin: 0, maxWidth: 200 }}
                       value={novaRua} onChange={(e) => setNovaRua(e.target.value)}
                       onKeyDown={(e) => e.key === "Enter" && criarRua(q.id)}
                       placeholder="RUA 1" />
                <button style={painel.botaoMiniSec} disabled={ocupado || !novaRua.trim()}
                        onClick={() => criarRua(q.id)}>
                  Criar rua
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      <p style={{ fontSize: 13, color: cor.cinza, margin: "6px 0 0", lineHeight: 1.5 }}>
        Cadastre na ordem em que você anda o cemitério — é dela que sai o roteiro do dia.
        “QD 1”, “Q01” e “Quadra 1” viram todos <b>Q1</b>: foi digitação livre que já
        transformou quatro quadras em treze aqui.
      </p>
    </div>
  );
}
