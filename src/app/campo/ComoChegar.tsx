"use client";

/**
 * COMO CHEGAR — a seta que leva até o jazigo.
 *
 * O QUE FALTAVA
 * ---------------------------------------------------------------------------
 * O card do campo já mostrava foto ("onde fica" e "o jazigo"). Foto resolve a
 * ÚLTIMA conferência — "é esta lápide?" — e não resolve a primeira pergunta,
 * que é "para que lado eu ando?". Num cemitério de corredores iguais, foto de
 * perto sem referência de terreno não localiza ninguém. A coordenada do jazigo
 * já vinha na agenda do dia (lat/lng/gpsPrecisao) e não era usada para nada.
 *
 * O QUE ESTA TELA FAZ
 * ---------------------------------------------------------------------------
 * Lê a posição do celular continuamente (watchPosition), calcula distância e
 * rumo até o jazigo e desenha uma seta. A seta é girada pela bússola quando o
 * aparelho tem uma; quando não tem, ela vira referência de NORTE e o texto diz
 * isso — seta sem bússola apontando como se fosse "para frente" manda a pessoa
 * para o lado errado com cara de certeza.
 *
 * HONESTIDADE DE DISTÂNCIA
 * ---------------------------------------------------------------------------
 * "12 m" é mentira quando a leitura tem ±15 m. A margem aparece junto e a
 * decisão de "chegou" usa distância + margem: perto do fim quem manda é a FOTO
 * da lápide, não o número. Isto está escrito na tela, não só aqui.
 */

import { useEffect, useRef, useState } from "react";
import { distanciaMetros, rumoGraus, anguloDaSeta, relogio, cardeal, distanciaBr, incerteza } from "@/lib/geo";

type Alvo = {
  tumulo: string;
  quadra: string;
  rua: string;
  numero: string;
  lat: number | null;
  lng: number | null;
  gpsPrecisao: number | null;
  fotoEnquadramento: string | null;
  fotoReferencia: string | null;
};

