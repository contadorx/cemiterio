"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PainelNav, painel, cor } from "../ui";

/**
 * O FECHAMENTO DO MÊS.
 *
 * Duas coisas numa tela: gerar a cobrança do período e ver quem está em
 * aberto. É o que a Sureya faz uma vez por mês, de cima para baixo.
 *
 * A prévia vem antes de gravar, sempre. Lançar dívida na conta de sessenta e
 * cinco famílias sem olhar o que vai entrar é o tipo de botão que ninguém
 * deveria ter.
 */

const MESES = ["janeiro","fevereiro","março","abril","maio","junho",
               "julho","agosto","setembro","outubro","novembro","dezembro"];

function nomearPeriodo(competencia: string) {
  return `${MESES[Number(competencia.slice(5, 7)) - 1]} de ${competencia.slice(0, 4)}`;
}

function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const dinheiro = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PainelFechamento() {
  const [competencia, setCompetencia] = useState(competenciaAtual);
  const [previa, setPrevia] = useState<any>(null);
  const [emAberto, setEmAberto] = useState<any>(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");

  async function carregar() {
    const [p, f] = await Promise.all([
      fetch(`/api/financeiro/competencia?competencia=${competencia}`).then((x) => x.json()),
      fetch("/api/financeiro/fechamento").then((x) => x.json()),
    ]);
    if (p?.ok) setPrevia(p);
    if (f?.ok) setEmAberto(f);
  }

  useEffect(() => { carregar(); }, [competencia]);

  async function lancar() {
    if (!previa?.novos) return;
    if (!confirm(
      `Vou lançar ${previa.novos} cobrança(s) de ${nomearPeriodo(competencia)}, ` +
      `somando ${dinheiro(previa.total)}.\n\nConfirma?`
    )) return;

    setOcupado(true);
    setMsg("");
    try {
      const r = await fetch("/api/financeiro/competencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competencia }),
      }).then((x) => x.json());

      if (!r.ok) { setMsg(r.erro || "Não consegui lançar."); return; }

      setMsg(
        `${r.lancados} cobrança(s) lançada(s), somando ${dinheiro(r.total)}.` +
        (r.repetidos ? ` ${r.repetidos} já estavam lançadas e foram puladas.` : "")
      );
      carregar();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>

        {/* ---------- gerar a cobrança do período ---------- */}
        <div style={painel.card}>
          <strong style={{ color: cor.navy }}>Cobrança do período</strong>

          <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "12px 0", flexWrap: "wrap" }}>
            <input
              type="month"
              style={{ ...painel.input, width: "auto" }}
              value={competencia.slice(0, 7)}
              onChange={(e) => setCompetencia(`${e.target.value}-01`)}
            />
            <span style={{ color: cor.cinza }}>{nomearPeriodo(competencia)}</span>
          </div>

          {previa && (
            <>
              <p style={{ color: cor.cinza, margin: "0 0 12px" }}>
                {previa.novos === 0
                  ? previa.jaLancados > 0
                    ? `Tudo lançado: as ${previa.jaLancados} cobranças deste período já estão na conta das famílias.`
                    : "Nenhum túmulo contratado fecha ciclo neste período."
                  : <>Vou lançar <b>{previa.novos}</b> cobrança(s), somando{" "}
                     <b style={{ color: cor.navy }}>{dinheiro(previa.total)}</b>.
                     {previa.jaLancados > 0 && ` (${previa.jaLancados} já lançadas antes.)`}</>}
              </p>

              <button
                style={previa.novos ? painel.botao : painel.botaoSec}
                onClick={lancar}
                disabled={ocupado || !previa.novos}
              >
                {ocupado ? "Lançando…" : "Lançar cobrança do período"}
              </button>
            </>
          )}

          {msg && <p style={{ marginTop: 12, color: cor.teal }}>{msg}</p>}

          <p style={{ marginTop: 14, fontSize: 14, color: cor.cinza, lineHeight: 1.5 }}>
            <b>Isto acontece sozinho todo dia 1, de manhã.</b> O botão acima
            serve para adiantar, para conferir, ou para fechar um mês passado
            que ficou para trás.
          </p>
          <p style={{ marginTop: 8, fontSize: 14, color: cor.cinza, lineHeight: 1.5 }}>
            A cobrança vem do período contratado, não da lavagem executada — se
            uma foto não subir ou o celular ficar sem sinal no cemitério, a
            cobrança acontece do mesmo jeito. Lançar duas vezes é impossível: o
            banco recusa.
          </p>
          <p style={{ marginTop: 8, fontSize: 14, color: cor.cinza, lineHeight: 1.5 }}>
            Lançar aqui <b>não manda mensagem para ninguém</b>. O valor entra no
            extrato da família; a cobrança só sai quando você aprovar na
            Liberação.
          </p>
        </div>

        {/* ---------- quem está em aberto ---------- */}
        <div style={painel.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <strong style={{ color: cor.navy }}>Em aberto</strong>
            {emAberto && (
              <span style={{ color: cor.cinza }}>
                {emAberto.quantas} {emAberto.quantas === 1 ? "família" : "famílias"} ·{" "}
                <b style={{ color: "#b45309" }}>{dinheiro(emAberto.totalEmAberto)}</b>
              </span>
            )}
          </div>

          {emAberto?.quantas === 0 && (
            <p style={{ color: cor.teal, marginTop: 12 }}>
              Todas as famílias estão em dia. 🌿
            </p>
          )}

          {(emAberto?.familias || []).map((f: any) => (
            <div key={f.familiaId} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              gap: 10, padding: "12px 0", borderTop: `1px solid ${cor.linha}`, flexWrap: "wrap",
            }}>
              <div>
                <div style={{ fontWeight: 600, color: cor.navy }}>{f.nome}</div>
                <div style={{ fontSize: 14, color: cor.cinza }}>
                  {f.desde ? `desde ${nomearPeriodo(f.desde)}` : "sem período"}
                  {f.ultimoPagamento &&
                    ` · último pagamento em ${new Date(f.ultimoPagamento + "T12:00:00").toLocaleDateString("pt-BR")}`}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <b style={{ color: "#b45309" }}>{dinheiro(f.saldo)}</b>
                <Link href={`/painel/clientes?familia=${f.familiaId}`} style={painel.botaoMiniSec}>
                  Abrir ficha
                </Link>
              </div>
            </div>
          ))}
        </div>
    </>
  );
}

/**
 * A página existe para quem chegar por link direto ou favorito. O caminho
 * normal é a aba "Fechar o mês" dentro do Financeiro — dinheiro tem uma porta
 * só, não duas no menu.
 */
export default function FechamentoPagina() {
  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/financeiro" />
      <div style={painel.conteudo}>
        <h1 style={painel.h1}>Fechamento do mês</h1>
        <PainelFechamento />
      </div>
    </div>
  );
}
