"use client";

import { useCallback, useEffect, useState } from "react";
import { sincronizar, lerFila } from "@/lib/offline-fila";
import InstalarApp from "../InstalarApp";
import Assistente from "./Assistente";
import Materiais from "./Materiais";
import ConfirmarJazigo from "./ConfirmarJazigo";
import NaoDeu from "./NaoDeu";
import Concluir from "./Concluir";

interface Aviso { tipo: string; texto: string }

interface Item {
  id: string;
  tumuloId: string;
  status: string;
  ordem: number | null;
  tumulo: string;
  quadra: string;
  rua: string;
  numero: string;
  falecido: string | null;
  cliente: string | null;
  lat: number | null;
  lng: number | null;
  gpsPrecisao: number | null;
  gpsAmostras: number;
  qrToken: string | null;
  fotoReferencia: string | null;
  fotoEnquadramento: string | null;
  iniciadoEm: string | null;
  adiadoVezes: number;
  avisos: Aviso[];
}

export default function Campo() {
  const [lista, setLista] = useState<Item[]>([]);
  const [brief, setBrief] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [online, setOnline] = useState(true);
  const [pendentes, setPendentes] = useState(0);

  const [confirmando, setConfirmando] = useState<Item | null>(null);
  const [finalizando, setFinalizando] = useState<Item | null>(null);
  const [naoDeu, setNaoDeu] = useState<Item | null>(null);
  const [pedirMaterial, setPedirMaterial] = useState(false);
  const [iniciando, setIniciando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([
      fetch("/api/agenda/dia").then((x) => x.json()).catch(() => null),
      fetch("/api/campo/briefing").then((x) => x.json()).catch(() => null),
    ]);
    if (a?.ok) setLista(Array.isArray(a.lista) ? a.lista : []);
    if (b?.ok) setBrief(b.briefing);
    try { setPendentes(lerFila().length); } catch { /* sem localStorage */ }
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    const ligou = () => { setOnline(true); sincronizar().then(() => carregar()).catch(() => null); };
    const caiu = () => setOnline(false);
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    window.addEventListener("online", ligou);
    window.addEventListener("offline", caiu);
    return () => { window.removeEventListener("online", ligou); window.removeEventListener("offline", caiu); };
  }, [carregar]);

  // aberto pelo QR da plaqueta: /t/TOKEN manda para cá com ?servico=ID
  useEffect(() => {
    if (!lista.length) return;
    const id = new URLSearchParams(window.location.search).get("servico");
    if (!id) return;
    const it = lista.find((x) => x.id === id);
    if (it && it.status !== "executado") {
      it.iniciadoEm ? setFinalizando(it) : setConfirmando(it);
    }
  }, [lista]);

  async function iniciar(it: Item) {
    setIniciando(it.id);
    const r = await fetch("/api/campo/iniciar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servicoId: it.id }),
    }).then((x) => x.json()).catch(() => null);
    setIniciando(null);
    if (r?.ok) carregar();
    else alert("Não consegui registrar o começo. Tente de novo.");
  }

  const pendentesLista = lista.filter((x) => x.status !== "executado");
  const feitos = lista.filter((x) => x.status === "executado").length;
  const total = lista.length;

  // agrupa por quadra e rua — é assim que se anda no cemitério
  const grupos = new Map<string, Item[]>();
  for (const it of pendentesLista) {
    const chave = [it.quadra, it.rua].filter(Boolean).join(" · ") || "Sem local";
    grupos.set(chave, [...(grupos.get(chave) || []), it]);
  }

  if (carregando) return <div style={s.centro}>Carregando…</div>;

  return (
    <main style={s.wrap}>
      {(!online || pendentes > 0) && (
        <div style={s.faixaOffline}>
          {!online && "Sem internet. Pode continuar — eu guardo e mando depois."}
          {pendentes > 0 && ` ${pendentes} esperando para enviar.`}
        </div>
      )}

      <div style={s.topo}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={s.saudacao}>{brief?.saudacao || "Olá!"}</div>
          <button style={s.sair} onClick={async () => {
            if (!confirm("Sair?")) return;
            await fetch("/api/sair", { method: "POST" });
            location.href = "/login";
          }}>Sair</button>
        </div>

        <div style={s.resumo}>
          {pendentesLista.length === 0
            ? "Tudo feito por hoje. Obrigada! 🌿"
            : <>Hoje são <b>{pendentesLista.length}</b> {pendentesLista.length === 1 ? "jazigo" : "jazigos"}.</>}
        </div>

        {brief?.precisamAtencao > 0 && (
          <div style={s.atencao}>
            {brief.precisamAtencao === 1
              ? "1 deles pede uma atenção especial — está marcado na lista."
              : `${brief.precisamAtencao} deles pedem atenção especial — estão marcados na lista.`}
          </div>
        )}

        {total > 0 && (
          <>
            <div style={s.barra}>
              <div style={{ ...s.barraCheia, width: `${(feitos / total) * 100}%` }} />
            </div>
            <div style={s.contagem}>{feitos} de {total} prontos</div>
          </>
        )}
      </div>

      <InstalarApp contexto="campo" />
      <Assistente onMudou={carregar} />

      <button style={s.botaoMaterial} onClick={() => setPedirMaterial(true)}>
        🧴 Pedir material que está faltando
      </button>

      {[...grupos.entries()].map(([local, itens]) => (
        <section key={local}>
          <div style={s.tituloRua}>{local}</div>
          {itens.map((it) => (
            <Card
              key={it.id}
              it={it}
              ocupado={iniciando === it.id}
              onIniciar={() => setConfirmando(it)}
              onFinalizar={() => setFinalizando(it)}
              onNaoDeu={() => setNaoDeu(it)}
            />
          ))}
        </section>
      ))}

      {feitos > 0 && (
        <div style={s.feitosBox}>
          ✓ {feitos} {feitos === 1 ? "jazigo cuidado" : "jazigos cuidados"} hoje
        </div>
      )}

      {confirmando && (
        <ConfirmarJazigo
          servicoId={confirmando.id}
          jazigo={confirmando.falecido || confirmando.tumulo}
          tokenEsperado={confirmando.qrToken}
          fotoReferencia={confirmando.fotoEnquadramento || confirmando.fotoReferencia}
          onFechar={() => setConfirmando(null)}
          onConfirmado={() => { const it = confirmando; setConfirmando(null); if (it) iniciar(it); }}
        />
      )}

      {finalizando && (
        <Concluir
          item={finalizando}
          onFechar={() => setFinalizando(null)}
          onPronto={(offline: boolean) => {
            setFinalizando(null);
            if (offline) { try { setPendentes(lerFila().length); } catch {} }
            carregar();
          }}
        />
      )}

      {naoDeu && (
        <NaoDeu it={naoDeu} onFechar={() => setNaoDeu(null)}
                onPronto={() => { setNaoDeu(null); carregar(); }} />
      )}

      {pedirMaterial && <Materiais onFechar={() => setPedirMaterial(false)} />}
    </main>
  );
}

