"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function Recibo() {
  const params = useParams();
  const id = params?.movimentoId as string;
  const [r, setR] = useState<any>(null);
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">("carregando");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/financeiro/recibo?movimentoId=${id}`)
      .then((x) => x.json())
      .then((j) => {
        if (j.ok) {
          setR(j.recibo);
          setEstado("ok");
        } else setEstado("erro");
      })
      .catch(() => setEstado("erro"));
  }, [id]);

  if (estado === "carregando") return <div style={s.wrap}><p>Carregando...</p></div>;
  if (estado === "erro") return <div style={s.wrap}><p>Recibo não encontrado.</p></div>;

  return (
    <div style={s.wrap}>
      <div style={s.papel}>
        <div style={s.topo}>
          <div>
            <div style={s.marca}>{r.emitente}</div>
            {r.assinatura && <div style={s.assinaturaMarca}>{r.assinatura}</div>}
          </div>
          <div style={s.numero}>Recibo Nº {r.numero}</div>
        </div>

        <h1 style={s.titulo}>Recibo de Pagamento</h1>

        <p style={s.texto}>
          Recebemos de <b>{r.cliente}</b> a importância de{" "}
          <b>R$ {Number(r.valor).toFixed(2)}</b>, referente a{" "}
          <b>{r.descricao}</b>.
        </p>

        <div style={s.linha}>
          <span>Valor</span>
          <b>R$ {Number(r.valor).toFixed(2)}</b>
        </div>
        <div style={s.linha}>
          <span>Data</span>
          <b>{new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR")}</b>
        </div>

        <div style={s.assinatura}>
          <div style={s.linhaAssinatura} />
          <span>{r.emitente}</span>
        </div>

        <button style={s.imprimir} onClick={() => window.print()}>
          Imprimir / Salvar PDF
        </button>
      </div>

      <style>{`@media print { button { display: none !important; } body { background: #fff !important; } }`}</style>
    </div>
  );
}

const NAVY = "#12284b";
const s: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", background: "#f1f5f9", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 30, fontFamily: "Georgia, serif", color: NAVY },
  papel: { background: "#fff", maxWidth: 600, width: "100%", padding: 48, borderRadius: 8, boxShadow: "0 2px 12px rgba(0,0,0,.08)" },
  topo: { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `2px solid ${NAVY}`, paddingBottom: 16, marginBottom: 24 },
  marca: { fontSize: 20, fontWeight: 700 },
  assinaturaMarca: { fontSize: 14, color: "#7A6234", marginTop: 2 },
  numero: { color: "#6b7280", fontSize: 14 },
  titulo: { fontSize: 22, fontWeight: 400, margin: "0 0 20px" },
  texto: { fontSize: 16, lineHeight: 1.8, marginBottom: 24 },
  linha: { display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid #e5e7eb", fontSize: 16 },
  assinatura: { textAlign: "center", marginTop: 56 },
  linhaAssinatura: { width: 240, borderTop: "1px solid #333", margin: "0 auto 6px" },
  imprimir: { marginTop: 40, width: "100%", padding: 14, background: NAVY, color: "#fff", border: "none", borderRadius: 8, fontSize: 15, cursor: "pointer", fontFamily: "system-ui" },
};
