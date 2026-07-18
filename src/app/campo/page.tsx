"use client";

import { useEffect, useRef, useState } from "react";
import { concluirOuEnfileirar, sincronizar, lerFila } from "@/lib/offline-fila";

interface Item {
  id: string;
  status: string;
  ordem: number;
  tumulo: string;
  quadra: string;
  falecido: string | null;
  cliente: string | null;
  lat: number | null;
  lng: number | null;
  fotoReferencia: string | null;
}

export default function Campo() {
  const [lista, setLista] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [feitos, setFeitos] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [ativo, setAtivo] = useState<Item | null>(null);
  const [pendentes, setPendentes] = useState(0);
  const [online, setOnline] = useState(true);

  async function carregar() {
    setCarregando(true);
    const r = await fetch("/api/agenda/dia").then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      setLista(r.lista);
      setTotal(r.total);
      setFeitos(r.feitos);
    }
    setCarregando(false);
  }

  async function sincronizarFila() {
    const res = await sincronizar();
    setPendentes(res.restantes);
    if (res.enviadas > 0) carregar(); // atualiza contadores após subir
  }

  useEffect(() => {
    carregar();
    setPendentes(lerFila().length);
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

    const aoVoltar = () => {
      setOnline(true);
      sincronizarFila();
    };
    const aoCair = () => setOnline(false);
    window.addEventListener("online", aoVoltar);
    window.addEventListener("offline", aoCair);

    // tenta sincronizar ao abrir e a cada 30s (rede pode oscilar no cemitério)
    sincronizarFila();
    const timer = setInterval(sincronizarFila, 30000);
    return () => {
      window.removeEventListener("online", aoVoltar);
      window.removeEventListener("offline", aoCair);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restantes = total - feitos;

  return (
    <main style={s.wrap}>
      <header style={s.topo}>
        <div>
          <div style={s.data}>Hoje</div>
          <div style={s.progresso}>
            {feitos} de {total} feitos
          </div>
        </div>
        <div style={s.badge}>{restantes} restantes</div>
      </header>

      {carregando && <p style={s.info}>Carregando…</p>}
      {!carregando && total === 0 && <p style={s.info}>Nenhum túmulo para hoje. 🌿</p>}

      <div style={s.barraFundo}>
        <div style={{ ...s.barraCheia, width: total ? `${(feitos / total) * 100}%` : "0%" }} />
      </div>

      {(pendentes > 0 || !online) && (
        <div style={s.faixaOffline}>
          {!online ? "📴 Sem sinal — as conclusões ficam salvas no aparelho." : ""}
          {pendentes > 0 ? ` ⏳ ${pendentes} para enviar quando voltar o sinal.` : ""}
        </div>
      )}

      {agrupar(lista).map((grupo) => (
        <section key={grupo.quadra}>
          <h2 style={s.quadra}>Quadra {grupo.quadra}</h2>
          {grupo.itens.map((it) => (
            <button
              key={it.id}
              style={{ ...s.cartao, ...(it.status === "executado" ? s.cartaoFeito : {}) }}
              onClick={() => it.status !== "executado" && setAtivo(it)}
            >
              <div style={s.cartaoTopo}>
                <span style={s.tumulo}>{it.tumulo}</span>
                {it.status === "executado" ? (
                  <span style={s.check}>✓ feito</span>
                ) : (
                  <span style={s.pendente}>toque para concluir</span>
                )}
              </div>
              {it.falecido && <div style={s.falecido}>{it.falecido}</div>}
            </button>
          ))}
        </section>
      ))}

      {ativo && (
        <Concluir
          item={ativo}
          onFechar={() => setAtivo(null)}
          onPronto={(offline: boolean) => {
            setAtivo(null);
            if (offline) setPendentes(lerFila().length);
            carregar();
          }}
        />
      )}
    </main>
  );
}

function agrupar(lista: Item[]): { quadra: string; itens: Item[] }[] {
  const m = new Map<string, Item[]>();
  for (const it of lista) {
    const arr = m.get(it.quadra) || [];
    arr.push(it);
    m.set(it.quadra, arr);
  }
  return [...m.entries()].map(([quadra, itens]) => ({ quadra, itens }));
}

// ---- modal de conclusão ----
function Concluir({
  item,
  onFechar,
  onPronto,
}: {
  item: Item;
  onFechar: () => void;
  onPronto: (offline: boolean) => void;
}) {
  const [antes, setAntes] = useState<{ b64: string; mt: string } | null>(null);
  const [depois, setDepois] = useState<{ b64: string; mt: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const refAntes = useRef<HTMLInputElement>(null);
  const refDepois = useRef<HTMLInputElement>(null);

  async function lerArquivo(f: File): Promise<{ b64: string; mt: string }> {
    const buf = await f.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return { b64: btoa(bin), mt: f.type || "image/jpeg" };
  }

  function pegarGps(): Promise<{ lat: number; lng: number } | null> {
    return new Promise((res) => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(
        (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => res(null),
        { timeout: 6000 }
      );
    });
  }

  async function concluir() {
    if (!depois) {
      setErro("A foto do depois é obrigatória.");
      return;
    }
    setEnviando(true);
    setErro("");
    const gps = await pegarGps();
    const modo = await concluirOuEnfileirar({
      servicoId: item.id,
      fotoDepoisBase64: depois.b64,
      fotoAntesBase64: antes?.b64,
      mimetype: depois.mt,
      lat: gps?.lat,
      lng: gps?.lng,
    });
    setEnviando(false);
    // online = subiu; offline = guardado no aparelho e sobe sozinho quando voltar o sinal.
    // Em ambos, a Nina segue em frente (o cemitério tem sinal ruim; travar não ajuda).
    onPronto(modo === "offline");
  }

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.modalTopo}>
          <strong style={{ fontSize: 20 }}>{item.tumulo}</strong>
          <button style={s.fechar} onClick={onFechar}>
            ✕
          </button>
        </div>
        <div style={s.modalSub}>
          Quadra {item.quadra}
          {item.falecido ? ` · ${item.falecido}` : ""}
        </div>

        {item.fotoReferencia && (
          <div>
            <div style={s.rotulo}>Confira se é este túmulo:</div>
            <img src={item.fotoReferencia} alt="referência" style={s.fotoRef} />
          </div>
        )}
        {(item.lat != null && item.lng != null) && (
          <a
            style={s.mapa}
            href={`https://www.google.com/maps?q=${item.lat},${item.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            📍 abrir no mapa
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

        <button style={{ ...s.fotoBtn, ...(antes ? s.fotoOk : {}) }} onClick={() => refAntes.current?.click()}>
          {antes ? "✓ Foto do antes" : "📷 Foto do antes (opcional)"}
        </button>
        <button style={{ ...s.fotoBtn, ...(depois ? s.fotoOk : {}) }} onClick={() => refDepois.current?.click()}>
          {depois ? "✓ Foto do depois" : "📷 Foto do depois"}
        </button>

        {erro && <p style={s.erro}>{erro}</p>}

        <button style={s.concluir} onClick={concluir} disabled={enviando}>
          {enviando ? "Enviando…" : "Concluir e enviar à família"}
        </button>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 520, margin: "0 auto", padding: 16, fontFamily: "system-ui", background: "#f8fafc", minHeight: "100vh" },
  faixaOffline: { background: "#fef3c7", border: "1px solid #fde68a", color: "#92400e", borderRadius: 10, padding: "10px 12px", fontSize: 14, marginBottom: 12, textAlign: "center" },
  topo: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  data: { fontSize: 14, color: "#64748b" },
  progresso: { fontSize: 22, fontWeight: 800, color: "#0f172a" },
  badge: { background: "#0f766e", color: "#fff", padding: "8px 14px", borderRadius: 999, fontWeight: 700 },
  barraFundo: { height: 10, background: "#e2e8f0", borderRadius: 999, overflow: "hidden", marginBottom: 16 },
  barraCheia: { height: "100%", background: "#0f766e", transition: "width .3s" },
  info: { textAlign: "center", color: "#64748b", padding: 24 },
  quadra: { fontSize: 15, color: "#475569", margin: "16px 0 8px", textTransform: "uppercase", letterSpacing: 1 },
  cartao: { width: "100%", textAlign: "left", background: "#fff", border: "2px solid #e2e8f0", borderRadius: 14, padding: 16, marginBottom: 10, cursor: "pointer" },
  cartaoFeito: { background: "#ecfdf5", borderColor: "#6ee7b7", opacity: 0.75 },
  cartaoTopo: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  tumulo: { fontSize: 20, fontWeight: 700, color: "#0f172a" },
  pendente: { fontSize: 13, color: "#0f766e", fontWeight: 600 },
  check: { fontSize: 15, color: "#059669", fontWeight: 700 },
  falecido: { fontSize: 15, color: "#64748b", marginTop: 4 },
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", display: "grid", placeItems: "end center", zIndex: 50 },
  modal: { width: "100%", maxWidth: 520, background: "#fff", borderRadius: "20px 20px 0 0", padding: 20, display: "flex", flexDirection: "column", gap: 12, maxHeight: "92vh", overflowY: "auto" },
  modalTopo: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  modalSub: { color: "#64748b", fontSize: 15, marginTop: -6 },
  fechar: { background: "none", border: "none", fontSize: 22, color: "#94a3b8" },
  rotulo: { fontSize: 14, color: "#475569", marginBottom: 6 },
  fotoRef: { width: "100%", borderRadius: 12, maxHeight: 220, objectFit: "cover" },
  mapa: { display: "block", textAlign: "center", padding: 12, background: "#eff6ff", color: "#1d4ed8", borderRadius: 12, fontWeight: 600, textDecoration: "none" },
  fotoBtn: { padding: 18, fontSize: 17, fontWeight: 600, borderRadius: 12, border: "2px dashed #cbd5e1", background: "#f8fafc", color: "#334155" },
  fotoOk: { borderStyle: "solid", borderColor: "#6ee7b7", background: "#ecfdf5", color: "#059669" },
  concluir: { padding: 20, fontSize: 20, fontWeight: 800, borderRadius: 14, border: "none", background: "#0f766e", color: "#fff", marginTop: 4 },
  erro: { color: "#dc2626", margin: 0 },
};
