"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PainelNav, painel, cor } from "./ui";
import InstalarApp from "../InstalarApp";
import { PedidosAdicionais } from "./PedidosAdicionais";

/**
 * O MÊS — a tela inicial.
 *
 * Responde de cima para baixo a única pergunta que importa no dia a dia:
 * QUEM FOI LIMPO E QUEM PAGOU.
 *
 * O que havia aqui antes: capacidade do dia, rascunhos da IA para aprovar,
 * leads novos do site e indicadores de gestão. Números de um sistema que saiu
 * de escopo — e nenhum deles dizia se o mês estava fechando.
 *
 * As pendências sobem: quem está devendo E sem limpeza aparece primeiro. Assim
 * a tela serve sem precisar rolar.
 */

const MESES = ["janeiro","fevereiro","março","abril","maio","junho",
               "julho","agosto","setembro","outubro","novembro","dezembro"];

const dinheiro = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function Painel() {
  const [competencia, setCompetencia] = useState(competenciaAtual);
  const [dados, setDados] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<"todas" | "pendentes">("pendentes");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/mes?competencia=${competencia}`).then((x) => x.json());
      if (r?.ok) setDados(r);
    } finally {
      setCarregando(false);
    }
  }, [competencia]);

  useEffect(() => { carregar(); }, [carregar]);

  const linhas = (dados?.linhas || []).filter((l: any) =>
    filtro === "todas" ? true : !l.limpezaOk || !l.pagamentoOk
  );

  const r = dados?.resumo;
  const mesNome = `${MESES[Number(competencia.slice(5, 7)) - 1]} de ${competencia.slice(0, 4)}`;

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel" />
      <div style={painel.conteudo}>
        <InstalarApp />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <h1 style={painel.h1}>O mês</h1>
          <input
            type="month"
            style={{ ...painel.input, width: "auto" }}
            value={competencia.slice(0, 7)}
            onChange={(e) => setCompetencia(`${e.target.value}-01`)}
          />
        </div>

        {/* O RESUMO EM UMA LINHA. Três números: o que falta fazer, o que falta
            entrar, e quanto isso soma. Nada além disso no topo. */}
        {r && (
          <div style={{ ...painel.card, background: cor.navy, marginBottom: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 12 }}>
              <div>
                <div style={{ fontSize: 30, fontWeight: 800, color: r.faltaLimpar ? "#fbbf24" : "#4ade80" }}>
                  {r.faltaLimpar}
                </div>
                <div style={{ color: "#cbd5e1", fontSize: 14 }}>falta limpar</div>
              </div>
              <div>
                <div style={{ fontSize: 30, fontWeight: 800, color: r.faltaPagar ? "#fbbf24" : "#4ade80" }}>
                  {r.faltaPagar}
                </div>
                <div style={{ color: "#cbd5e1", fontSize: 14 }}>falta pagar</div>
              </div>
              <Link href="/painel/financeiro" style={{ textDecoration: "none" }}>
                <div style={{ fontSize: 30, fontWeight: 800, color: "#fff" }}>
                  {dinheiro(r.emAberto)}
                </div>
                <div style={{ color: "#cbd5e1", fontSize: 14 }}>em aberto &rarr;</div>
              </Link>
            </div>
          </div>
        )}

        <PedidosAdicionais />

        <Rotinas />

        <div style={{ display: "flex", gap: 8, margin: "4px 0 12px", flexWrap: "wrap" }}>
          <button style={filtro === "pendentes" ? painel.botaoMini : painel.botaoMiniSec}
                  onClick={() => setFiltro("pendentes")}>
            Só as pendentes
          </button>
          <button style={filtro === "todas" ? painel.botaoMini : painel.botaoMiniSec}
                  onClick={() => setFiltro("todas")}>
            Todas as famílias
          </button>
        </div>

        {carregando && <p style={{ color: cor.cinza }}>Carregando {mesNome}…</p>}

        {!carregando && linhas.length === 0 && (
          <div style={painel.card}>
            <strong style={{ color: "#16a34a", fontSize: 18 }}>
              {filtro === "pendentes"
                ? "Nenhuma pendência neste mês. 🌿"
                : "Nenhuma família cadastrada ainda."}
            </strong>
            {filtro === "pendentes" && (
              <p style={{ color: cor.cinza, marginTop: 6 }}>
                Todas limpas e todas em dia em {mesNome}.
              </p>
            )}
          </div>
        )}

        {linhas.map((l: any) => (
          <Link
            key={l.familiaId}
            href={`/painel/clientes?familia=${l.familiaId}`}
            style={{ ...painel.card, textDecoration: "none", display: "block", marginBottom: 8 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ minWidth: 160, flex: 1 }}>
                <div style={{ fontWeight: 700, color: cor.navy, fontSize: 17 }}>{l.nome}</div>
                {l.local && <div style={{ fontSize: 13, color: cor.cinza }}>{l.local}</div>}
              </div>

              {/* As duas colunas que dão nome à tela. Escritas por extenso: um
                  ✓ e um ✗ sozinhos exigiriam decorar qual é qual. */}
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: cor.cinza }}>limpeza</div>
                  <div style={{ fontWeight: 700, color: l.semPlano ? cor.cinza : l.limpezaOk ? "#16a34a" : "#b45309" }}>
                    {l.semPlano
                      ? "avulso"
                      : l.limpezaOk
                        ? "feita"
                        : l.limpos > 0
                          ? `${l.limpos} de ${l.contratados}`
                          : "falta"}
                  </div>
                </div>
                <div style={{ textAlign: "right", minWidth: 96 }}>
                  <div style={{ fontSize: 12, color: cor.cinza }}>pagamento</div>
                  <div style={{ fontWeight: 700, color: l.pagamentoOk ? "#16a34a" : "#b45309" }}>
                    {l.pagamentoOk ? "em dia" : dinheiro(l.saldo)}
                  </div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Rotinas() {
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    fetch("/api/rotinas").then((x) => x.json()).then(setD).catch(() => null);
  }, []);

  if (!d) return null;

  // migration 0039 ainda não rodou: avisa, em vez de ficar mudo
  if (!d.ok && d.erro === "tabela_ausente") {
    return (
      <div style={{ ...painel.card, borderLeft: "4px solid #b45309" }}>
        <b>As rotinas automáticas ainda não são monitoradas.</b>
        <p style={{ margin: "6px 0 0", color: cor.cinza, lineHeight: 1.5 }}>{d.dica}</p>
      </div>
    );
  }
  if (!d.ok || !d.problemas) return null;

  const paradas = (d.rotinas || []).filter((r: any) => r.atrasada);

  return (
    <div style={{ ...painel.card, background: "#fef2f2", border: "2px solid #dc2626" }}>
      <b style={{ color: "#7f1d1d", fontSize: 18 }}>
        {paradas.length === 1
          ? "Uma rotina automática parou"
          : `${paradas.length} rotinas automáticas pararam`}
      </b>
      <ul style={{ margin: "10px 0 0", paddingLeft: 20, color: "#7f1d1d", lineHeight: 1.7 }}>
        {paradas.map((r: any) => (
          <li key={r.chave}>
            <b>{r.nome}</b> —{" "}
            {r.nuncaRodou
              ? "nunca rodou"
              : `sem rodar há ${
                  r.minutosDesde >= 120
                    ? `${Math.round(r.minutosDesde / 60)} h`
                    : `${r.minutosDesde} min`
                }`}
            {r.ultimoErro ? ` · último erro: ${r.ultimoErro}` : ""}
            <div style={{ fontSize: 14, opacity: 0.85 }}>{r.impacto}</div>
          </li>
        ))}
      </ul>
      <p style={{ margin: "10px 0 0", color: "#7f1d1d", fontSize: 14, lineHeight: 1.5 }}>
        Confira <b>CRON_SECRET</b> nas variáveis da Vercel e se o projeto está num plano
        que roda cron por minuto. O WhatsApp depende também da Evolution estar de pé.
      </p>
    </div>
  );
}

