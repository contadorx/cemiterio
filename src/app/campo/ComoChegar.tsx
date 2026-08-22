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
 * O QUE VOLTOU DO CAMPO EM 22/08, E O QUE FOI FEITO
 * ---------------------------------------------------------------------------
 * "A navegação no campo foi bem ruim, as setas ficam malucas […] a diferença em
 * metros foi significativa e somente quando cheguei ele ajustou."
 *
 * Eram três defeitos, e nenhum deles era "o GPS é ruim":
 *
 *   1. A SETA GIRAVA PELO CAMINHO LONGO. O ângulo ia de 0 a 360 e a seta tem
 *      `transition: transform`. Ao cruzar o norte, 359° -> 1° é interpretado
 *      pelo navegador como girar 358° para trás. Uma tremida de dois graus
 *      virava uma volta quase inteira na tela. Defeito de CSS, não de sinal.
 *      Conserto: `desenrolarAngulo` mantém o ângulo contínuo.
 *
 *   2. A POSIÇÃO PODIA VIR VELHA. `maximumAge: 2000` autoriza o navegador a
 *      devolver uma leitura guardada, e no Android a primeira que chega é a de
 *      rede, dezenas de metros fora. Daí o número travado até a chegada.
 *      Conserto: `maximumAge: 0` e uma média das leituras recentes ponderada
 *      pela precisão de cada uma, descartando as muito piores que a melhor.
 *
 *   3. A SETA APONTAVA O RUÍDO QUANDO ELA ESTAVA PARADA. Sem bússola, a
 *      direção vinha do rumo do GPS; parada, esse rumo é a direção do erro.
 *      Conserto: com deslocamento abaixo do ruído a seta CONGELA e a tela diz
 *      por quê, em vez de girar com cara de quem sabe.
 *
 * E entrou o MAPA (`MapaAteOJazigo`), que foi o pedido dela. O mapa não depende
 * de bússola nenhuma: norte para cima, imagem aérea atrás, os dois pontos e a
 * distância. É a saída para o caso em que a seta, mesmo consertada, não tem
 * como saber para onde o aparelho aponta.
 *
 * HONESTIDADE DE DISTÂNCIA
 * ---------------------------------------------------------------------------
 * "12 m" é mentira quando a leitura tem ±15 m. A margem aparece junto e a
 * decisão de "chegou" usa distância + margem: perto do fim quem manda é a FOTO
 * da lápide, não o número. Isto está escrito na tela, não só aqui.
 */

import { useEffect, useRef, useState } from "react";
import {
  distanciaMetros, rumoGraus, anguloDaSeta, relogio, cardeal, distanciaBr, incerteza,
  desenrolarAngulo, leiturasValidas, mediaPonderada, deslocamentoNaJanela, type Leitura,
} from "@/lib/geo";
import MapaAteOJazigo from "./MapaAteOJazigo";

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

