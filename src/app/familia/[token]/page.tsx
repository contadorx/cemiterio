"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Cab {
  identificacao: string;
  falecido_nome: string | null;
  quadra: string;
  cemiterio: string;
  foto_referencia_url: string | null;
}
interface Item {
  servico_id: string;
  data_executada: string;
  foto_depois_url: string;
}

export default function PortalFamilia() {
  const params = useParams();
  const token = params?.token as string;
  const [cab, setCab] = useState<Cab | null>(null);
  const [hist, setHist] = useState<Item[]>([]);
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">("carregando");
  const [foto, setFoto] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/portal?t=${encodeURIComponent(token)}`)
      .then((x) => x.json())
      .then((r) => {
        if (r.ok) {
          setCab(r.cabecalho);
          setHist(r.historico);
          setEstado("ok");
        } else setEstado("erro");
      })
      .catch(() => setEstado("erro"));
  }, [token]);

  if (estado === "carregando") {
    return <div style={s.wrap}><p style={s.suave}>Carregando...</p></div>;
  }
  if (estado === "erro") {
    return (
      <div style={s.wrap}>
        <div style={s.card}>
          <p style={s.suave}>Este link não está mais disponível.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.container}>
        <header style={s.header}>
          <div style={s.marca}>🕊 Sureya</div>
          <h1 style={s.h1}>{cab?.falecido_nome || "Memória"}</h1>
          <p style={s.sub}>
            {cab?.cemiterio} · Quadra {cab?.quadra} · {cab?.identificacao}
          </p>
          <p style={s.dedic}>
            Um espaço de cuidado e memória. Aqui você acompanha, com carinho, cada visita
            que fazemos ao túmulo.
          </p>
        </header>

        {hist.length === 0 ? (
          <div style={s.card}>
            <p style={s.suave}>Ainda não há registros de limpeza para mostrar.</p>
          </div>
        ) : (
          <>
            <p style={s.contagem}>
              {hist.length} {hist.length === 1 ? "cuidado registrado" : "cuidados registrados"}
            </p>
            <div style={s.grade}>
              {hist.map((h) => (
                <button key={h.servico_id} style={s.item} onClick={() => setFoto(h.foto_depois_url)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={h.foto_depois_url} alt="Limpeza realizada" style={s.thumb} />
                  <span style={s.data}>
                    {new Date(h.data_executada).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <footer style={s.footer}>
          <p style={s.suave}>Cuidado e manutenção por Sureya · Cemitério da Saudade</p>
        </footer>
      </div>

      {foto && (
        <div style={s.overlay} onClick={() => setFoto(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto} alt="Foto ampliada" style={s.fotoGrande} />
        </div>
      )}
    </div>
  );
}

const NAVY = "#12284b";
const GOLD = "#c6a15b";
const CREAM = "#f7f3e9";

const s: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", background: CREAM, fontFamily: "Georgia, 'Times New Roman', serif", color: NAVY },
  container: { maxWidth: 720, margin: "0 auto", padding: "40px 20px" },
  header: { textAlign: "center", marginBottom: 32 },
  marca: { color: GOLD, fontSize: 15, letterSpacing: 2, textTransform: "uppercase", marginBottom: 20 },
  h1: { fontSize: 34, margin: "0 0 8px", fontWeight: 400 },
  sub: { color: "#6b7280", fontSize: 15, margin: 0 },
  dedic: { color: "#4b5563", fontSize: 16, lineHeight: 1.7, maxWidth: 520, margin: "24px auto 0" },
  contagem: { textAlign: "center", color: GOLD, fontSize: 14, letterSpacing: 1, textTransform: "uppercase", marginBottom: 20 },
  grade: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 },
  item: { background: "#fff", border: `1px solid #e7e0cf`, borderRadius: 12, padding: 8, cursor: "pointer", textAlign: "center" },
  thumb: { width: "100%", height: 180, objectFit: "cover", borderRadius: 8, display: "block" },
  data: { display: "block", marginTop: 10, marginBottom: 4, fontSize: 14, color: NAVY },
  card: { background: "#fff", border: `1px solid #e7e0cf`, borderRadius: 12, padding: 28, textAlign: "center" },
  suave: { color: "#6b7280", fontSize: 15 },
  footer: { textAlign: "center", marginTop: 40, paddingTop: 20, borderTop: `1px solid #e7e0cf` },
  overlay: { position: "fixed", inset: 0, background: "rgba(18,40,75,.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "zoom-out", zIndex: 50 },
  fotoGrande: { maxWidth: "100%", maxHeight: "90vh", borderRadius: 8 },
};
