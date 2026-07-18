"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { PainelNav, painel, cor } from "../../ui";

export default function Thread() {
  const params = useParams();
  const id = params?.id as string;
  const [d, setD] = useState<any>(null);
  const [texto, setTexto] = useState("");
  const [rascText, setRascText] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  async function carregar() {
    const r = await fetch(`/api/conversas/${id}`).then((x) => x.json());
    if (r.ok) {
      setD(r);
      setRascText(r.rascunho?.rascunho || "");
    }
  }
  useEffect(() => {
    if (id) carregar();
  }, [id]);
  useEffect(() => {
    fim.current?.scrollIntoView();
  }, [d]);

  async function enviar() {
    if (!texto.trim()) return;
    setOcupado(true);
    await fetch(`/api/conversas/${id}/enviar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
    setTexto("");
    setOcupado(false);
    carregar();
  }

  async function agirRascunho(acao: "aprovou" | "editou" | "descartou") {
    setOcupado(true);
    await fetch("/api/atendimento/aprovar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interacaoId: d.rascunho.id, acao, textoFinal: acao === "editou" ? rascText : undefined }),
    });
    setOcupado(false);
    carregar();
  }

  async function alternarIa() {
    setOcupado(true);
    await fetch(`/api/conversas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ escalada_humano: !d.conversa.escalada }),
    });
    setOcupado(false);
    carregar();
  }

  if (!d) {
    return (
      <div style={painel.wrap}>
        <PainelNav atual="/painel/conversas" />
        <div style={painel.conteudo}><p style={{ color: cor.cinza }}>Carregando…</p></div>
      </div>
    );
  }

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/conversas" />
      <div style={painel.conteudo}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={painel.h1}>{d.conversa.cliente}</h1>
          <button style={d.conversa.escalada ? painel.botao : painel.botaoSec} onClick={alternarIa} disabled={ocupado}>
            {d.conversa.escalada ? "Devolver para a IA" : "Assumir conversa"}
          </button>
        </div>
        <p style={{ color: cor.cinza, marginTop: -10, fontSize: 14 }}>
          {d.conversa.escalada ? "Você está atendendo — a IA não responde." : "A IA está atendendo (rascunhos aparecem aqui)."}
        </p>

        <div style={{ ...painel.card, maxHeight: 420, overflowY: "auto" }}>
          {d.mensagens.length === 0 && <p style={{ color: cor.cinza }}>Sem mensagens ainda.</p>}
          {d.mensagens.map((m: any, i: number) => (
            <div key={i} style={{ margin: "8px 0", textAlign: m.autor === "cliente" ? "left" : "right" }}>
              <span style={{ display: "inline-block", maxWidth: "80%", padding: "8px 12px", borderRadius: 12, background: m.autor === "cliente" ? "#e2e8f0" : m.autor === "ia" ? "#0f766e" : "#1e293b", color: m.autor === "cliente" ? cor.navy : "#fff", fontSize: 14 }}>
                {m.texto}
                <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{m.autor}</div>
              </span>
            </div>
          ))}
          <div ref={fim} />
        </div>

        {d.rascunho && (
          <div style={{ ...painel.card, borderColor: "#fbbf24", background: "#fffbeb" }}>
            <div style={painel.rotulo}>Rascunho da IA — revise antes de enviar</div>
            <textarea
              style={{ ...painel.input, minHeight: 80, resize: "vertical", fontFamily: "inherit" }}
              value={rascText}
              onChange={(e) => setRascText(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button style={painel.botao} disabled={ocupado} onClick={() => agirRascunho("aprovou")}>Aprovar e enviar</button>
              <button style={painel.botaoSec} disabled={ocupado} onClick={() => agirRascunho("editou")}>Enviar editado</button>
              <button style={painel.botaoPerigo} disabled={ocupado} onClick={() => agirRascunho("descartou")}>Descartar</button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ ...painel.input, flex: 1 }}
            placeholder="Escreva uma mensagem…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enviar()}
          />
          <button style={painel.botao} onClick={enviar} disabled={ocupado}>Enviar</button>
        </div>
      </div>
    </div>
  );
}
