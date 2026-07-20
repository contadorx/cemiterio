"use client";

import Link from "next/link";
import { MARCA } from "@/lib/marca";
import { useState, useEffect } from "react";
import EstiloMobile from "./EstiloMobile";

export const cor = {
  navy: "#0f172a",
  teal: "#0f766e",
  bg: "#f1f5f9",
  card: "#ffffff",
  linha: "#e2e8f0",
  cinza: "#475569",   // mais escuro: o painel também é usado no sol
};

/**
 * O menu tem 12 itens — demais para uma lista corrida no celular.
 * Agrupado por o que se faz: o dia a dia primeiro, o resto depois.
 */
const GRUPOS: { titulo: string; itens: { href: string; label: string }[] }[] = [
  {
    titulo: "Dia a dia",
    itens: [
      { href: "/painel", label: "Início" },
      { href: "/painel/conversas", label: "Conversas" },
      { href: "/painel/agenda", label: "Agenda" },
      { href: "/campo", label: "📍 Campo" },
    ],
  },
  {
    titulo: "Carteira",
    itens: [
      { href: "/painel/clientes", label: "Famílias" },
      { href: "/painel/financeiro", label: "Financeiro" },
      { href: "/painel/reajustes", label: "Reajustes" },
      { href: "/painel/leads", label: "Leads" },
    ],
  },
  {
    titulo: "Ajustes",
    itens: [
      { href: "/painel/agente", label: "Agente" },
      { href: "/painel/whatsapp", label: "WhatsApp" },
      { href: "/painel/plaquetas", label: "Plaquetas" },
      { href: "/painel/config", label: "Config" },
    ],
  },
];

const ITENS = GRUPOS.flatMap((g) => g.itens);

// Faixa de aviso que aparece em TODAS as telas do painel enquanto os disparos
// automáticos estiverem desligados — para não esquecer que a IA não responde
// sozinha durante a migração/captura das quadras.
function AvisoDisparos() {
  const [ligado, setLigado] = useState<boolean | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/config/disparos")
      .then((r) => r.json())
      .then((j) => { if (vivo) setLigado(!!j?.ativo); })
      .catch(() => { if (vivo) setLigado(null); });
    return () => { vivo = false; };
  }, []);

  if (ligado !== false) return null; // só aparece quando está DESLIGADO

  return (
    <div style={{
      background: "#7f1d1d", color: "#fff", padding: "10px 16px",
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: 12, flexWrap: "wrap", fontSize: 14, textAlign: "center",
    }}>
      <span>⏸ <strong>Disparos automáticos desligados</strong> — a IA não responde sozinha e os avisos automáticos não saem.</span>
      <Link href="/painel/config" style={{
        color: "#7f1d1d", background: "#fff", fontWeight: 700, textDecoration: "none",
        padding: "5px 12px", borderRadius: 8, fontSize: 13, whiteSpace: "nowrap",
      }}>Ligar na Config</Link>
    </div>
  );
}

export function PainelNav({ atual }: { atual: string }) {
  const [aberto, setAberto] = useState(false);
  const atualLabel = ITENS.find((i) => i.href === atual)?.label || "Menu";

  return (
    <>
    <EstiloMobile />
    <nav style={nav.barra}>
      <div style={nav.topo}>
        <button
          onClick={async () => {
            if (!confirm("Sair do sistema?")) return;
            await fetch("/api/sair", { method: "POST" });
            location.href = "/login";
          }}
          style={nav.sair}
          title="Sair"
        >
          Sair
        </button>
        <span style={nav.marca}>
          {MARCA.nome}
          <span style={nav.assinatura}>{MARCA.assinatura}</span>
        </span>

        {/* botão só aparece no celular (via CSS) */}
        <button className="menuBotao" style={nav.botao} onClick={() => setAberto(!aberto)} aria-label="Menu">
          <span style={{ fontSize: 14, marginRight: 8 }}>{atualLabel}</span>
          {aberto ? "✕" : "☰"}
        </button>
      </div>

      <div className={`navLinks ${aberto ? "aberto" : ""}`} style={nav.links}>
        {GRUPOS.map((g) => (
          <div key={g.titulo} className="navGrupo" style={nav.grupo}>
            <span className="navGrupoTitulo" style={nav.grupoTitulo}>{g.titulo}</span>
            {(g.itens || []).map((i) => (
              <Link
                key={i.href}
                href={i.href}
                onClick={() => setAberto(false)}
                style={{ ...nav.link, ...(atual === i.href ? nav.ativo : {}) }}
              >
                {i.label}
              </Link>
            ))}
          </div>
        ))}
      </div>

      <style>{`
        .menuBotao { display: none; }
        @media (max-width: 820px) {
          .menuBotao { display: flex !important; align-items: center; }
          .navLinks { display: none !important; }
          .navLinks.aberto { display: flex !important; flex-direction: column; align-items: stretch; width: 100%; margin-top: 10px; }
          .navLinks.aberto a { padding: 15px 14px !important; font-size: 17px !important; min-height: 52px; display: flex; align-items: center; }
          .navLinks.aberto .navGrupo { display: block !important; margin-bottom: 6px; }
          .navLinks.aberto .navGrupoTitulo {
            display: block !important; font-size: 12px; text-transform: uppercase;
            letter-spacing: 1px; opacity: .6; padding: 12px 14px 4px;
          }
        }
      `}</style>
    </nav>
    <AvisoDisparos />
    </>
  );
}