export default function ComoChegar({ alvo, onFechar }: { alvo: Alvo; onFechar: () => void }) {
  const [pos, setPos] = useState<{ lat: number; lng: number; prec: number; heading: number | null } | null>(null);
  const [erro, setErro] = useState("");
  const [bussola, setBussola] = useState<number | null>(null);
  const [pedindoBussola, setPedindoBussola] = useState(false);
  const watch = useRef<number | null>(null);

  const temAlvo = alvo.lat != null && alvo.lng != null && isFinite(Number(alvo.lat)) && isFinite(Number(alvo.lng));

  // ---- posição própria, contínua -------------------------------------------
  useEffect(() => {
    if (!temAlvo) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setErro("Este aparelho não dá a localização para o navegador.");
      return;
    }
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        setErro("");
        setPos({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          prec: Number(p.coords.accuracy) || 30,
          // heading do GPS só existe ANDANDO; parada, vem null ou NaN
          heading: p.coords.heading != null && isFinite(p.coords.heading) && (p.coords.speed || 0) > 0.5
            ? p.coords.heading : null,
        });
      },
      (e) => {
        setErro(
          e.code === 1
            ? "Você negou o acesso à localização. Libere nas permissões do navegador para a seta funcionar."
            : "Não consegui pegar o sinal do GPS. Saia de perto de paredes e de dentro do carro.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    return () => {
      if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    };
  }, [temAlvo]);

  // ---- bússola --------------------------------------------------------------
  // No iOS ela só liga depois de um toque (requestPermission). Por isso existe o
  // botão "Ligar a bússola": sem ele, o navegador ignora o pedido em silêncio e
  // a seta ficaria para sempre no modo norte, sem ninguém entender por quê.
  function ouvirBussola() {
    function ao(e: any) {
      const web = typeof e.webkitCompassHeading === "number" ? e.webkitCompassHeading : null;
      if (web != null && isFinite(web)) { setBussola(web); return; }
      if (e.absolute && typeof e.alpha === "number" && isFinite(e.alpha)) setBussola((360 - e.alpha) % 360);
    }
    window.addEventListener("deviceorientationabsolute", ao as any, true);
    window.addEventListener("deviceorientation", ao as any, true);
    return () => {
      window.removeEventListener("deviceorientationabsolute", ao as any, true);
      window.removeEventListener("deviceorientation", ao as any, true);
    };
  }

  useEffect(() => {
    const D: any = typeof window !== "undefined" ? (window as any).DeviceOrientationEvent : null;
    if (!D) return;
    if (typeof D.requestPermission === "function") { setPedindoBussola(true); return; }
    return ouvirBussola();
  }, []);

  async function ligarBussola() {
    const D: any = (window as any).DeviceOrientationEvent;
    try {
      const r = await D.requestPermission();
      if (r === "granted") { ouvirBussola(); setPedindoBussola(false); }
      else setPedindoBussola(false);
    } catch { setPedindoBussola(false); }
  }

  // ---- contas ---------------------------------------------------------------
  const local = [alvo.quadra, alvo.rua, alvo.numero ? `nº ${alvo.numero}` : null].filter(Boolean).join(" · ");
  const norte = bussola ?? pos?.heading ?? null;

  let d = 0, rumo = 0, margem = 0, angulo = 0;
  if (temAlvo && pos) {
    d = distanciaMetros(pos.lat, pos.lng, Number(alvo.lat), Number(alvo.lng));
    rumo = rumoGraus(pos.lat, pos.lng, Number(alvo.lat), Number(alvo.lng));
    margem = incerteza(pos.prec, alvo.gpsPrecisao);
    angulo = anguloDaSeta(rumo, norte);
  }

  // chegou = a margem já cobre a distância. Com ±18 m, "estou a 15 m" e "estou
  // em cima" são a mesma informação — e continuar mandando andar faria a pessoa
  // passar direto pelo jazigo atrás do número.
  const chegou = !!pos && d <= Math.max(6, margem);
  const perto = !!pos && !chegou && d <= 40;

  const mapaExterno = temAlvo ? `https://www.google.com/maps/search/?api=1&query=${alvo.lat},${alvo.lng}` : null;
  const foto = alvo.fotoEnquadramento || alvo.fotoReferencia;

  return (
    <div style={e.fundo} onClick={onFechar}>
      <div style={e.folha} onClick={(ev) => ev.stopPropagation()}>
        <div style={e.cabeca}>
          <div>
            <div style={e.rotulo}>{local || "sem local"}</div>
            <div style={e.titulo}>{alvo.tumulo}</div>
          </div>
          <button style={e.fechar} onClick={onFechar}>fechar</button>
        </div>

        {!temAlvo && (
          <div style={e.avisoForte}>
            <b>Este jazigo ainda não tem localização gravada.</b>
            <div style={{ marginTop: 6 }}>
              Não dá para apontar o caminho. Use as fotos e a quadra/rua para chegar — e, quando
              estiver em cima dele, marque a localização pelo <b>➕ Cadastrar jazigo</b>. A partir
              da próxima visita a seta funciona.
            </div>
          </div>
        )}

        {temAlvo && erro && <div style={e.avisoForte}>{erro}</div>}

        {temAlvo && !erro && !pos && (
          <div style={e.aviso}>Pegando o sinal do GPS… fique ao ar livre alguns segundos.</div>
        )}

        {temAlvo && pos && (
          <>
            <div style={e.bussolaCaixa}>
              <div style={{ ...e.seta, transform: `rotate(${angulo}deg)` }}>
                <svg viewBox="0 0 100 100" width="130" height="130" aria-hidden>
                  <circle cx="50" cy="50" r="47" fill="#f7f3e9" stroke="#e7e0cf" strokeWidth="3" />
                  <path d="M50 12 L74 82 L50 66 L26 82 Z" fill={chegou ? "#166534" : "#0f766e"} />
                </svg>
              </div>
              <div style={e.numeros}>
                <div style={e.distancia}>{chegou ? "chegou" : distanciaBr(d)}</div>
                <div style={e.margem}>margem de ±{Math.round(margem)} m</div>
                <div style={e.direcao}>
                  {norte != null
                    ? relogio(angulo)
                    : `para ${cardeal(rumo)} — a seta aponta pelo NORTE, não pela sua frente`}
                </div>
              </div>
            </div>

            <div style={{ ...e.instrucao, ...(chegou ? e.instrucaoChegou : {}) }}>
              {chegou
                ? "Você está em cima do ponto. Agora confira pela foto e pela lápide — daqui o GPS não distingue um jazigo do vizinho."
                : perto
                  ? "Está perto. Ande devagar olhando as lápides: a partir daqui a foto vale mais que o número."
                  : "Siga a seta. O número só fica confiável quando você estiver andando — parado, o celular chuta a direção."}
            </div>

            {norte == null && !pedindoBussola && (
              <div style={e.aviso}>
                Sem bússola neste aparelho. <b>Comece a andar</b>: com você em movimento a direção
                se corrige sozinha.
              </div>
            )}

            {pedindoBussola && (
              <button style={e.botaoSec} onClick={ligarBussola}>🧭 Ligar a bússola</button>
            )}

            {(alvo.gpsPrecisao != null && Number(alvo.gpsPrecisao) > 15) && (
              <div style={e.aviso}>
                A posição gravada deste jazigo é de baixa precisão (±{Math.round(Number(alvo.gpsPrecisao))} m).
                Ela melhora a cada vez que alguém marca a localização em cima dele.
              </div>
            )}
          </>
        )}

        {foto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="referência do jazigo" style={e.foto} />
        )}

        {mapaExterno && (
          <a href={mapaExterno} target="_blank" rel="noreferrer" style={e.botaoSec}>
            Abrir no mapa do celular
          </a>
        )}
      </div>
    </div>
  );
}