/** Card de um jazigo: local, nome, avisos e a ação do momento. */
function Card({ it, ocupado, onIniciar, onFinalizar, onNaoDeu }: {
  it: Item; ocupado: boolean;
  onIniciar: () => void; onFinalizar: () => void; onNaoDeu: () => void;
}) {
  const emAndamento = !!it.iniciadoEm;
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    if (!emAndamento) return;
    const t = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(t);
  }, [emAndamento]);

  const minutos = emAndamento && it.iniciadoEm
    ? Math.max(0, Math.round((agora - new Date(it.iniciadoEm).getTime()) / 60000))
    : 0;

  const local = [it.quadra, it.rua, it.numero ? `nº ${it.numero}` : null]
    .filter(Boolean).join(" · ");

  return (
    <div style={{ ...s.cartao, ...(emAndamento ? s.cartaoAtivo : {}) }}>
      <div style={s.local}>{local || "sem local"}</div>
      <div style={s.nome}>{it.falecido || it.tumulo}</div>
      {it.falecido && <div style={s.jazigo}>{it.tumulo}</div>}

      {(it.avisos || []).map((a, i) => (
        <div key={i} style={{ ...s.aviso, ...(a.tipo === "adiado" ? s.avisoUrgente : {}) }}>
          {a.tipo === "memoria" ? "🌷" : a.tipo === "adiado" ? "⏰" : "📷"} {a.texto}
        </div>
      ))}

      {emAndamento && (
        <div style={s.cronometro}>
          Em andamento há {minutos < 1 ? "menos de 1 minuto" : `${minutos} min`}
        </div>
      )}

      <div style={s.acoes}>
        {emAndamento ? (
          <button style={s.botaoPrincipal} onClick={onFinalizar}>📸 Finalizar com a foto</button>
        ) : (
          <button style={s.botaoPrincipal} onClick={onIniciar} disabled={ocupado}>
            {ocupado ? "…" : "▶ Começar"}
          </button>
        )}
        <button style={s.botaoNaoDeu} onClick={onNaoDeu}>Não deu</button>
      </div>
    </div>
  );
}