const nav: Record<string, React.CSSProperties> = {
  barra: { display: "flex", flexDirection: "column", padding: "12px 16px", background: cor.navy, color: "#fff" },
  topo: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%" },
  assinatura: { display: "block", fontSize: 10, fontWeight: 400, opacity: 0.75, letterSpacing: 0.2, marginTop: 1 },
  sair: { float: "right", background: "rgba(255,255,255,.12)", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer" },
  grupo: { display: "contents" },
  grupoTitulo: { display: "none" },
  marca: { fontWeight: 800, fontSize: 20 },
  botao: { background: "rgba(255,255,255,.12)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 14px", fontSize: 18, cursor: "pointer" },
  links: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 },
  link: { color: "#cbd5e1", textDecoration: "none", padding: "8px 12px", borderRadius: 8, fontSize: 15, display: "block" },
  ativo: { background: "rgba(255,255,255,.15)", color: "#fff", fontWeight: 600 },
};

// Base comum a TODO botão: garante que <button>, <a> e <Link> estilizados como
// botão fiquem com a MESMA altura e o texto centralizado.
// - inline-flex + center: alinha o rótulo na vertical e faz o minHeight valer
//   (num <a> inline o minHeight era ignorado — era a causa dos botões "de
//   tamanhos distintos" quando um Link ficava ao lado de um <button>).
// - boxSizing border-box: o padding não muda a altura final.
// - textDecoration none: Link/<a> não vêm sublinhados.
const botaoBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  boxSizing: "border-box",
  lineHeight: 1.1,
  textDecoration: "none",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 600,
};

export const painel: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", background: cor.bg, fontFamily: "system-ui" },
  conteudo: { maxWidth: 900, margin: "0 auto", padding: 16 },
  h1: { fontSize: 23, color: cor.navy, margin: "8px 0 18px" },
  card: { background: cor.card, border: `1px solid ${cor.linha}`, borderRadius: 14, padding: 16, marginBottom: 14 },

  // ── Botões tamanho padrão (altura de toque confortável no celular, >= 48px) ──
  botao: { ...botaoBase, padding: "13px 20px", fontSize: 16, fontWeight: 700, border: "none", background: cor.teal, color: "#fff", minHeight: 48 },
  botaoSec: { ...botaoBase, padding: "13px 18px", fontSize: 15, border: `1px solid ${cor.linha}`, background: "#fff", color: cor.navy, minHeight: 48 },
  botaoPerigo: { ...botaoBase, padding: "13px 18px", fontSize: 15, border: "none", background: "#dc2626", color: "#fff", minHeight: 48 },

  // ── Botões compactos (linhas densas de ação: uma medida única, sem improviso) ──
  // Antes cada tela inventava um padding ("4px 10px", "6px 12px", "8px 14px"…);
  // agora é um só tamanho para todos os botões pequenos.
  botaoMini: { ...botaoBase, padding: "8px 14px", fontSize: 14, fontWeight: 700, border: "none", background: cor.teal, color: "#fff", minHeight: 40 },
  botaoMiniSec: { ...botaoBase, padding: "8px 14px", fontSize: 14, border: `1px solid ${cor.linha}`, background: "#fff", color: cor.navy, minHeight: 40 },
  botaoMiniPerigo: { ...botaoBase, padding: "8px 14px", fontSize: 14, border: "none", background: "#dc2626", color: "#fff", minHeight: 40 },

  // fontSize 16 evita o zoom automático do iOS ao focar o campo
  input: { width: "100%", padding: 12, fontSize: 16, borderRadius: 10, border: `1px solid ${cor.linha}`, boxSizing: "border-box" },
  rotulo: { fontSize: 14, fontWeight: 600, color: cor.cinza, marginBottom: 4, display: "block" },
};
