"use client";

import { useEffect, useState } from "react";
import { PainelNav, painel, cor } from "../ui";

interface Item {
  id: string;
  status: string;
  tumulo: string;
  quadra: string;
  falecido: string | null;
  cliente: string | null;
  valor: number | null;
}

export default function AgendaPage() {
  const [dias, setDias] = useState<Record<string, Item[]>>({});
  const [carregando, setCarregando] = useState(true);
  const [remarcando, setRemarcando] = useState<string | null>(null);
  const [novaData, setNovaData] = useState("");

  async function carregar() {
    setCarregando(true);
    const r = await fetch("/api/agenda/semana").then((x) => x.json()).catch(() => null);
    setDias(r?.dias || {});
    setCarregando(false);
  }
  useEffect(() => {
    carregar();
  }, []);

  async function acao(id: string, corpo: any) {
    const r = await fetch(`/api/servico/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) alert("Falhou: " + (r?.erro || "erro"));
    setRemarcando(null);
    setNovaData("");
    carregar();
  }

  const chaves = Object.keys(dias).sort();
  const statusCor: Record<string, string> = {
    agendado: cor.teal,
    alocado: cor.teal,
    executado: "#16a34a",
    pulado: "#b45309",
  };

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/agenda" />
      <main style={painel.conteudo}>
        <h1 style={painel.h1}>Agenda — próximos 14 dias</h1>

        {carregando && <p style={{ color: cor.cinza }}>Carregando...</p>}
        {!carregando && chaves.length === 0 && (
          <section style={painel.card}>
            <p style={{ color: cor.cinza, margin: 0 }}>
              Nada agendado no período. Gere a agenda na tela Início (ou aguarde o robô diário).
            </p>
          </section>
        )}

        {chaves.map((d) => (
          <section key={d} style={painel.card}>
            <strong style={{ color: cor.navy, fontSize: 16 }}>
              {new Date(d + "T12:00:00").toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "2-digit",
              })}
            </strong>
            {dias[d].map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  borderTop: `1px solid ${cor.linha}`,
                  paddingTop: 10,
                  marginTop: 10,
                }}
              >
                <div>
                  <span style={{ color: cor.navy, fontWeight: 600 }}>
                    Q{s.quadra} · {s.tumulo}
                  </span>{" "}
                  <span style={{ color: statusCor[s.status] || cor.cinza, fontSize: 13 }}>({s.status})</span>
                  <p style={{ color: cor.cinza, fontSize: 13, margin: "2px 0 0" }}>
                    {s.falecido ? `${s.falecido} · ` : ""}
                    {s.cliente || "sem cliente"}
                    {s.valor ? ` · R$ ${Number(s.valor).toFixed(2)}` : ""}
                  </p>
                </div>
                {s.status !== "executado" && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {remarcando === s.id ? (
                      <>
                        <input
                          type="date"
                          value={novaData}
                          onChange={(e) => setNovaData(e.target.value)}
                          style={{ ...painel.input, width: 160, padding: 8 }}
                        />
                        <button
                          style={painel.botao}
                          onClick={() => novaData && acao(s.id, { acao: "remarcar", novaData })}
                        >
                          Salvar
                        </button>
                        <button style={painel.botaoSec} onClick={() => setRemarcando(null)}>
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button style={painel.botaoSec} onClick={() => setRemarcando(s.id)}>
                          Remarcar
                        </button>
                        <button style={painel.botaoSec} onClick={() => acao(s.id, { acao: "pular" })}>
                          Pular
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}
