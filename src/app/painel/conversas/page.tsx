"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PainelNav, painel, cor } from "../ui";

interface Conv {
  id: string;
  cliente: string;
  escalada: boolean;
  ultima: string;
  temRascunho: boolean;
  quando: string;
}

export default function Conversas() {
  const [itens, setItens] = useState<Conv[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch("/api/conversas")
      .then((x) => x.json())
      .then((r) => {
        if (r.ok) setItens(r.conversas);
        setCarregando(false);
      });
  }, []);

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/conversas" />
      <div style={painel.conteudo}>
        <h1 style={painel.h1}>Conversas</h1>
        {carregando && <p style={{ color: cor.cinza }}>Carregando…</p>}
        {!carregando && itens.length === 0 && <p style={{ color: cor.cinza }}>Nenhuma conversa ainda.</p>}

        {itens.map((c) => (
          <Link key={c.id} href={`/painel/conversas/${c.id}`} style={{ ...painel.card, display: "block", textDecoration: "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ color: cor.navy }}>{c.cliente}</strong>
              <div style={{ display: "flex", gap: 6 }}>
                {c.temRascunho && <span style={badge("#d97706")}>rascunho</span>}
                {c.escalada && <span style={badge("#dc2626")}>com você</span>}
              </div>
            </div>
            <div style={{ color: cor.cinza, fontSize: 14, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.ultima || "—"}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function badge(bg: string): React.CSSProperties {
  return { background: bg, color: "#fff", fontSize: 12, padding: "3px 10px", borderRadius: 999, fontWeight: 700 };
}
