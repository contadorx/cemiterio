"use client";

import { useEffect, useRef, useState } from "react";
import { capturarGps, qualidade } from "@/lib/gps";

/**
 * CAPTURAR JAZIGO no campo — cadastro completo na hora da lavagem:
 * quadra + identificação + (falecido/obs) → cria o jazigo → GPS → 2 fotos.
 *
 * Pensado para a fase de captura das quadras: a pessoa está de pé no cemitério,
 * então é um passo de cada vez, botão grande e nada obrigatório além do essencial.
 */
type Foto = { b64: string; mt: string };

export default function CapturarJazigo({ onFechar, onPronto }: {
  onFechar: () => void;
  onPronto: () => void;
}) {
  // dados
  const [cemiterios, setCemiterios] = useState<any[]>([]);
  const [cemId, setCemId] = useState<string>("");
  const [quadra, setQuadra] = useState("");
  const [identificacao, setIdentificacao] = useState("");
  const [falecido, setFalecido] = useState("");
  const [obs, setObs] = useState("");

  // estado do jazigo já criado (a partir daqui anexamos GPS e fotos)
  const [tumuloId, setTumuloId] = useState<string | null>(null);
  const [jaExistia, setJaExistia] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // GPS
  const [gpsEstado, setGpsEstado] = useState<"idle" | "buscando" | "ok" | "erro">("idle");
  const [gpsMsg, setGpsMsg] = useState("");

  // fotos
  const [enq, setEnq] = useState<Foto | null>(null);
  const [ref, setRef] = useState<Foto | null>(null);
  const [enqOk, setEnqOk] = useState(false);
  const [refOk, setRefOk] = useState(false);
  const refEnq = useRef<HTMLInputElement>(null);
  const refRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/tumulos").then((x) => x.json()).then((j) => {
      if (j?.ok) {
        setCemiterios(j.cemiterios || []);
        if ((j.cemiterios || []).length) setCemId(j.cemiterios[0].id);
      }
    }).catch(() => {});
  }, []);

  const cemAtual = cemiterios.find((c) => c.id === cemId);
  const quadrasExistentes: string[] = (cemAtual?.quadras || []).map((q: any) => q.codigo);

  async function lerArquivo(f: File): Promise<Foto> {
    const buf = await f.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return { b64: btoa(bin), mt: f.type || "image/jpeg" };
  }

  async function criarJazigo() {
    setErro("");
    if (!quadra.trim()) return setErro("Diga a quadra (ex.: Q-12).");
    if (!identificacao.trim()) return setErro("Diga a identificação do jazigo (lote/número).");
    setSalvando(true);
    const r = await fetch("/api/tumulos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cemiterioId: cemId || undefined,
        quadraCodigo: quadra.trim(),
        identificacao: identificacao.trim(),
        falecidoNome: falecido.trim() || undefined,
        observacoes: obs.trim() || undefined,
      }),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (r?.ok && r.tumuloId) {
      setTumuloId(r.tumuloId);
      setJaExistia(!!r.jaExistia);
    } else {
      setErro(r?.mensagem || "Não consegui criar: " + (r?.erro || "erro"));
    }
  }

  async function pegarGps() {
    if (!tumuloId) return;
    setGpsEstado("buscando");
    setGpsMsg("Procurando sinal…");
    const leitura = await capturarGps({
      alvoMetros: 8, timeoutMs: 15000,
      aoProgredir: (p) => setGpsMsg(`Sinal: ${p} m — aguarde…`),
    });
    if (!leitura) {
      setGpsEstado("erro");
      setGpsMsg("Não consegui o GPS. Veja se a localização está ligada.");
      return;
    }
    const q = qualidade(leitura.precisao);
    if (!q.serve) {
      setGpsEstado("erro");
      setGpsMsg(`Sinal ${q.rotulo} (${leitura.precisao} m). Chegue mais perto e tente de novo.`);
      return;
    }
    const r = await fetch(`/api/tumulos/${tumuloId}/gps`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...leitura, origem: "cadastro" }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      setGpsEstado("ok");
      setGpsMsg(`✓ Localização salva (precisão ~${r.precisao ?? leitura.precisao} m)`);
    } else {
      setGpsEstado("erro");
      setGpsMsg(r?.mensagem || "Não consegui salvar o GPS. Tente de novo.");
    }
  }

  async function enviarFoto(tipo: "enquadramento" | "referencia", foto: Foto) {
    if (!tumuloId) return false;
    const r = await fetch(`/api/tumulos/${tumuloId}/foto-referencia`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64: foto.b64, mimetype: foto.mt, tipo }),
    }).then((x) => x.json()).catch(() => null);
    return !!r?.ok;
  }

  async function escolherEnq(f: File) {
    const foto = await lerArquivo(f);
    setEnq(foto);
    setEnqOk(await enviarFoto("enquadramento", foto));
  }
  async function escolherRef(f: File) {
    const foto = await lerArquivo(f);
    setRef(foto);
    setRefOk(await enviarFoto("referencia", foto));
  }

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.topo}>
          <strong style={{ fontSize: 20 }}>Capturar jazigo</strong>
          <button style={s.fechar} onClick={onFechar}>✕</button>
        </div>

        {/* ETAPA 1 — dados (só até criar) */}
        {!tumuloId && (
          <>
            {cemiterios.length > 1 && (
              <div>
                <div style={s.rotulo}>Cemitério</div>
                <select style={s.input} value={cemId} onChange={(e) => setCemId(e.target.value)}>
                  {cemiterios.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            )}

            <div>
              <div style={s.rotulo}>Quadra</div>
              <input style={s.input} value={quadra} onChange={(e) => setQuadra(e.target.value)}
                     list="quadras-existentes" placeholder="Ex.: Q-12 (escolha ou digite uma nova)" />
              <datalist id="quadras-existentes">
                {quadrasExistentes.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>

            <div>
              <div style={s.rotulo}>Identificação do jazigo (lote/número)</div>
              <input style={s.input} value={identificacao} onChange={(e) => setIdentificacao(e.target.value)}
                     placeholder="Ex.: 045 · lote 12" />
            </div>

            <div>
              <div style={s.rotulo}>Falecido (opcional)</div>
              <input style={s.input} value={falecido} onChange={(e) => setFalecido(e.target.value)}
                     placeholder="Nome no jazigo" />
            </div>

            <div>
              <div style={s.rotulo}>Observações (opcional)</div>
              <textarea style={{ ...s.input, minHeight: 70, fontFamily: "inherit" }} value={obs}
                        onChange={(e) => setObs(e.target.value)}
                        placeholder="Ex.: lápide de granito preto, ao lado do chafariz." />
            </div>

            {erro && <p style={s.erro}>{erro}</p>}
            <button style={s.principal} onClick={criarJazigo} disabled={salvando}>
              {salvando ? "Criando…" : "Criar jazigo e capturar"}
            </button>
          </>
        )}

        {/* ETAPA 2 — GPS + fotos (depois de criado) */}
        {tumuloId && (
          <>
            <div style={s.criado}>
              ✓ Jazigo {jaExistia ? "encontrado" : "criado"}: <b>{quadra} · {identificacao}</b>
              {jaExistia && <div style={{ fontSize: 15, marginTop: 4 }}>Já existia — vou atualizar a localização e as fotos.</div>}
            </div>

            {/* GPS */}
            <div style={s.blocoGps}>
              {gpsMsg && <p style={{ ...s.gpsMsg, color: gpsEstado === "erro" ? "#b91c1c" : gpsEstado === "ok" ? "#059669" : "#334155" }}>{gpsMsg}</p>}
              <button style={{ ...s.fotoBtn, ...(gpsEstado === "ok" ? s.fotoOk : {}) }}
                      onClick={pegarGps} disabled={gpsEstado === "buscando"}>
                {gpsEstado === "ok" ? "✓ Localização salva — refazer" : gpsEstado === "buscando" ? "Procurando sinal…" : "📍 Marcar localização (GPS)"}
              </button>
            </div>

            {/* fotos */}
            <input ref={refEnq} type="file" accept="image/*" capture="environment" hidden
                   onChange={(e) => e.target.files?.[0] && escolherEnq(e.target.files[0])} />
            <input ref={refRef} type="file" accept="image/*" capture="environment" hidden
                   onChange={(e) => e.target.files?.[0] && escolherRef(e.target.files[0])} />

            <button style={{ ...s.fotoBtn, ...(enqOk ? s.fotoOk : {}) }} onClick={() => refEnq.current?.click()}>
              {enqOk ? "✓ Foto de longe (onde fica)" : "📷 Foto de longe — mostra o jazigo entre os vizinhos"}
            </button>
            <button style={{ ...s.fotoBtn, ...(refOk ? s.fotoOk : {}) }} onClick={() => refRef.current?.click()}>
              {refOk ? "✓ Foto da lápide (close)" : "📷 Foto da lápide — close que confirma"}
            </button>

            {enq && !enqOk && <p style={s.erro}>A foto de longe não subiu. Toque de novo.</p>}
            {ref && !refOk && <p style={s.erro}>A foto da lápide não subiu. Toque de novo.</p>}

            <button style={s.principal} onClick={onPronto}>Concluir</button>
            <p style={s.dica}>Pode concluir mesmo sem todas as fotos — dá para completar depois na ficha.</p>
          </>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", display: "grid", placeItems: "end center", zIndex: 60 },
  modal: { width: "100%", maxWidth: 520, background: "#fff", borderRadius: "20px 20px 0 0", padding: 20, display: "flex", flexDirection: "column", gap: 12, maxHeight: "94vh", overflowY: "auto" },
  topo: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  fechar: { background: "none", border: "none", fontSize: 22, color: "#475569" },
  rotulo: { fontSize: 18, color: "#475569", marginBottom: 6 },
  input: { width: "100%", padding: 14, fontSize: 17, borderRadius: 12, border: "1px solid #cbd5e1", boxSizing: "border-box" },
  principal: { padding: 20, fontSize: 20, fontWeight: 800, borderRadius: 14, border: "none", background: "#0f766e", color: "#fff", marginTop: 4 },
  fotoBtn: { padding: 18, fontSize: 17, fontWeight: 600, borderRadius: 12, border: "2px dashed #cbd5e1", background: "#f8fafc", color: "#334155", textAlign: "center" },
  fotoOk: { borderStyle: "solid", borderColor: "#6ee7b7", background: "#ecfdf5", color: "#059669" },
  criado: { background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 12, padding: 12, fontSize: 17, color: "#0f766e" },
  blocoGps: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 },
  gpsMsg: { fontSize: 17, margin: "0 0 8px", textAlign: "center" },
  dica: { fontSize: 15, color: "#475569", margin: "2px 0 0", textAlign: "center" },
  erro: { color: "#dc2626", margin: 0, fontSize: 16 },
};