const NAVY = "#12284b";

const e: Record<string, React.CSSProperties> = {
  fundo: { position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", zIndex: 60,
           display: "flex", alignItems: "flex-end", justifyContent: "center" },
  folha: { background: "#fff", width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto",
           borderRadius: "18px 18px 0 0", padding: 18, fontFamily: "system-ui, sans-serif",
           color: "#0f172a" },
  cabeca: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  rotulo: { fontSize: 14, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5 },
  titulo: { fontSize: 21, fontWeight: 700, color: NAVY, marginTop: 2 },
  fechar: { minHeight: 44, background: "none", border: "2px solid #e7e0cf", color: "#475569",
            borderRadius: 10, padding: "8px 14px", fontSize: 15, cursor: "pointer" },
  bussolaCaixa: { display: "flex", alignItems: "center", gap: 16, marginTop: 16 },
  seta: { transition: "transform .25s ease-out", lineHeight: 0 },
  numeros: { flex: 1 },
  distancia: { fontSize: 38, fontWeight: 800, color: NAVY, lineHeight: 1.1 },
  margem: { fontSize: 15, color: "#475569", marginTop: 2 },
  direcao: { fontSize: 17, color: "#0f766e", fontWeight: 600, marginTop: 6, lineHeight: 1.3 },
  instrucao: { fontSize: 16, lineHeight: 1.45, color: "#334155", background: "#f1f5f9",
               padding: "12px 14px", borderRadius: 12, marginTop: 14 },
  instrucaoChegou: { background: "#f0fdf4", color: "#166534", fontWeight: 600 },
  aviso: { fontSize: 15, color: "#78350f", background: "#fffbeb", padding: "10px 12px",
           borderRadius: 10, marginTop: 12, lineHeight: 1.4 },
  avisoForte: { fontSize: 16, color: "#7f1d1d", background: "#fef2f2", padding: "12px 14px",
                borderRadius: 12, marginTop: 14, lineHeight: 1.45 },
  foto: { width: "100%", maxHeight: 240, objectFit: "cover", borderRadius: 12, marginTop: 14,
          border: "1px solid #e7e0cf", display: "block" },
  botaoSec: { display: "block", width: "100%", minHeight: 56, marginTop: 12, background: "#fff",
              color: NAVY, border: "2px solid #e7e0cf", borderRadius: 14, fontSize: 17,
              fontWeight: 600, cursor: "pointer", textAlign: "center", padding: "16px 18px",
              textDecoration: "none" },
};
