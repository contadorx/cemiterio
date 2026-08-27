"use client";

import { useCallback, useEffect, useState } from "react";
import { painel, cor } from "../ui";
import { useConfirmar } from "@/components/Dialogos";

/**
 * A RÉGUA DE COBRANÇA — editável, degrau a degrau.
 *
 * Antes eram três nomes fixos (suave/padrão/firme) com os degraus dentro do
 * TypeScript: quantos dias, que texto, em que ordem. Personalizar exigia mexer
 * em código, que é o oposto de "vou ajustando".
 *
 * O EIXO É UM SÓ, com o zero no vencimento:
 *   dias NEGATIVOS   antes  — o aviso do serviço prévio
 *   dias POSITIVOS   depois — a cobrança de quem atrasou
 *
 * Dois campos separados ("tipo" + "dias") deixariam criar "aviso prévio, 5
 * dias depois", que não quer dizer nada.
 *
 * ⚠ NADA DAQUI ENVIA. A régua escreve na fila de liberação, e a fila só sai
 * por comando de quem lê. É por isso que o degrau não tem "enviar automático".
 */

const REGUAS: [string, string][] = [
  ["padrao", "Padrão"],
  ["suave", "Suave"],
  ["firme", "Firme"],
];

export default function Regua() {
  const perguntar = useConfirmar();
  const [regua, setRegua] = useState("padrao");
  const [d, setD] = useState<any>(null);
  const [novo, setNovo] = useState({ dias: "", texto: "" });
  const [edicao, setEdicao] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/config/regua?regua=${regua}`)
      .then((x) => x.json()).catch(() => null);
    setD(r?.ok ? r : null);
    setEdicao({});
  }, [regua]);

  useEffect(() => { carregar(); }, [carregar]);

  async function acao(metodo: string, corpo: any, url = "/api/config/regua") {
    setOcupado(true); setErro("");
    try {
      const r = await fetch(url, {
        method: metodo,
        headers: corpo ? { "Content-Type": "application/json" } : undefined,
        body: corpo ? JSON.stringify(corpo) : undefined,
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { setErro(r?.mensagem || "Não consegui salvar."); return false; }
      await carregar();
      return true;
    } finally { setOcupado(false); }
  }

  if (!d) return <p style={{ color: cor.cinza }}>Carregando…</p>;

  const antes = (d.degraus || []).filter((x: any) => x.dias < 0);
  const depois = (d.degraus || []).filter((x: any) => x.dias >= 0);

  const quando = (dias: number) =>
    dias < 0 ? `${Math.abs(dias)} ${Math.abs(dias) === 1 ? "dia" : "dias"} ANTES de vencer`
    : dias === 0 ? "no DIA do vencimento"
    : `${dias} ${dias === 1 ? "dia" : "dias"} DEPOIS de vencer`;

  return (
    <>
      <div style={painel.card}>
        <strong style={{ color: cor.navy }}>O dia do vencimento</strong>
        <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.55, color: cor.cinza }}>
          É dele que a régua conta. A competência do lançamento é sempre o dia 1º — mas
          ninguém vence no dia 1º, e sem esta data o degrau de “3 dias depois” cairia no
          dia 4 de todo mês, chamando de atrasado quem ainda tem uma semana.
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
          <span style={{ fontSize: 15 }}>Vence todo dia</span>
          <select style={{ ...painel.input, width: 90, margin: 0 }}
                  value={d.diaVencimento} disabled={ocupado}
                  onChange={(e) => acao("PUT", { diaVencimento: Number(e.target.value) })}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((n) =>
              <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 14px" }}>
        {REGUAS.map(([v, rot]) => (
          <button key={v} onClick={() => setRegua(v)}
                  style={regua === v ? painel.botao : painel.botaoSec}>
            {rot}
          </button>
        ))}
      </div>

      <p style={{ fontSize: 13.5, lineHeight: 1.55, color: cor.cinza, margin: "-6px 2px 14px" }}>
        Cada família segue uma régua (na ficha dela). <b>“Não cobrar”</b> é uma régua também —
        quem estiver nela não recebe nada, e por isso não tem degraus.{" "}
        <b>Nada aqui envia sozinho</b>: o que a régua monta entra na fila de <i>Conversas</i>,
        e você lê antes de mandar.
      </p>

      {[["Antes de vencer — o aviso", antes],
        ["Depois de vencer — a cobrança", depois]].map(([titulo, lista]: any) => (
        <div key={titulo} style={painel.card}>
          <strong style={{ color: cor.navy }}>{titulo}</strong>
          {lista.length === 0 && (
            <p style={{ margin: "8px 0 0", fontSize: 14, color: cor.cinza }}>
              Nenhum degrau aqui.
            </p>
          )}
          {lista.map((g: any) => (
            <div key={g.id} style={{ marginTop: 10, paddingTop: 10,
                                     borderTop: `1px solid ${cor.linha}`,
                                     opacity: g.ativo ? 1 : 0.55 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <b style={{ fontSize: 15 }}>{quando(g.dias)}</b>
                {!g.ativo && (
                  <span style={{ fontSize: 12, color: cor.cinza }}>desligado</span>
                )}
                {g.repetir_a_cada > 0 && (
                  <span title={`Depois deste dia, volta a cada ${g.repetir_a_cada} dias sem cobrança`}
                        style={{ fontSize: 12, fontWeight: 700, color: "#7c3aed",
                                 background: "#f5f3ff", border: "1px solid #ddd6fe",
                                 borderRadius: 999, padding: "1px 8px" }}>
                    ↻ e a cada {g.repetir_a_cada} dias
                  </span>
                )}
              </div>

              {/* O ÚLTIMO DEGRAU NÃO PODE SER O ÚLTIMO RECADO (0130).
                  A régua casava por dia exato, então quem passava do último
                  degrau não ouvia mais nada — nunca. Medido em 24/08: 43
                  débitos de 7 famílias, R$ 1.565,00, o mais velho com 379
                  dias, no silêncio. É intervalo, não data fixa: conta desde a
                  última cobrança daquela família, então um dia de rotina
                  perdido não custa um mês de silêncio. */}
              <div style={{ display: "flex", gap: 6, alignItems: "center",
                            marginTop: 6, fontSize: 13.5, color: cor.cinza }}>
                <span>Depois deste dia, repetir a cada</span>
                <input
                  style={{ ...painel.input, margin: 0, width: 74, padding: "4px 8px" }}
                  inputMode="numeric"
                  placeholder="—"
                  defaultValue={g.repetir_a_cada ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    const atual = g.repetir_a_cada ?? "";
                    if (v === String(atual)) return;
                    acao("PUT", { id: g.id, repetirACada: v === "" ? null : v });
                  }}
                />
                <span>dias sem cobrança. Vazio = não repete.</span>
              </div>
              <textarea
                style={{ ...painel.input, minHeight: 78, marginTop: 6 }}
                value={edicao[g.id] ?? g.texto}
                onChange={(e) => setEdicao((x) => ({ ...x, [g.id]: e.target.value }))}
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {edicao[g.id] !== undefined && edicao[g.id] !== g.texto && (
                  <button style={painel.botaoMini} disabled={ocupado}
                          onClick={() => acao("PUT", { id: g.id, texto: edicao[g.id] })}>
                    Salvar
                  </button>
                )}
                <button style={painel.botaoMiniSec} disabled={ocupado}
                        onClick={() => acao("PUT", { id: g.id, ativo: !g.ativo })}>
                  {g.ativo ? "Desligar" : "Ligar"}
                </button>
                <button style={painel.botaoMiniSec} disabled={ocupado}
                        onClick={async () => {
                          if (!await perguntar({
                            oQue: `Apagar o degrau de ${quando(g.dias)}?`,
                            efeito: "A régua deixa de preparar cobrança nesse ponto. "
                                  + "As famílias que já estavam nele passam para o degrau seguinte.",
                            confirmar: "Apagar o degrau", tom: "perigo",
                          })) return;
                          acao("DELETE", null, `/api/config/regua?id=${g.id}`);
                        }}>
                  Apagar
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}

      <div style={painel.card}>
        <strong style={{ color: cor.navy }}>Acrescentar um degrau</strong>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "150px 1fr", marginTop: 10 }}>
          <input style={{ ...painel.input, margin: 0 }} inputMode="numeric"
                 placeholder="dias (-5 ou 3)" value={novo.dias}
                 onChange={(e) => setNovo({ ...novo, dias: e.target.value })} />
          <input style={{ ...painel.input, margin: 0 }}
                 placeholder="O que se diz neste degrau — use {nome}"
                 value={novo.texto}
                 onChange={(e) => setNovo({ ...novo, texto: e.target.value })} />
        </div>
        <p style={{ fontSize: 13, color: cor.cinza, margin: "8px 2px 0", lineHeight: 1.5 }}>
          <b>Negativo</b> é antes de vencer (−5 = cinco dias antes), <b>positivo</b> é depois
          (3 = três dias de atraso). <b>{"{nome}"}</b> vira o primeiro nome de quem recebe.
        </p>
        <button style={{ ...painel.botaoMini, marginTop: 10 }} disabled={ocupado}
                onClick={async () => {
                  const ok = await acao("POST", {
                    regua, dias: Number(novo.dias), texto: novo.texto,
                  });
                  if (ok) setNovo({ dias: "", texto: "" });
                }}>
          Acrescentar
        </button>
        {erro && <p style={{ fontSize: 14, color: "#b91c1c", margin: "8px 2px 0" }}>{erro}</p>}
      </div>
    </>
  );
}
