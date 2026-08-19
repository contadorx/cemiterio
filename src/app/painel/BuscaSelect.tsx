"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { painel, cor } from "./ui";

/**
 * ESCOLHER NUMA LISTA GRANDE.
 *
 * O `<select>` do navegador vira inútil passando de umas trinta opções: são
 * 298 famílias, e achar "Zulmira Molina" exige rolar uma lista que não filtra
 * nem mostra quantas existem.
 *
 * Aqui a pessoa digita e a lista estreita. Todos os termos precisam bater —
 * "rosa ike" acha "Rosa Ikehara" — porque com nomes parecidos um termo só não
 * separa nada.
 */
export default function BuscaSelect({
  valor, opcoes, aoEscolher, vazio = "— nenhum —", largura,
}: {
  valor: string;
  opcoes: { id: string; nome: string }[];
  aoEscolher: (id: string) => void;
  vazio?: string;
  largura?: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const caixa = useRef<HTMLDivElement | null>(null);

  const escolhido = opcoes.find((o) => o.id === valor);

  // Clicar fora fecha. Sem isto a lista fica aberta por cima do resto da tela
  // e a pessoa não sabe como sair sem escolher.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const filtradas = useMemo(() => {
    const termos = busca.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!termos.length) return opcoes.slice(0, 60);
    return opcoes
      .filter((o) => {
        const alvo = o.nome.toLowerCase();
        return termos.every((t) => alvo.includes(t));
      })
      .slice(0, 60);   // teto: rolar 300 resultados não ajuda ninguém
  }, [busca, opcoes]);

  return (
    <div ref={caixa} style={{ position: "relative", width: largura ? largura : "100%" }}>
      <button
        type="button"
        onClick={() => { setAberto((x) => !x); setBusca(""); }}
        style={{
          ...painel.input, margin: 0, textAlign: "left", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
        }}
      >
        <span style={{
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          color: escolhido ? "rgb(var(--zm-ink))" : cor.cinza,
        }}>
          {escolhido ? escolhido.nome : vazio}
        </span>
        <span style={{ color: cor.cinza, fontSize: 12 }}>▾</span>
      </button>

      {aberto && (
        <div style={{
          position: "absolute", zIndex: 40, top: "calc(100% + 4px)", left: 0, right: 0,
          background: cor.card, border: `1px solid ${cor.linha}`, borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,.16)", padding: 8, minWidth: 240,
        }}>
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Digite para achar…"
            style={{ ...painel.input, margin: 0, fontSize: 15 }}
          />

          <div style={{ maxHeight: 240, overflowY: "auto", marginTop: 6 }}>
            <button
              type="button"
              onClick={() => { aoEscolher(""); setAberto(false); }}
              style={itemEstilo(!valor)}
            >
              {vazio}
            </button>

            {filtradas.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { aoEscolher(o.id); setAberto(false); }}
                style={itemEstilo(o.id === valor)}
              >
                {o.nome}
              </button>
            ))}

            {!filtradas.length && (
              <p style={{ padding: "8px 6px", color: cor.cinza, fontSize: 14 }}>
                Nada com esse termo.
              </p>
            )}
          </div>

          {/* Dizer que há mais evita a pessoa concluir que o nome não existe. */}
          {opcoes.length > filtradas.length && (
            <p style={{ padding: "6px 6px 0", color: cor.cinza, fontSize: 12 }}>
              mostrando {filtradas.length} de {opcoes.length} — digite para estreitar
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const itemEstilo = (ativo: boolean): React.CSSProperties => ({
  display: "block", width: "100%", textAlign: "left", padding: "9px 10px",
  borderRadius: 8, border: "none", cursor: "pointer", fontSize: 15,
  background: ativo ? "rgb(var(--zm-brand-light))" : "transparent",
  color: "rgb(var(--zm-ink))",
});
