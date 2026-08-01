"use client";

import { useEffect, useRef, useState } from "react";
import { prepararFoto, motivoFalha, type FotoPronta } from "@/lib/foto";

/**
 * Confirmação de que a ajudante está no jazigo certo — e a FOTO DO ANTES.
 *
 * O QR da plaqueta é o jeito mais seguro de confirmar — mas ela PODE seguir sem,
 * porque a plaqueta pode ter caído, sujado ou o jazigo ainda não ter uma.
 *
 * A foto do "antes" era pedida lá no fim, junto da foto do depois, e marcada
 * como opcional: na prática nunca era tirada, porque no fim o jazigo já está
 * limpo. Agora ela é o caminho natural do "Começar" — o botão principal é
 * tirar a foto. Seguir sem foto continua possível (câmera falha, mão suja),
 * mas virou a exceção, escrita em letra pequena.
 */
export default function ConfirmarJazigo({
  servicoId, jazigo, tokenEsperado, fotoReferencia, onConfirmado, onFechar,
}: {
  servicoId: string;
  jazigo: string;
  tokenEsperado: string | null;
  fotoReferencia: string | null;
  onConfirmado: (foto: FotoPronta | null, comoConfirmou: "qr" | "visual") => void;
  onFechar: () => void;
}) {
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState("");
  const [antes, setAntes] = useState<FotoPronta | null>(null);
  const refAntes = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  async function lerQr() {
    setErro("");
    // BarcodeDetector existe no Chrome Android; sem ele, cai na confirmação visual
    const Detector = (window as any).BarcodeDetector;
    if (!Detector) {
      setErro("Este celular não lê QR pela câmera. Confira pela foto abaixo.");
      return;
    }
    try {
      setLendo(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new Detector({ formats: ["qr_code"] });
      const tentar = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codigos = await detector.detect(videoRef.current);
          if (codigos.length) {
            const valor = String(codigos[0].rawValue || "");
            streamRef.current.getTracks().forEach((t) => t.stop());
            setLendo(false);
            if (tokenEsperado && valor.includes(tokenEsperado)) onConfirmado(antes, "qr");
            else setErro("Esse QR é de outro jazigo. Confira se está no lugar certo.");
            return;
          }
        } catch { /* segue tentando */ }
        requestAnimationFrame(tentar);
      };
      tentar();
    } catch {
      setLendo(false);
      setErro("Não consegui abrir a câmera. Confira pela foto abaixo.");
    }
  }

  return (
    <div style={s.overlay}>
      <div style={s.caixa}>
        <div style={s.topo}>
          <strong style={{ fontSize: 18 }}>É este jazigo?</strong>
          <button style={s.fechar} onClick={onFechar}>✕</button>
        </div>
        <p style={s.nome}>{jazigo}</p>

        {lendo ? (
          <>
            <video ref={videoRef} style={s.video} muted playsInline />
            <p style={s.dica}>Aponte para a plaqueta do jazigo.</p>
          </>
        ) : (
          <>
            {tokenEsperado && (
              <button style={s.botaoQr} onClick={lerQr}>📷 Ler o QR da plaqueta</button>
            )}
            {!tokenEsperado && (
              <p style={s.dica}>Este jazigo ainda não tem plaqueta. Confira pela foto.</p>
            )}
          </>
        )}

        {erro && <p style={s.erro}>{erro}</p>}

        {fotoReferencia && (
          <div style={{ marginTop: 12 }}>
            <p style={s.dica}>Foto de referência:</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fotoReferencia} alt="referência" style={s.foto} />
          </div>
        )}

        <input
          ref={refAntes}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setErro("");
            try {
              setAntes(await prepararFoto(f));
            } catch (err) {
              setErro(motivoFalha(err));
            }
          }}
        />

        {antes && (
          <div style={{ marginTop: 14 }}>
            <p style={s.dica}>Foto do antes:</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={antes.previa} alt="antes" style={s.foto} />
          </div>
        )}

        <button
          style={{ ...s.botaoSeguir, ...(antes ? s.botaoOk : {}) }}
          onClick={() => (antes ? onConfirmado(antes, "visual") : refAntes.current?.click())}
        >
          {antes ? "Começar a limpeza" : "📷 Tirar a foto do antes e começar"}
        </button>

        {antes ? (
          <button style={s.botaoRefazer} onClick={() => refAntes.current?.click()}>
            Tirar outra
          </button>
        ) : (
          <button style={s.botaoSemFoto} onClick={() => onConfirmado(null, "visual")}>
            Começar sem a foto
          </button>
        )}

        <p style={s.rodape}>
          A foto do antes é o par da foto do fim — é ela que mostra à família o
          trabalho que foi feito. Se a plaqueta estiver faltando ou suja, pode
          seguir assim mesmo.
        </p>
      </div>
    </div>
  );
}

const TEAL = "#0f766e";
const s: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.7)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 70 },
  caixa: { background: "#fff", width: "100%", maxWidth: 520, borderRadius: "16px 16px 0 0", padding: 18, maxHeight: "92vh", overflowY: "auto" },
  topo: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  fechar: { background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#475569" },
  nome: { fontSize: 20, fontWeight: 700, color: "#12284b", margin: "4px 0 14px" },
  dica: { color: "#475569", fontSize: 18, margin: "8px 0" },
  erro: { color: "#dc2626", fontSize: 18, margin: "10px 0", fontWeight: 600 },
  video: { width: "100%", borderRadius: 12, background: "#000", maxHeight: 280, objectFit: "cover" },
  foto: { width: "100%", borderRadius: 12, maxHeight: 220, objectFit: "cover" },
  botaoQr: { width: "100%", minHeight: 60, padding: 17, background: "#12284b", color: "#fff", border: "none", borderRadius: 14, fontSize: 18, fontWeight: 700, cursor: "pointer" },
  botaoSeguir: { width: "100%", minHeight: 60, padding: 17, background: TEAL, color: "#fff", border: "none", borderRadius: 14, fontSize: 18, fontWeight: 700, cursor: "pointer", marginTop: 14 },
  botaoOk: { background: "#166534" },
  botaoSemFoto: { width: "100%", minHeight: 50, padding: 12, background: "none", border: "none", color: "#475569", fontSize: 16, textDecoration: "underline", cursor: "pointer", marginTop: 10 },
  botaoRefazer: { width: "100%", minHeight: 50, padding: 12, background: "#fff", border: "2px solid #e7e0cf", color: "#475569", borderRadius: 12, fontSize: 16, cursor: "pointer", marginTop: 10 },
  rodape: { color: "#475569", fontSize: 18, textAlign: "center", marginTop: 8 },
};
