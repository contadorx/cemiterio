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
  const [aba, setAba] = useState<"conferir" | "relatorio">("conferir");

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/financeiro" />
      <div style={painel.conteudo}>
        <h1 style={painel.h1}>Financeiro</h1>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button style={aba === "conferir" ? painel.botao : painel.botaoSec} onClick={() => setAba("conferir")}>
            Comprovantes a conferir
          </button>
          <button style={aba === "relatorio" ? painel.botao : painel.botaoSec} onClick={() => setAba("relatorio")}>
            Relatório do mês
          </button>
        </div>

        {aba === "conferir" ? <Conferir /> : <Relatorio />}
      </div>
    </div>
  );
}

function Conferir() {
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

  if (itens.length === 0) return <p style={{ color: cor.cinza }}>Nada para conferir agora.</p>;

  return (
    <>
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
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
    </>
  );
}

function Relatorio() {
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));
  const [d, setD] = useState<any>(null);
  const [carregando, setCarregando] = useState(false);

  async function carregar(m: string) {
    setCarregando(true);
    const r = await fetch(`/api/financeiro/relatorio?mes=${m}`).then((x) => x.json()).catch(() => null);
    setD(r);
    setCarregando(false);
  }
  useEffect(() => {
    carregar(mes);
  }, [mes]);

  const real = (n: number) => `R$ ${Number(n).toFixed(2)}`;

  return (
    <>
      <div style={painel.card}>
        <label style={painel.rotulo}>Mês de referência</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={{ ...painel.input, width: 200 }} />
          <a href={`/api/financeiro/export?mes=${mes}`} style={{ ...painel.botaoSec, textDecoration: "none", display: "inline-block" }}>
            Exportar CSV
          </a>
        </div>
      </div>

      {carregando && <p style={{ color: cor.cinza }}>Carregando...</p>}

      {d?.ok && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12, marginBottom: 8 }}>
            <Cartao titulo="Recebido no mês" valor={real(d.recebido)} cor="#16a34a" />
            <Cartao titulo="Serviço prestado" valor={real(d.executado)} cor={cor.navy} />
            <Cartao titulo="A conferir" valor={real(d.aConferir)} cor="#d97706" />
            <Cartao titulo="Total a receber" valor={real(d.totalReceber)} cor="#dc2626" />
          </div>

          <div style={painel.card}>
            <strong style={{ color: cor.navy }}>Em aberto (a cobrar)</strong>
            {d.emAberto.length === 0 && <p style={{ color: cor.cinza, margin: "8px 0 0" }}>Ninguém em aberto. 🎉</p>}
            {d.emAberto.map((x: any, i: number) => (
              <div key={i} style={linha}>
                <span>{x.cliente}</span>
                <span style={{ color: "#dc2626", fontWeight: 700 }}>{real(x.valor)}</span>
              </div>
            ))}
          </div>

          <div style={painel.card}>
            <strong style={{ color: cor.navy }}>Adiantados (crédito a usar)</strong>
            {d.adiantados.length === 0 && <p style={{ color: cor.cinza, margin: "8px 0 0" }}>Ninguém adiantado.</p>}
            {d.adiantados.map((x: any, i: number) => (
              <div key={i} style={linha}>
                <span>{x.cliente}</span>
                <span style={{ color: "#16a34a", fontWeight: 700 }}>{real(x.valor)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Cartao({ titulo, valor, cor: c }: { titulo: string; valor: string; cor: string }) {
  return (
    <div style={{ ...painel.card, marginBottom: 0 }}>
      <div style={{ fontSize: 13, color: cor.cinza }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: c, marginTop: 4 }}>{valor}</div>
    </div>
  );
}

const linha: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "8px 0",
  borderTop: `1px solid ${cor.linha}`,
  marginTop: 8,
  fontSize: 15,
  color: cor.navy,
};
