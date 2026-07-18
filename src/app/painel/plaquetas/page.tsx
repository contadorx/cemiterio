"use client";

import { useEffect, useState } from "react";
import { PainelNav, painel, cor } from "../ui";
import { MARCA } from "@/lib/marca";

export default function Plaquetas() {
  const [itens, setItens] = useState<any[]>([]);
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">("carregando");

  useEffect(() => {
    fetch(`/api/plaquetas?origem=${encodeURIComponent(window.location.origin)}`)
      .then((x) => x.json())
      .then((r) => {
        if (r.ok) {
          setItens(r.plaquetas);
          setEstado("ok");
        } else setEstado("erro");
      })
      .catch(() => setEstado("erro"));
  }, []);

  return (
    <div style={painel.wrap}>
      <div className="naoImprimir">
        <PainelNav atual="/painel/plaquetas" />
      </div>
      <div style={painel.conteudo}>
        <div className="naoImprimir">
          <h1 style={painel.h1}>Plaquetas QR</h1>
          <div style={painel.card}>
            <p style={{ color: cor.cinza, margin: "0 0 10px", fontSize: 14 }}>
              Uma etiqueta por túmulo com portal ativo. O mesmo QR serve aos dois: a <b>família</b> escaneia e
              vê as fotos das limpezas; a <b>equipe logada</b> cai direto no túmulo certo dentro do app de campo.
              Imprima em papel adesivo e proteja com plástico — ou leve a um gráfico para fazer em acrílico.
              Para incluir um túmulo aqui, gere o link do portal na ficha do cliente.
            </p>
            <button style={painel.botao} onClick={() => window.print()}>Imprimir plaquetas</button>
          </div>
        </div>

        {estado === "carregando" && <p style={{ color: cor.cinza }}>Gerando QR codes...</p>}
        {estado === "ok" && itens.length === 0 && (
          <p style={{ color: cor.cinza }}>Nenhum túmulo com portal ativo ainda.</p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 16 }}>
          {itens.map((p) => (
            <div key={p.id} style={etiqueta}>
              <div style={{ fontSize: 12, letterSpacing: 1, color: "#c6a15b", textTransform: "uppercase" }}>{MARCA.nome}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.qr} alt="QR" style={{ width: 150, height: 150, margin: "8px 0" }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: "#12284b" }}>
                {p.falecido || p.identificacao}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Q{p.quadra} · {p.identificacao}
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
                Aponte a câmera para ver os cuidados
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`@media print {
        .naoImprimir { display: none !important; }
        body { background: #fff !important; }
      }`}</style>
    </div>
  );
}

const etiqueta: React.CSSProperties = {
  border: "1px solid #e7e0cf",
  borderRadius: 10,
  padding: 14,
  textAlign: "center",
  background: "#fff",
  breakInside: "avoid",
};
