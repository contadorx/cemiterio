"use client";

import { useEffect, useState } from "react";
import { PainelNav, painel, cor } from "../ui";

interface Rascunho {
  id: string;
  assunto: string;
  rascunho: string;
  cliente: string;
  quando: string;
}

export default function Atendimento() {
  const [itens, setItens] = useState<Rascunho[]>([]);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function carregar() {
    const r = await fetch("/api/rascunhos").then((x) => x.json());
    if (r.ok) setItens(r.rascunhos);
  }
  useEffect(() => {
    carregar();
  }, []);

  async function agir(id: string, acao: "aprovou" | "editou" | "descartou") {
    setOcupado(id);
    await fetch("/api/atendimento/aprovar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interacaoId: id, acao, textoFinal: acao === "editou" ? edit[id] : undefined }),
    });
    setOcupado(null);
    carregar();
  }

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/atendimento" />
      <div style={painel.conteudo}>
        <h1 style={painel.h1}>Atendimento — rascunhos da IA</h1>

        {itens.length === 0 && <p style={{ color: cor.cinza }}>Nenhum rascunho aguardando. 🌿</p>}

        {itens.map((it) => (
          <div key={it.id} style={painel.card}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <strong style={{ color: cor.navy }}>{it.cliente}</strong>
              <span style={{ fontSize: 12, color: cor.cinza, textTransform: "uppercase" }}>{it.assunto}</span>
            </div>
            <textarea
              style={{ ...painel.input, minHeight: 90, resize: "vertical", fontFamily: "inherit" }}
              defaultValue={it.rascunho}
              onChange={(e) => setEdit({ ...edit, [it.id]: e.target.value })}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button style={painel.botao} disabled={ocupado === it.id} onClick={() => agir(it.id, "aprovou")}>
                Aprovar e enviar
              </button>
              <button
                style={painel.botaoSec}
                disabled={ocupado === it.id}
                onClick={() => agir(it.id, "editou")}
              >
                Enviar editado
              </button>
              <button style={painel.botaoPerigo} disabled={ocupado === it.id} onClick={() => agir(it.id, "descartou")}>
                Descartar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
