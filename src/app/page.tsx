import Link from "next/link";

import { MARCA } from "@/lib/marca";

export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", minHeight: "100vh", display: "grid", placeItems: "center", background: "#0f172a" }}>
      <div style={{ textAlign: "center", color: "#fff" }}>
        <h1 style={{ fontSize: 40, marginBottom: 4 }}>{MARCA.nome}</h1>
        <p style={{ fontSize: 15, opacity: 0.75, marginBottom: 24 }}>{MARCA.assinatura}</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/painel" style={{ padding: "16px 28px", background: "#0f766e", color: "#fff", borderRadius: 12, textDecoration: "none", fontWeight: 700 }}>
            Painel do dono
          </Link>
          <Link href="/campo" style={{ padding: "16px 28px", background: "#fff", color: "#0f172a", borderRadius: 12, textDecoration: "none", fontWeight: 700 }}>
            App de campo
          </Link>
        </div>
      </div>
    </main>
  );
}
