"use client";

/**
 * A FAIXA DE DISTÂNCIA na hora de confirmar o jazigo.
 *
 * O "É este jazigo?" tinha duas provas: o QR da plaqueta (que nem todo jazigo
 * tem) e a foto (que só funciona se a pessoa reparar). Faltava a terceira, que
 * é grátis e não depende de ninguém reparar em nada: o celular JÁ SABE onde
 * está. Se ela está a 80 m do jazigo que abriu, é quase certo que abriu o card
 * errado — e o momento de dizer isso é ANTES de começar a limpeza, não depois
 * da foto do fim.
 *
 * Ela nunca BLOQUEIA. Coordenada de jazigo pode estar velha ou ruim, e travar o
 * trabalho por causa de um GPS teimoso seria pior que o erro que evita. Ela
 * informa; quem decide é quem está lá.
 */

import { useEffect, useRef, useState } from "react";
import { distanciaMetros, distanciaBr, incerteza } from "@/lib/geo";

export default function DistanciaAoVivo({ lat, lng, precisao }: {
  lat: number | null; lng: number | null; precisao: number | null;
}) {
  const [d, setD] = useState<number | null>(null);
  const [margem, setMargem] = useState(0);
  const [estado, setEstado] = useState<"buscando" | "ok" | "sem">("buscando");
  const watch = useRef<number | null>(null);

  const temAlvo = lat != null && lng != null && isFinite(Number(lat)) && isFinite(Number(lng));

  useEffect(() => {
    if (!temAlvo || typeof navigator === "undefined" || !navigator.geolocation) {
      setEstado("sem");
      return;
    }
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        setD(distanciaMetros(p.coords.latitude, p.coords.longitude, Number(lat), Number(lng)));
        setMargem(incerteza(Number(p.coords.accuracy) || 30, precisao));
        setEstado("ok");
      },
      () => setEstado("sem"),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
    );
    return () => { if (watch.current != null) navigator.geolocation.clearWatch(watch.current); };
  }, [temAlvo, lat, lng, precisao]);

  if (!temAlvo) {
    return (
      <div style={{ ...f.faixa, ...f.neutra }}>
        Este jazigo não tem localização gravada — confira pela foto e pela plaqueta.
      </div>
    );
  }
  if (estado === "sem") return null;   // sem sinal, silêncio: nada a acrescentar
  if (estado === "buscando" || d == null) {
    return <div style={{ ...f.faixa, ...f.neutra }}>Conferindo sua distância até o jazigo…</div>;
  }

  const limite = Math.max(25, margem * 2);
  const longe = d > limite;

  return (
    <div style={{ ...f.faixa, ...(longe ? f.alerta : f.boa) }}>
      {longe
        ? <><b>Você está a {distanciaBr(d)} deste jazigo.</b> Confira se é o card certo — ou se a
            localização dele foi gravada errada.</>
        : <>Você está a {distanciaBr(d)} do ponto gravado (±{Math.round(margem)} m). Bate.</>}
    </div>
  );
}

const f: Record<string, React.CSSProperties> = {
  faixa: { fontSize: 16, lineHeight: 1.45, padding: "10px 12px", borderRadius: 10, margin: "10px 0" },
  neutra: { background: "#f1f5f9", color: "#475569" },
  boa: { background: "#f0fdf4", color: "#166534" },
  alerta: { background: "#fffbeb", color: "#92400e" },
};
