"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Confirmação de que a ajudante está no jazigo certo.
 * O QR da plaqueta é o jeito mais seguro — mas ela PODE seguir sem, porque a
 * plaqueta pode ter caído, sujado ou o jazigo ainda não ter uma.
 */
export default function ConfirmarJazigo({
  servicoId, jazigo, tokenEsperado, fotoReferencia, onConfirmado, onFechar,
}: {
  servicoId: string;
  jazigo: string;
  tokenEsperado: string | null;
  fotoReferencia: string | null;
  onConfirmado: (comoConfirmou: "qr" | "visual") => void;
  onFechar: () => void;
}) {
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState("");
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
            if (tokenEsperado && valor.includes(tokenEsperado)) onConfirmado("qr");
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

        <button style={s.botaoSeguir} onClick={() => onConfirmado("visual")}>
          Sim, é este — seguir
        </button>
        <p style={s.rodape}>
          Se a plaqueta estiver faltando ou suja, pode seguir assim mesmo.
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
  fechar: { background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#64748b" },
  nome: { fontSize: 20, fontWeight: 700, color: "#12284b", margin: "4px 0 14px" },
  dica: { color: "#64748b", fontSize: 14, margin: "8px 0" },
  erro: { color: "#dc2626", fontSize: 14, margin: "10px 0", fontWeight: 600 },
  video: { width: "100%", borderRadius: 12, background: "#000", maxHeight: 280, objectFit: "cover" },
  foto: { width: "100%", borderRadius: 12, maxHeight: 220, objectFit: "cover" },
  botaoQr: { width: "100%", padding: 15, background: "#12284b", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer" },
  botaoSeguir: { width: "100%", padding: 15, background: TEAL, color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 14 },
  rodape: { color: "#94a3b8", fontSize: 12, textAlign: "center", marginTop: 8 },
};
