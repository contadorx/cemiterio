"use client";

import { useCallback, useEffect, useState } from "react";
import { PainelNav, painel, cor } from "../ui";
import ConcluirAdmin from "./ConcluirAdmin";

interface Item {
  id: string;
  status: string;
  tumulo: string;
  quadra: string;
  falecido: string | null;
  cliente: string | null;
  valor: number | null;
}

export default function AgendaPage() {
  const [dias, setDias] = useState<Record<string, Item[]>>({});
  const [carregando, setCarregando] = useState(true);
  const [remarcando, setRemarcando] = useState<string | null>(null);
  const [novaData, setNovaData] = useState("");
  const [replanejar, setReplanejar] = useState(true);
  const [concluindo, setConcluindo] = useState<any>(null);

  const [periodo, setPeriodo] = useState({ dias: 14, inicio: "", fim: "" });
  const [gerando, setGerando] = useState(false);
  const [diag, setDiag] = useState<any>(null);
  const [mesAlvo, setMesAlvo] = useState(new Date().toISOString().slice(0, 7));
  const [incluirAvulsos, setIncluirAvulsos] = useState(false);
  const [dataAvulsos, setDataAvulsos] = useState("");
  const [fora, setFora] = useState(0);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const qs = new URLSearchParams();
    if (periodo.inicio) qs.set("inicio", periodo.inicio);
    if (periodo.fim) qs.set("fim", periodo.fim);
    qs.set("dias", String(periodo.dias));
    const r = await fetch(`/api/agenda/semana?${qs}`).then((x) => x.json()).catch(() => null);
    setDias(r?.dias || {});
    setCarregando(false);
  }, [periodo]);

  useEffect(() => { carregar(); }, [carregar]);

  // quantas lavagens ficaram em dia que não se trabalha (ou já passaram)
  useEffect(() => {
    fetch("/api/agenda/reorganizar")
      .then((x) => x.json())
      .then((r) => r?.ok && setFora(r.foraDaJornada || 0))
      .catch(() => null);
  }, [dias]);

  async function reorganizar() {
    setGerando(true); setDiag(null);
    const r = await fetch("/api/agenda/reorganizar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diasAFrente: 120 }),
    }).then((x) => x.json()).catch(() => null);
    setGerando(false);
    if (r?.ok) {
      alert(
        `${r.movidos} lavagem(ns) movida(s) para dias de trabalho.\n` +
        `${r.agendados} redistribuída(s) em ${r.dias} dia(s).`
      );
      setFora(0);
      carregar();
    } else alert("Não consegui reorganizar.");
  }

  async function gerarDias(n: number) {
    setGerando(true); setDiag(null);
    const r = await fetch("/api/agenda/gerar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ horizonteDias: n }),
    }).then((x) => x.json()).catch(() => null);
    setGerando(false);
    if (r?.ok) { setDiag({ ...r.geracao, ...r.alocacao }); carregar(); }
    else alert("Falhou ao gerar.");
  }

  async function gerarMes() {
    setGerando(true); setDiag(null);
    const r = await fetch("/api/agenda/mes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mes: mesAlvo, incluirAvulsos, dataAvulsos: dataAvulsos || undefined }),
    }).then((x) => x.json()).catch(() => null);
    setGerando(false);
    if (r?.ok) { setDiag(r); carregar(); }
    else alert("Falhou ao gerar o mês.");
  }

  async function estornar(id: string, tumulo: string) {
    const motivo = prompt(
      `Estornar a lavagem de ${tumulo}?\n\n` +
      `A lavagem é anulada e o valor cobrado volta como crédito para a família.\n` +
      `O registro continua visível com o motivo — o extrato dela mostra que houve\n` +
      `um erro e que foi corrigido.\n\nO que aconteceu?`,
      ""
    );
    if (motivo === null) return;
    if (!motivo.trim()) return alert("Preciso do motivo — ele fica no extrato da família.");

    const r = await fetch(`/api/servico/${id}/estornar`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo }),
    }).then((x) => x.json()).catch(() => null);

    if (r?.ok) {
      alert(r.valorEstornado > 0
        ? `Estornada. R$ ${Number(r.valorEstornado).toFixed(2)} devolvidos para a família.`
        : "Estornada. Não havia cobrança lançada.");
      carregar();
    } else alert(r?.erro || "Não consegui estornar.");
  }

  async function excluir(id: string) {
    const r = await fetch(`/api/servico/${id}`, { method: "DELETE" })
      .then((x) => x.json()).catch(() => null);
    if (r?.ok) carregar();
    else alert(r?.erro || "Não consegui excluir.");
  }

  async function acao(id: string, corpo: any) {
    const r = await fetch(`/api/servico/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }).then((x) => x.json()).catch(() => null);

    if (!r?.ok) {
      alert(r?.erro || "Não consegui fazer isso agora.");
    } else if (corpo.acao === "remarcar" && r.seguintesMovidas > 0) {
      // conta o que aconteceu: mover uma lavagem mexe na régua do jazigo
      alert(
        `Remarcada para ${new Date(r.novaData + "T12:00:00").toLocaleDateString("pt-BR")}.\n\n` +
        `${r.seguintesMovidas} lavagem(ns) seguinte(s) deste jazigo também andaram, ` +
        `para manter o intervalo combinado.`
      );
    }
    setRemarcando(null);
    setNovaData("");
    carregar();
  }

  const chaves = Object.keys(dias).sort();
  const statusCor: Record<string, string> = {
    agendado: cor.teal,
    alocado: cor.teal,
    executado: "#16a34a",
    pulado: "#b45309",
  };

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/agenda" />
      <main style={painel.conteudo}>
        <h1 style={painel.h1}>
          Agenda{periodo.fim ? "" : ` — próximo${periodo.dias > 1 ? `s ${periodo.dias} dias` : " dia"}`}
        </h1>

        <div style={{ ...painel.card, padding: 12 }}>
          <div data-filtros style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 15, color: cor.cinza, marginRight: 4 }}>Mostrar:</span>
            {[[1, "Amanhã"], [3, "3 dias"], [7, "7 dias"], [14, "14 dias"], [30, "30 dias"], [90, "90 dias"]]
              .map(([v, rot]) => (
                <button key={String(v)}
                  style={periodo.dias === v && !periodo.fim ? painel.botao : painel.botaoSec}
                  onClick={() => setPeriodo({ dias: Number(v), inicio: "", fim: "" })}>
                  {rot}
                </button>
              ))}
            <span style={{ fontSize: 15, color: cor.cinza, marginLeft: 8 }}>ou período:</span>
            <input type="date" style={{ ...painel.input, width: 150 }} value={periodo.inicio}
                   onChange={(e) => setPeriodo({ ...periodo, inicio: e.target.value })} />
            <input type="date" style={{ ...painel.input, width: 150 }} value={periodo.fim}
                   onChange={(e) => setPeriodo({ ...periodo, fim: e.target.value })} />
          </div>
        </div>

        {fora > 0 && (
          <div style={{ ...painel.card, borderLeft: "4px solid #d97706", background: "#fffbeb" }}>
            <strong style={{ color: "#92400e" }}>
              {fora} lavagem(ns) marcada(s) em dia que não se trabalha
            </strong>
            <p style={{ color: "#78350f", fontSize: 15, margin: "6px 0 12px", lineHeight: 1.5 }}>
              Acontece quando você muda os dias da jornada: o que já estava marcado continua
              no dia antigo. Reorganizar move tudo para o próximo dia de trabalho e redistribui
              respeitando a capacidade.
            </p>
            <button style={painel.botao} onClick={reorganizar} disabled={gerando}>
              {gerando ? "Reorganizando…" : "Reorganizar a agenda"}
            </button>
          </div>
        )}

        <div style={painel.card}>
          <strong style={{ color: cor.navy }}>Gerar limpezas</strong>
          <p style={{ color: cor.cinza, fontSize: 15, margin: "6px 0 12px" }}>
            Cria o que os planos devem e distribui pelos dias de trabalho. Pode clicar à
            vontade: nunca duplica.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            {[30, 60, 90].map((n) => (
              <button key={n} style={painel.botaoSec} disabled={gerando} onClick={() => gerarDias(n)}>
                Próximos {n} dias
              </button>
            ))}
            <div style={{ width: 1, height: 34, background: cor.linha, margin: "0 4px" }} />
            <div>
              <label style={painel.rotulo}>Mês inteiro</label>
              <input type="month" style={{ ...painel.input, width: 150 }} value={mesAlvo}
                     onChange={(e) => setMesAlvo(e.target.value)} />
            </div>
            <button style={painel.botao} disabled={gerando} onClick={gerarMes}>
              {gerando ? "…" : "Gerar o mês"}
            </button>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14,
                          marginTop: 12, color: cor.navy }}>
            <input type="checkbox" checked={incluirAvulsos}
                   onChange={(e) => setIncluirAvulsos(e.target.checked)} />
            Incluir os avulsos neste mês (Finados, Dia das Mães…)
          </label>
          {incluirAvulsos && (
            <div style={{ marginTop: 8 }}>
              <label style={painel.rotulo}>Data da lavagem dos avulsos</label>
              <input type="date" style={{ ...painel.input, width: 160 }} value={dataAvulsos}
                     onChange={(e) => setDataAvulsos(e.target.value)} />
              <p style={{ color: cor.cinza, fontSize: 14, margin: "6px 0 0" }}>
                Para o Finados, ponha 30/10 — assim tudo fica pronto antes do dia 2.
              </p>
            </div>
          )}

          {diag && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 8,
                          background: diag.criados > 0 ? "#f0fdf4" : "#f8fafc",
                          border: `1px solid ${diag.criados > 0 ? "#bbf7d0" : cor.linha}` }}>
              <strong style={{ color: cor.navy }}>
                {diag.criados > 0 ? `${diag.criados} limpeza(s) criada(s)` : "Nada novo a criar"}
              </strong>
              <div style={{ fontSize: 15, color: cor.cinza, marginTop: 4 }}>
                {diag.planosAtivos != null && `${diag.planosAtivos} planos ativos · `}
                {diag.avulsosIncluidos > 0 && `${diag.avulsosIncluidos} avulso(s) · `}
                {diag.jaExistiam > 0 && `${diag.jaExistiam} já existiam · `}
                {diag.foraDoHorizonte > 0 && `${diag.foraDoHorizonte} fora do período · `}
                {diag.agendados} distribuída(s) em {diag.dias} dia(s)
              </div>
              {diag.proximaData && diag.criados === 0 && (
                <div style={{ fontSize: 15, color: cor.navy, marginTop: 6 }}>
                  A próxima ida é em {new Date(diag.proximaData + "T12:00:00").toLocaleDateString("pt-BR")} —
                  aumente o período para alcançá-la.
                </div>
              )}
            </div>
          )}
        </div>

        {carregando && <p style={{ color: cor.cinza }}>Carregando...</p>}
        {!carregando && chaves.length === 0 && (
          <section style={painel.card}>
            <p style={{ color: cor.cinza, margin: 0 }}>
              Nada agendado no período. Gere a agenda na tela Início (ou aguarde o robô diário).
            </p>
          </section>
        )}

        {chaves.map((d) => (
          <section key={d} style={painel.card}>
            <strong style={{ color: cor.navy, fontSize: 16 }}>
              {new Date(d + "T12:00:00").toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "2-digit",
              })}
            </strong>
            {dias[d].map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  borderTop: `1px solid ${cor.linha}`,
                  paddingTop: 10,
                  marginTop: 10,
                }}
              >
                <div>
                  <span style={{ color: cor.navy, fontWeight: 600 }}>
                    Q{s.quadra} · {s.tumulo}
                  </span>{" "}
                  <span style={{ color: statusCor[s.status] || cor.cinza, fontSize: 15 }}>({s.status})</span>
                  <p style={{ color: cor.cinza, fontSize: 15, margin: "2px 0 0" }}>
                    {s.falecido ? `${s.falecido} · ` : ""}
                    {s.cliente || "sem cliente"}
                    {s.valor ? ` · R$ ${Number(s.valor).toFixed(2)}` : ""}
                  </p>
                </div>
                {s.status !== "executado" && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {remarcando === s.id ? (
                      <>
                        <input
                          type="date"
                          value={novaData}
                          onChange={(e) => setNovaData(e.target.value)}
                          style={{ ...painel.input, width: 160, padding: 8 }}
                        />
                        <button
                          style={painel.botao}
                          onClick={() => novaData && acao(s.id, {
                            acao: "remarcar", novaData, replanejar,
                          })}
                        >
                          Salvar
                        </button>
                        <button style={painel.botaoSec} onClick={() => setRemarcando(null)}>
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button style={painel.botaoSec} onClick={() => setRemarcando(s.id)}>
                          Remarcar
                        </button>
                        <label style={{ display: "flex", alignItems: "center", gap: 6,
                                        fontSize: 14, color: cor.cinza }}>
                          <input type="checkbox" checked={replanejar}
                                 onChange={(e) => setReplanejar(e.target.checked)} />
                          mover também as próximas deste jazigo
                        </label>
                        <button style={painel.botaoSec}
                                onClick={() => {
                                  const motivo = prompt(
                                    "Pular esta lavagem?\n\n" +
                                    "A próxima do jazigo já vem no ciclo seguinte.\n" +
                                    "Motivo (opcional):", "");
                                  if (motivo !== null) acao(s.id, { acao: "pular", motivo });
                                }}>
                          Pular
                        </button>
                        <button style={painel.botaoPerigo}
                                onClick={() => {
                                  if (!confirm(
                                    `Excluir a lavagem de ${s.tumulo}?\n\n` +
                                    `Some da agenda de vez. Para só adiar, use Remarcar.`)) return;
                                  excluir(s.id);
                                }}>
                          Excluir
                        </button>
                      </>
                    )}
                  </div>
                )}
                {s.status === "executado" && <Avaliar servicoId={s.id} />}
              </div>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}

function Avaliar({ servicoId }: { servicoId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function gerar() {
    setBusy(true);
    const r = await fetch(`/api/servico/${servicoId}/avaliacao`, { method: "POST" })
      .then((x) => x.json())
      .catch(() => null);
    setBusy(false);
    if (r?.ok) setLink(`${window.location.origin}/avaliar/${r.token}`);
    else alert("Falhou: " + (r?.erro || "erro"));
  }

  function copiar() {
    if (!link) return;
    navigator.clipboard?.writeText(link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  if (link) {
    return (
      <button style={painel.botaoMiniSec} onClick={copiar}>
        {copiado ? "✓ copiado" : "Copiar link de avaliação"}
      </button>
    );
  }
  return (
    <button style={painel.botaoMiniSec} onClick={gerar} disabled={busy}>
      {busy ? "..." : "Pedir avaliação"}
    </button>
  );
}