export default function ComoChegar({ alvo, onFechar, onComecar }: {
  alvo: Alvo;
  onFechar: () => void;
  /** Começar a limpeza sem fechar esta tela e procurar o botão no cartão. */
  onComecar?: () => void;
}) {
  const [pos, setPos] = useState<{ lat: number; lng: number; prec: number; heading: number | null } | null>(null);
  const [erro, setErro] = useState("");
  const [bussola, setBussola] = useState<number | null>(null);
  const [pedindoBussola, setPedindoBussola] = useState(false);
  const [mapa, setMapa] = useState(false);
  /** Quanto ela andou na janela recente — é o que diz se o rumo vale. */
  const [andou, setAndou] = useState(0);
  const watch = useRef<number | null>(null);
  /** As leituras cruas dos últimos segundos. Ref, não estado: elas chegam
      várias por segundo e não é cada uma que precisa repintar a tela. */
  const hist = useRef<Leitura[]>([]);
  /** O ângulo CONTÍNUO que vai para o CSS — pode passar de 360 ou ficar
      negativo, e é justamente isso que faz a animação pegar o lado curto. */
  const anguloRef = useRef<number>(NaN);

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
        const agora = Date.now();
        hist.current = [
          ...hist.current,
          {
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            prec: Number(p.coords.accuracy) || 30,
            em: agora,
          },
        ].slice(-24);

        // A POSIÇÃO QUE VAI PARA A TELA é a média das leituras que ainda valem,
        // ponderada pela precisão de cada uma. Sem isto, cada leitura crua
        // repintava a seta — e a 43 m com ±9 m de erro o rumo balança uns 12°
        // de graça, a cada segundo.
        const boas = leiturasValidas(hist.current, agora);
        const m = mediaPonderada(boas);
        if (!m) return;
        setAndou(deslocamentoNaJanela(boas));
        setPos({
          lat: m.lat,
          lng: m.lng,
          prec: m.prec,
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
      // maximumAge 0: leitura guardada não serve. Era ela que fazia o número
      // ficar parado em "43 m" enquanto a pessoa andava, e só destravar na
      // chegada, quando o GNSS finalmente entregava uma posição própria.
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    return () => {
      if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
      hist.current = [];
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

  // Abre o mapa sozinho na primeira leitura que mostre distância de caminhada.
  // Uma vez aberto ou fechado pela pessoa, a escolha dela manda — por isso o
  // efeito só age enquanto ninguém tocou (`decidiu`).
  const decidiu = useRef(false);
  useEffect(() => {
    if (decidiu.current || !pos || !temAlvo) return;
    const dd = distanciaMetros(pos.lat, pos.lng, Number(alvo.lat), Number(alvo.lng));
    if (dd > 25) { setMapa(true); decidiu.current = true; }
  }, [pos, temAlvo, alvo.lat, alvo.lng]);

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

  // A SETA CONGELA QUANDO NÃO HÁ O QUE APONTAR.
  //
  // Sem bússola, a direção sai do rumo do GPS — e parada, esse rumo é a direção
  // do próprio erro. O corte é o deslocamento da janela contra a precisão da
  // leitura: andar menos que a margem de erro não é andar, é tremer. Congelada,
  // a seta guarda a última direção boa e a tela diz que está congelada; girar
  // com cara de certeza é o que mandava a pessoa para o lado errado.
  const semReferencia = bussola == null;
  const parada = semReferencia && andou < Math.max(4, pos ? pos.prec * 0.8 : 8);
  const congelada = parada && isFinite(anguloRef.current);

  if (temAlvo && pos && !congelada) {
    // O ângulo que vai para o CSS é CONTÍNUO: 359° -> 1° vira 359° -> 361°, e a
    // animação percorre 2° em vez de 358° para trás. Este era o "seta maluca".
    anguloRef.current = desenrolarAngulo(anguloRef.current, angulo);
  }
  const anguloTela = isFinite(anguloRef.current) ? anguloRef.current : angulo;

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
              <div style={{ ...e.seta, transform: `rotate(${anguloTela}deg)`, opacity: congelada ? 0.5 : 1 }}>
                <svg viewBox="0 0 100 100" width="130" height="130" aria-hidden>
                  <circle cx="50" cy="50" r="47" fill="#f7f3e9" stroke="#e7e0cf" strokeWidth="3" />
                  <path d="M50 12 L74 82 L50 66 L26 82 Z" fill={chegou ? "#166534" : "#0f766e"} />
                </svg>
              </div>
              <div style={e.numeros}>
                <div style={e.distancia}>{chegou ? "chegou" : distanciaBr(d)}</div>
                <div style={e.margem}>margem de ±{Math.round(margem)} m</div>
                <div style={e.direcao}>
                  {congelada
                    ? "seta parada — comece a andar para ela se orientar"
                    : norte != null
                      ? relogio(angulo)
                      : `para ${cardeal(rumo)} — a seta aponta pelo NORTE, não pela sua frente`}
                </div>
              </div>
            </div>

            {/* O MAPA — o pedido dela, e a saída para quando a seta não tem
                referência. Fica aberto por padrão a partir de 25 m: é a
                distância em que "para que lado eu ando?" ainda é a pergunta.
                Chegando perto, a foto da lápide vale mais que qualquer mapa. */}
            <button style={e.botaoSec} onClick={() => { decidiu.current = true; setMapa((x) => !x); }}>
              {mapa ? "▾ Esconder o mapa" : "🗺️ Ver no mapa"}
            </button>

            {mapa && (
              <div style={{ marginTop: 10 }}>
                <MapaAteOJazigo
                  alvo={{ lat: Number(alvo.lat), lng: Number(alvo.lng) }}
                  eu={{ lat: pos.lat, lng: pos.lng }}
                  margem={margem}
                />
              </div>
            )}

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

        {/* COMEÇAR AQUI MESMO.
            Ela chegava no túmulo com esta tela aberta, fechava (1 toque) e
            procurava "▶ Começar" no cartão (mais 1). Em 15 jazigos são 30
            toques por dia só para sair de uma tela. O botão fica em destaque
            quando o GPS diz que chegou, e discreto antes disso — para ela não
            começar no jazigo errado por engano. */}
        {onComecar && (
          <button
            style={chegou ? e.botaoComecar : { ...e.botaoSec, marginTop: 12 }}
            onClick={onComecar}
          >
            ▶ Começar a limpeza deste jazigo
          </button>
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
  botaoComecar: { display: "block", width: "100%", minHeight: 64, marginTop: 14,
                  background: "#0f766e", color: "#fff", border: "none", borderRadius: 14,
                  fontSize: 18, fontWeight: 800, cursor: "pointer", padding: "18px 20px",
                  textAlign: "center" },
  botaoSec: { display: "block", width: "100%", minHeight: 56, marginTop: 12, background: "#fff",
              color: NAVY, border: "2px solid #e7e0cf", borderRadius: 14, fontSize: 17,
              fontWeight: 600, cursor: "pointer", textAlign: "center", padding: "16px 18px",
              textDecoration: "none" },
};
