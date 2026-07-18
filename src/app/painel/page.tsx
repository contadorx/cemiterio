"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PainelNav, painel, cor } from "./ui";

export default function Painel() {
  const [cap, setCap] = useState<any>(null);
  const [rasc, setRasc] = useState(0);
  const [comp, setComp] = useState(0);
  const [gerando, setGerando] = useState(false);
  const [msg, setMsg] = useState("");

  async function carregar() {
    const [c, r, cp] = await Promise.all([
      fetch("/api/capacidade").then((x) => x.json()),
      fetch("/api/rascunhos").then((x) => x.json()),
      fetch("/api/comprovantes").then((x) => x.json()),
    ]);
    if (c.ok) setCap(c);
    if (r.ok) setRasc(r.rascunhos.length);
    if (cp.ok) setComp(cp.comprovantes.length);
  }
  useEffect(() => {
    carregar();
  }, []);

  async function gerarAgenda() {
    setGerando(true);
    setMsg("");
    const r = await fetch("/api/agenda/gerar", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((x) => x.json());
    setGerando(false);
    setMsg(r.ok ? `${r.gerados} serviços gerados, ${r.agendados} agendados em ${r.dias} dia(s).` : "Falha ao gerar agenda.");
  }

  const util = cap ? Math.round(cap.utilizacao * 100) : 0;
  const corUtil = util >= 90 ? "#dc2626" : util >= 70 ? "#d97706" : cor.teal;

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel" />
      <div style={painel.conteudo}>
        <h1 style={painel.h1}>Início</h1>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 8 }}>
          <Link href="/painel/atendimento" style={{ ...painel.card, textDecoration: "none", display: "block" }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: rasc ? "#d97706" : cor.navy }}>{rasc}</div>
            <div style={{ color: cor.cinza }}>rascunhos p/ aprovar</div>
          </Link>
          <Link href="/painel/financeiro" style={{ ...painel.card, textDecoration: "none", display: "block" }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: comp ? "#d97706" : cor.navy }}>{comp}</div>
            <div style={{ color: cor.cinza }}>comprovantes p/ conferir</div>
          </Link>
        </div>

        {cap && (
          <div style={painel.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <strong style={{ fontSize: 18, color: cor.navy }}>Carga × capacidade</strong>
              <span style={{ fontWeight: 800, color: corUtil, fontSize: 20 }}>{util}%</span>
            </div>
            <div style={{ height: 10, background: "#e2e8f0", borderRadius: 999, overflow: "hidden", margin: "10px 0" }}>
              <div style={{ height: "100%", width: `${Math.min(100, util)}%`, background: corUtil }} />
            </div>
            <p style={{ color: cor.cinza, margin: "4px 0", fontSize: 15 }}>
              A Nina dá conta de ~<b>{cap.capacidadeMensal}</b> limpezas/mês. Hoje os planos consomem{" "}
              <b>{cap.cargaMensal}</b>. Sobra pra cerca de <b style={{ color: cor.teal }}>{cap.cabemTumulos} túmulos</b> novos
              ({cap.folgaMensal} limpezas/mês).
            </p>
          </div>
        )}

        <div style={painel.card}>
          <strong style={{ fontSize: 18, color: cor.navy }}>Agenda</strong>
          <p style={{ color: cor.cinza, fontSize: 15 }}>
            Gera os serviços dos planos vencidos e distribui nos dias da Nina, por quadra.
          </p>
          <button style={painel.botao} onClick={gerarAgenda} disabled={gerando}>
            {gerando ? "Gerando…" : "Gerar e distribuir agenda"}
          </button>
          {msg && <p style={{ marginTop: 10, color: cor.navy }}>{msg}</p>}
        </div>
      </div>
    </div>
  );
}