const NAVY = "#12284b";
const TEAL = "#0f766e";

const s: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 560, margin: "0 auto", padding: 16, paddingBottom: 60,
          background: "#f7f3e9", minHeight: "100vh", fontFamily: "system-ui, sans-serif",
          fontSize: 17, color: "#0f172a" },
  centro: { padding: 40, textAlign: "center", color: "#475569", fontSize: 17,
            fontFamily: "system-ui, sans-serif" },
  faixaOffline: { background: "#fef3c7", color: "#78350f", padding: 14, borderRadius: 12,
                  marginBottom: 14, fontSize: 16, lineHeight: 1.5 },
  topo: { background: "#fff", borderRadius: 16, padding: 18, marginBottom: 14 },
  saudacao: { fontSize: 22, fontWeight: 700, color: NAVY },
  sair: { minHeight: 44, background: "none", border: "2px solid #e7e0cf", color: "#475569",
          borderRadius: 10, padding: "8px 14px", fontSize: 15, cursor: "pointer" },
  resumo: { fontSize: 18, color: "#334155", marginTop: 8 },
  atencao: { fontSize: 16, color: "#92400e", background: "#fffbeb", padding: "10px 12px",
             borderRadius: 10, marginTop: 12, lineHeight: 1.4 },
  barra: { height: 8, background: "#e2e8f0", borderRadius: 4, marginTop: 14, overflow: "hidden" },
  barraCheia: { height: "100%", background: TEAL, transition: "width .3s" },
  contagem: { fontSize: 15, color: "#475569", marginTop: 6 },
  botaoMaterial: { width: "100%", minHeight: 60, padding: 18, background: "#fff", color: NAVY,
                   border: "2px solid #e7e0cf", borderRadius: 14, fontSize: 17, fontWeight: 600,
                   cursor: "pointer", marginBottom: 16 },
  tituloRua: { fontSize: 14, fontWeight: 700, color: "#c6a15b", textTransform: "uppercase",
               letterSpacing: 1, margin: "20px 0 10px" },
  cartao: { background: "#fff", borderRadius: 16, padding: 18, marginBottom: 14,
            border: "1px solid #e7e0cf" },
  cartaoAtivo: { border: `2px solid ${TEAL}`, background: "#f0fdfa" },
  local: { fontSize: 14, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5 },
  nome: { fontSize: 20, fontWeight: 700, color: NAVY, marginTop: 3 },
  jazigo: { fontSize: 16, color: "#475569" },
  aviso: { fontSize: 16, color: "#92400e", background: "#fffbeb", padding: "10px 12px",
           borderRadius: 10, marginTop: 10, lineHeight: 1.4 },
  avisoUrgente: { color: "#991b1b", background: "#fef2f2" },
  cronometro: { fontSize: 16, color: TEAL, fontWeight: 600, marginTop: 12 },
  acoes: { display: "flex", gap: 12, marginTop: 16 },
  botaoPrincipal: { flex: 1, minHeight: 64, padding: "18px 20px", background: TEAL, color: "#fff",
                    border: "none", borderRadius: 14, fontSize: 18, fontWeight: 700, cursor: "pointer" },
  botaoNaoDeu: { minHeight: 64, padding: "18px 22px", background: "#fff", color: "#475569",
                 border: "2px solid #e7e0cf", borderRadius: 14, fontSize: 16, cursor: "pointer" },
  feitosBox: { background: "#f0fdf4", color: "#166534", padding: 18, borderRadius: 14,
               textAlign: "center", fontSize: 17, fontWeight: 600, marginTop: 20 },
};
