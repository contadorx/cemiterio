"use client";

import { useEffect, useState } from "react";
import { PainelNav, painel, cor } from "../ui";

interface Lead {
  id: string;
  telefone: string;
  nome_wa: string | null;
  mensagens: { t: string; texto: string }[];
  status: string;
  created_at: string;
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    const r = await fetch("/api/leads").then((x) => x.json()).catch(() => null);
    setLeads(r?.leads || []);
    setCarregando(false);
  }
  useEffect(() => {
    carregar();
  }, []);

  async function converter(l: Lead) {
    const nome = prompt("Nome do cliente:", l.nome_wa || "");
    if (nome === null) return;
    const r = await fetch(`/api/leads/${l.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "converter", nome }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      alert("Cliente criado! Agora a IA já atende esse número.");
      carregar();
    } else alert("Falhou: " + (r?.erro || "erro"));
  }

  async function descartar(l: Lead) {
    if (!confirm("Descartar este contato?")) return;
    await fetch(`/api/leads/${l.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "descartar" }),
    });
    carregar();
  }

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/leads" />
      <main style={painel.conteudo}>
        <h1 style={painel.h1}>Leads — quem escreveu e ainda não é cliente</h1>

        {carregando && <p style={{ color: cor.cinza }}>Carregando...</p>}
        {!carregando && leads.length === 0 && (
          <section style={painel.card}>
            <p style={{ color: cor.cinza, margin: 0 }}>
              Nenhum lead aguardando. Quando um número desconhecido mandar mensagem, ele aparece aqui.
            </p>
          </section>
        )}

        {leads.map((l) => (
          <section key={l.id} style={painel.card}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <strong style={{ color: cor.navy, fontSize: 16 }}>
                  {l.nome_wa || "Sem nome"} · {l.telefone}
                </strong>
                <p style={{ color: cor.cinza, fontSize: 13, margin: "4px 0 0" }}>
                  {l.mensagens?.length || 0} mensagem(ns) · desde {new Date(l.created_at).toLocaleDateString("pt-BR")}
                  {l.status === "em_conversa" ? " · saudação enviada" : ""}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={painel.botaoSec} onClick={() => setAberto(aberto === l.id ? null : l.id)}>
                  {aberto === l.id ? "Fechar" : "Ver mensagens"}
                </button>
                <button style={painel.botao} onClick={() => converter(l)}>
                  Virar cliente
                </button>
                <button style={painel.botaoPerigo} onClick={() => descartar(l)}>
                  Descartar
                </button>
              </div>
            </div>

            {aberto === l.id && (
              <div style={{ marginTop: 12, borderTop: `1px solid ${cor.linha}`, paddingTop: 12 }}>
                {(l.mensagens || []).map((m, i) => (
                  <p key={i} style={{ margin: "6px 0", fontSize: 14, color: cor.navy }}>
                    <span style={{ color: cor.cinza, fontSize: 12 }}>
                      {new Date(m.t).toLocaleString("pt-BR")} —{" "}
                    </span>
                    {m.texto}
                  </p>
                ))}
              </div>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
