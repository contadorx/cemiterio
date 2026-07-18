"use client";

import { useEffect, useState } from "react";
import { PainelNav, painel, cor } from "../ui";

interface Comp {
  id: string;
  imagem: string | null;
  valor: number | null;
  data: string | null;
  idTransacao: string | null;
  cliente: string;
}

export default function Financeiro() {
  const [itens, setItens] = useState<Comp[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function carregar() {
    const r = await fetch("/api/comprovantes").then((x) => x.json());
    if (r.ok) setItens(r.comprovantes);
  }
  useEffect(() => {
    carregar();
  }, []);

  async function conciliar(id: string, aprovar: boolean) {
    setOcupado(id);
    await fetch("/api/financeiro/conciliar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comprovanteId: id, aprovar }),
    });
    setOcupado(null);
    carregar();
  }

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/financeiro" />
      <div style={painel.conteudo}>
        <h1 style={painel.h1}>Financeiro — comprovantes a conferir</h1>

        {itens.length === 0 && <p style={{ color: cor.cinza }}>Nada para conferir agora.</p>}

        {itens.map((c) => (
          <div key={c.id} style={painel.card}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <strong style={{ color: cor.navy }}>{c.cliente}</strong>
              <span style={{ fontWeight: 800, color: cor.teal }}>
                {c.valor != null ? `R$ ${Number(c.valor).toFixed(2)}` : "valor não lido"}
              </span>
            </div>
            <div style={{ fontSize: 14, color: cor.cinza }}>
              {c.data || "sem data"} {c.idTransacao ? `· ${c.idTransacao}` : ""}
            </div>
            {c.imagem && (
              <a href={c.imagem} target="_blank" rel="noreferrer">
                <img src={c.imagem} alt="comprovante" style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 10, marginTop: 10 }} />
              </a>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button style={painel.botao} disabled={ocupado === c.id} onClick={() => conciliar(c.id, true)}>
                Confirmar pagamento
              </button>
              <button style={painel.botaoPerigo} disabled={ocupado === c.id} onClick={() => conciliar(c.id, false)}>
                Rejeitar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
