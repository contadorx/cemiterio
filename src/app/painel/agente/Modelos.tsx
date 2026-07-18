"use client";

import { useEffect, useState } from "react";
import { painel, cor } from "../ui";

/**
 * MODELOS — qual cérebro usar em cada situação.
 * Não é sobre economizar em tudo: é sobre gastar onde errar tem preço.
 */
export default function Modelos() {
  const [d, setD] = useState<any>(null);
  const [salvando, setSalvando] = useState<string | null>(null);

  async function carregar() {
    const r = await fetch("/api/config/modelos").then((x) => x.json()).catch(() => null);
    if (r?.ok) setD(r);
  }
  useEffect(() => { carregar(); }, []);

  async function salvar(m: any, patch: any) {
    setSalvando(m.id);
    await fetch("/api/config/modelos", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id, ...patch }),
    });
    setSalvando(null);
    carregar();
  }

  if (!d) return <p style={{ color: cor.cinza }}>Carregando…</p>;

  const explica: Record<string, { titulo: string; quando: string }> = {
    economico: {
      titulo: "Econômico",
      quando: "Conversas de rotina com quem já tem score alto: agendamento, dúvida simples, confirmação de foto. Também usado para tarefas internas que ninguém lê (montar o perfil do contato, ler comprovante).",
    },
    padrao: {
      titulo: "Padrão",
      quando: "Cobrança, contatos novos e tudo que a família vai ler mas não é delicado. O tom aqui decide se ela paga ou se afasta.",
    },
    delicado: {
      titulo: "Delicado",
      quando: "Luto, reclamação e cancelamento. Errar aqui machuca uma família enlutada — e nenhuma economia paga isso. Vale usar o melhor modelo disponível.",
    },
  };

  const sugestoes = [
    "claude-haiku-4-5-20251001",
    "claude-sonnet-5",
    "claude-opus-4-8",
  ];

  return (
    <>
      <div style={{ ...painel.card, background: "#f8fafc" }}>
        <p style={{ margin: 0, fontSize: 14, color: cor.cinza, lineHeight: 1.6 }}>
          O sistema escolhe o modelo sozinho, pelo <b>assunto</b> e pelo <b>score</b> do contato.
          Aqui você define qual modelo entra em cada nível. Um contato com score alto em assunto
          de rotina vai de econômico; luto e reclamação vão sempre para o delicado, mesmo com
          score 100.
        </p>
      </div>

      {(d.modelos || []).map((m: any) => {
        const info = explica[m.apelido] || { titulo: m.apelido, quando: "" };
        const usado = d.uso30dias?.[m.apelido];
        // custo de uma conversa típica: ~2 mil tokens de entrada, 400 de saída
        const tipica = (Number(m.preco_entrada) * 2000 + Number(m.preco_saida) * 400) / 1e6;
        return (
          <div key={m.id} style={painel.card}>
            <strong style={{ color: cor.navy, fontSize: 16 }}>{info.titulo}</strong>
            <p style={{ color: cor.cinza, fontSize: 14, margin: "6px 0 12px", lineHeight: 1.5 }}>
              {info.quando}
            </p>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <label style={painel.rotulo}>Modelo</label>
                <input style={painel.input} defaultValue={m.modelo} list={`modelos-${m.id}`}
                       onBlur={(e) => e.target.value !== m.modelo && salvar(m, { modelo: e.target.value })} />
                <datalist id={`modelos-${m.id}`}>
                  {sugestoes.map((x) => <option key={x} value={x} />)}
                </datalist>
              </div>
              <div>
                <label style={painel.rotulo}>R$ por milhão (entrada)</label>
                <input type="number" step="0.01" style={{ ...painel.input, width: 130 }}
                       defaultValue={m.preco_entrada}
                       onBlur={(e) => salvar(m, { preco_entrada: e.target.value })} />
              </div>
              <div>
                <label style={painel.rotulo}>R$ por milhão (saída)</label>
                <input type="number" step="0.01" style={{ ...painel.input, width: 130 }}
                       defaultValue={m.preco_saida}
                       onBlur={(e) => salvar(m, { preco_saida: e.target.value })} />
              </div>
              {salvando === m.id && <span style={{ color: cor.teal, paddingBottom: 12 }}>salvando…</span>}
            </div>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10,
                          fontSize: 15, color: cor.cinza }}>
              <span>Uma conversa típica custa <b style={{ color: cor.navy }}>
                R$ {tipica.toFixed(3)}</b></span>
              {usado && (
                <span>Nos últimos 30 dias: <b style={{ color: cor.navy }}>{usado.chamadas}</b> chamadas,
                  R$ {usado.custo.toFixed(2)}</span>
              )}
            </div>
          </div>
        );
      })}

      <div style={{ ...painel.card, borderLeft: `4px solid ${cor.teal}` }}>
        <strong style={{ color: cor.navy }}>Sempre no manual</strong>
        <p style={{ color: cor.cinza, fontSize: 14, margin: "6px 0 0" }}>
          {(d.assuntosManual || []).join(" · ") || "nenhum"} — estes nunca vão automáticos,
          por mais alto que seja o score.
        </p>
      </div>

      <p style={{ color: cor.cinza, fontSize: 14 }}>
        Os preços acima são os que o sistema usa para calcular o custo. Confirme na tabela oficial
        da Anthropic de tempos em tempos e ajuste aqui se mudarem.
      </p>
    </>
  );
}
