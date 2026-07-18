"use client";

import Link from "next/link";

export const cor = {
  navy: "#0f172a",
  teal: "#0f766e",
  bg: "#f1f5f9",
  card: "#ffffff",
  linha: "#e2e8f0",
  cinza: "#64748b",
};

export function PainelNav({ atual }: { atual: string }) {
  const itens = [
    { href: "/painel", label: "Início" },
    { href: "/painel/conversas", label: "Conversas" },
    { href: "/painel/agenda", label: "Agenda" },
    { href: "/painel/financeiro", label: "Financeiro" },
    { href: "/painel/clientes", label: "Clientes" },
    { href: "/painel/leads", label: "Leads" },
    { href: "/painel/reajustes", label: "Reajustes" },
    { href: "/painel/agente", label: "Agente" },
    { href: "/painel/whatsapp", label: "WhatsApp" },
    { href: "/painel/config", label: "Config" },
  ];
  return (
    <nav style={nav.barra}>
      <span style={nav.marca}>Sureya</span>
      <div style={nav.links}>
        {itens.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            style={{ ...nav.link, ...(atual === i.href ? nav.ativo : {}) }}
          >
            {i.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

const nav: Record<string, React.CSSProperties> = {
  barra: { display: "flex", alignItems: "center", gap: 20, padding: "14px 20px", background: cor.navy, color: "#fff", flexWrap: "wrap" },
  marca: { fontWeight: 800, fontSize: 20 },
  links: { display: "flex", gap: 8, flexWrap: "wrap" },
  link: { color: "#cbd5e1", textDecoration: "none", padding: "6px 12px", borderRadius: 8, fontSize: 15 },
  ativo: { background: "rgba(255,255,255,.15)", color: "#fff", fontWeight: 600 },
};

export const painel: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", background: cor.bg, fontFamily: "system-ui" },
  conteudo: { maxWidth: 900, margin: "0 auto", padding: 20 },
  h1: { fontSize: 24, color: cor.navy, margin: "8px 0 20px" },
  card: { background: cor.card, border: `1px solid ${cor.linha}`, borderRadius: 14, padding: 18, marginBottom: 14 },
  botao: { padding: "12px 18px", fontSize: 15, fontWeight: 700, borderRadius: 10, border: "none", background: cor.teal, color: "#fff", cursor: "pointer" },
  botaoSec: { padding: "10px 16px", fontSize: 14, fontWeight: 600, borderRadius: 10, border: `1px solid ${cor.linha}`, background: "#fff", color: cor.navy, cursor: "pointer" },
  botaoPerigo: { padding: "10px 16px", fontSize: 14, fontWeight: 600, borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", cursor: "pointer" },
  input: { width: "100%", padding: 12, fontSize: 15, borderRadius: 10, border: `1px solid ${cor.linha}`, boxSizing: "border-box" },
  rotulo: { fontSize: 13, color: cor.cinza, marginBottom: 4, display: "block" },
};
