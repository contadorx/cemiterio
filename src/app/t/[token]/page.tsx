"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

// Destino único do QR da plaqueta. Decide para onde levar conforme quem escaneou:
// equipe -> app de campo no túmulo certo; família -> portal com as fotos.
export default function ResolverQr() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;
  const [msg, setMsg] = useState("Abrindo…");

  useEffect(() => {
    if (!token) return;
    fetch(`/api/resolver-token?t=${encodeURIComponent(token)}`)
      .then((x) => x.json())
      .then((r) => {
        if (r.destino === "campo") {
          setMsg(`Abrindo ${r.identificacao || "o túmulo"}…`);
          const q = r.servicoId ? `?servico=${r.servicoId}` : `?tumulo=${r.tumuloId}`;
          router.replace(`/campo${q}`);
        } else if (r.destino === "familia") {
          router.replace(`/familia/${token}`);
        } else {
          setMsg("Este código não é válido.");
        }
      })
      .catch(() => setMsg("Não consegui abrir. Verifique a conexão."));
  }, [token, router]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui", color: "#0f172a", background: "#f7f3e9", padding: 20, textAlign: "center" }}>
      <p>{msg}</p>
    </div>
  );
}
