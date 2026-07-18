"use client";

import { useRef, useState } from "react";
import { capturarGps, qualidade } from "@/lib/gps";
import { concluirOuEnfileirar } from "@/lib/offline-fila";

/**
 * FINALIZAR — a foto do depois fecha o serviço.
 * A foto do "antes" agora é tirada no Começar, então aqui ela é opcional
 * (fica para quem esqueceu de iniciar pelo app).
 */
export default function Concluir({
  it: item,
  onFechar,
  onPronto,
}: {
  it: any;
  onFechar: () => void;
  onPronto: (offline?: boolean) => void;
}) {
  const [antes, setAntes] = useState<{ b64: string; mt: string } | null>(null);
  const [depois, setDepois] = useState<{ b64: string; mt: string } | null>(null);
  const [enquadramento, setEnquadramento] = useState<{ b64: string; mt: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [gpsEstado, setGpsEstado] = useState<"idle" | "buscando" | "ok" | "erro">("idle");
  const [gpsMsg, setGpsMsg] = useState("");
  const refAntes = useRef<HTMLInputElement>(null);
  const refDepois = useRef<HTMLInputElement>(null);
  const refEnq = useRef<HTMLInputElement>(null);

  async function lerArquivo(f: File): Promise<{ b64: string; mt: string }> {
    const buf = await f.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return { b64: btoa(bin), mt: f.type || "image/jpeg" };
  }

  // Confirmação de localização pela Nina: captura a melhor leitura possível e
  // manda pro servidor, que recalcula a média. Cada visita melhora o ponto.
  async function confirmarLocal() {
    setGpsEstado("buscando");
    setGpsMsg("Procurando sinal…");
    const leitura = await capturarGps({
      alvoMetros: 8,
      timeoutMs: 15000,
      aoProgredir: (p) => setGpsMsg(`Sinal: ${p} m — aguarde…`),
    });

    if (!leitura) {
      setGpsEstado("erro");
      setGpsMsg("Não consegui o GPS. Verifique se a localização está ligada.");
      return;
    }

    const q = qualidade(leitura.precisao);
    if (!q.serve) {
      setGpsEstado("erro");
      setGpsMsg(`Sinal ${q.rotulo} (${leitura.precisao} m). Chegue mais perto e tente de novo.`);
      return;
    }

    const r = await fetch(`/api/tumulos/${item.tumuloId}/gps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...leitura, origem: "confirmacao" }),
    }).then((x) => x.json()).catch(() => null);

    if (r?.ok) {
      setGpsEstado("ok");
      setGpsMsg(
        `✓ Localização confirmada (${r.amostras} leitura${r.amostras > 1 ? "s" : ""}, precisão ~${r.precisao} m)`
      );
    } else {
      setGpsEstado("erro");
      setGpsMsg(r?.mensagem || "Não consegui salvar. Tente de novo.");
    }
  }

  async function concluir() {
    if (!depois) {
      setErro("A foto do depois é obrigatória.");
      return;
    }
    setEnviando(true);
    setErro("");

    // aproveita a conclusão para registrar mais uma leitura (sem travar o fluxo)
    const leitura = await capturarGps({ alvoMetros: 10, timeoutMs: 8000 });
    if (leitura && leitura.precisao <= 30) {
      fetch(`/api/tumulos/${item.tumuloId}/gps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...leitura, origem: "conclusao" }),
      }).catch(() => {});
    }

    // foto de enquadramento (referência do túmulo), se ela tirou uma nova
    if (enquadramento) {
      fetch(`/api/tumulos/${item.tumuloId}/foto-referencia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64: enquadramento.b64, mimetype: enquadramento.mt, tipo: "enquadramento" }),
      }).catch(() => {});
    }

    const modo = await concluirOuEnfileirar({
      servicoId: item.id,
      fotoDepoisBase64: depois.b64,
      fotoAntesBase64: antes?.b64,
      mimetype: depois.mt,
      lat: leitura?.lat,
      lng: leitura?.lng,
    });
    setEnviando(false);
    // online = subiu; offline = guardado no aparelho e sobe sozinho quando voltar o sinal.
    // Em ambos, a Nina segue em frente (o cemitério tem sinal ruim; travar não ajuda).
    onPronto(modo === "offline");
  }

  return (
    <div style={st.overlay}>
      <div style={st.caixa}>
        <div style={st.topo}>
          <strong style={{ fontSize: 20 }}>{item.tumulo}</strong>
          <button style={st.fechar} onClick={onFechar}>
            ✕
          </button>
        </div>
        <div style={st.caixaSub}>
          Quadra {item.quadra}
          {item.falecido ? ` · ${item.falecido}` : ""}
        </div>

        {item.fotoEnquadramento && (
          <div>
            <div style={st.rotulo}>Onde fica (foto de longe):</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.fotoEnquadramento} alt="enquadramento" style={st.fotoRef} />
          </div>
        )}
        {item.fotoReferencia && (
          <div>
            <div style={st.rotulo}>Confira se é este túmulo:</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.fotoReferencia} alt="referência" style={st.fotoRef} />
          </div>
        )}
        {(item.lat != null && item.lng != null) && (
          <a
            style={st.mapa}
            href={`https://www.google.com/maps?q=${item.lat},${item.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            📍 abrir no mapa
            {item.gpsAmostras > 0 && item.gpsPrecisao != null
              ? ` (±${item.gpsPrecisao} m · ${item.gpsAmostras} leitura${item.gpsAmostras > 1 ? "s" : ""})`
              : ""}
          </a>
        )}

        <input
          ref={refAntes}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={async (e) => e.target.files?.[0] && setAntes(await lerArquivo(e.target.files[0]))}
        />
        <input
          ref={refDepois}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={async (e) => e.target.files?.[0] && setDepois(await lerArquivo(e.target.files[0]))}
        />

        <input
          ref={refEnq}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={async (e) => e.target.files?.[0] && setEnquadramento(await lerArquivo(e.target.files[0]))}
        />

        <button style={{ ...st.botaoFoto, ...(antes ? st.botaoFotoOk : {}) }} onClick={() => refAntes.current?.click()}>
          {antes ? "✓ Foto do antes" : "📷 Foto do antes (opcional)"}
        </button>
        <button style={{ ...st.botaoFoto, ...(depois ? st.botaoFotoOk : {}) }} onClick={() => refDepois.current?.click()}>
          {depois ? "✓ Foto do depois" : "📷 Foto do depois"}
        </button>

        {/* Localização: cada confirmação melhora a média do ponto */}
        <div style={st.blocoGps}>
          <button
            style={{ ...st.botaoFoto, ...(gpsEstado === "ok" ? st.botaoFotoOk : {}), marginBottom: 6 }}
            onClick={confirmarLocal}
            disabled={gpsEstado === "buscando"}
          >
            {gpsEstado === "buscando" ? "📍 Procurando sinal…" : gpsEstado === "ok" ? "✓ Localização confirmada" : "📍 Confirmar que estou neste túmulo"}
          </button>
          {gpsMsg && (
            <p style={{ ...st.gpsMsg, color: gpsEstado === "erro" ? "#dc2626" : "#0f766e" }}>{gpsMsg}</p>
          )}
          <button style={{ ...st.botaoFoto, ...(enquadramento ? st.botaoFotoOk : {}) }} onClick={() => refEnq.current?.click()}>
            {enquadramento ? "✓ Foto de longe salva" : "🖼 Atualizar foto de longe (ajuda a achar)"}
          </button>
          <p style={st.gpsDica}>
            A foto de longe é tirada do corredor, mostrando o túmulo junto com os vizinhos. É ela que ajuda a
            encontrar da próxima vez.
          </p>
        </div>

        {erro && <p style={st.erro}>{erro}</p>}

        <button style={st.concluir} onClick={concluir} disabled={enviando}>
          {enviando ? "Enviando…" : "Concluir e enviar à família"}
        </button>
      </div>
    </div>
  );
}

const NAVY = "#12284b";
const TEAL = "#0f766e";
const st: Record<string, React.CSSProperties> = {
  modal: { background: "#fff", width: "100%", maxWidth: 520, borderRadius: "16px 16px 0 0", padding: 18, maxHeight: "92vh", overflowY: "auto" },
  modalTopo: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  modalSub: { fontSize: 19, fontWeight: 700, color: "#12284b", margin: "2px 0 14px" },
  fotoBtn: { width: "100%", minHeight: 60, padding: 17, background: "#fff", color: "#12284b", border: "2px dashed #cbd5e1", borderRadius: 12, fontSize: 17, cursor: "pointer" },
  fotoRef: { width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 10, marginTop: 8 },
  blocoGps: { background: "#f8fafc", borderRadius: 10, padding: 12, marginBottom: 14 },
  gpsDica: { color: "#475569", fontSize: 17, margin: "4px 0 0" },
  gpsMsg: { color: "#0f766e", fontSize: 18, fontWeight: 600, margin: "6px 0 0" },
  mapa: { color: "#12284b", fontSize: 17, textDecoration: "underline" },
  concluir: { width: "100%", minHeight: 60, padding: 18, background: "#0f766e", color: "#fff", border: "none", borderRadius: 12, fontSize: 17, fontWeight: 700, cursor: "pointer", marginTop: 6 },
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60 },
  caixa: { background: "#fff", width: "100%", maxWidth: 520, borderRadius: "16px 16px 0 0", padding: 18, maxHeight: "92vh", overflowY: "auto" },
  topo: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  fechar: { background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#475569" },
  nome: { fontSize: 19, fontWeight: 700, color: NAVY, margin: "2px 0 14px" },
  bloco: { marginBottom: 14 },
  rotulo: { fontSize: 17, fontWeight: 600, color: NAVY, display: "block", marginBottom: 6 },
  dica: { color: "#475569", fontSize: 17, margin: "4px 0 0" },
  erro: { color: "#dc2626", fontSize: 18, fontWeight: 600, margin: "8px 0" },
  botaoFoto: { width: "100%", minHeight: 60, padding: 17, background: "#fff", color: NAVY, border: "2px dashed #cbd5e1", borderRadius: 12, fontSize: 17, cursor: "pointer" },
  botaoFotoOk: { borderColor: TEAL, color: TEAL, background: "#f0fdfa", borderStyle: "solid" },
  botao: { width: "100%", minHeight: 60, padding: 18, background: TEAL, color: "#fff", border: "none", borderRadius: 12, fontSize: 17, fontWeight: 700, cursor: "pointer", marginTop: 6 },
  previa: { width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 10, marginTop: 8 },
};
