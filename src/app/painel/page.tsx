"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PainelNav, painel, cor } from "./ui";
import InstalarApp from "../InstalarApp";
import { PedidosAdicionais } from "./PedidosAdicionais";

export default function Painel() {
  const [cap, setCap] = useState<any>(null);
  const [rasc, setRasc] = useState(0);
  const [comp, setComp] = useState(0);
  const [ind, setInd] = useState<any>(null);
  const [hoje, setHoje] = useState<any>(null);
  const [gerando, setGerando] = useState(false);
  const [horizonte, setHorizonte] = useState(90);
  const [diag, setDiag] = useState<any>(null);

  async function carregar() {
    const [c, r, cp, i, h] = await Promise.all([
      fetch("/api/capacidade").then((x) => x.json()),
      fetch("/api/rascunhos").then((x) => x.json()),
      fetch("/api/comprovantes").then((x) => x.json()),
      fetch("/api/indicadores").then((x) => x.json()),
      fetch("/api/hoje").then((x) => x.json()),
    ]);
    if (c.ok) setCap(c);
    if (r.ok) setRasc(r.rascunhos.length);
    if (cp.ok) setComp(cp.comprovantes.length);
    if (i.ok) setInd(i);
    if (h.ok) setHoje(h);
  }
  useEffect(() => {
    carregar();
  }, []);

  async function gerarAgenda() {
    setGerando(true);
    setDiag(null);
    const r = await fetch("/api/agenda/gerar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ horizonteDias: horizonte }),
    }).then((x) => x.json()).catch(() => null);
    setGerando(false);
    if (r?.ok) { setDiag(r); carregar(); }
    else alert("Falha ao gerar a agenda.");
  }

  const util = cap ? Math.round(cap.utilizacao * 100) : 0;
  const corUtil = util >= 90 ? "#dc2626" : util >= 70 ? "#d97706" : cor.teal;

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel" />
      <div style={painel.conteudo}>
        <InstalarApp />
        <h1 style={painel.h1}>Início</h1>

        <Rotinas />

        {hoje && (
          <div style={{ ...painel.card, background: cor.navy, marginBottom: 12 }}>
            <strong style={{ fontSize: 18, color: "#fff" }}>Hoje</strong>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginTop: 12 }}>
              {/* Atendimento saiu do menu (o agente de IA foi desligado). O
                  número que importa agora é o de mensagens esperando a
                  liberação da Sureya. */}
              <Link href="/painel/fila" style={{ textDecoration: "none" }}>
                <div style={{ fontSize: 30, fontWeight: 800, color: hoje.aguardando ? "#fbbf24" : "#fff" }}>{hoje.aguardando}</div>
                <div style={{ color: "#cbd5e1", fontSize: 14 }}>esperando liberação</div>
              </Link>
              <Link href="/painel/agenda" style={{ textDecoration: "none" }}>
                <div style={{ fontSize: 30, fontWeight: 800, color: hoje.atrasadas ? "#fbbf24" : "#fff" }}>{hoje.limpezasAFazer}</div>
                <div style={{ color: "#cbd5e1", fontSize: 14 }}>
                  limpezas a fazer{hoje.atrasadas ? ` · ${hoje.atrasadas} atrasada${hoje.atrasadas > 1 ? "s" : ""}` : ""}
                </div>
              </Link>
              <Link href="/painel/financeiro" style={{ textDecoration: "none" }}>
                <div style={{ fontSize: 30, fontWeight: 800, color: "#4ade80" }}>R$ {Number(hoje.entrouHoje).toFixed(0)}</div>
                <div style={{ color: "#cbd5e1", fontSize: 14 }}>entrou hoje</div>
              </Link>
            </div>
          </div>
        )}

        {/* O aviso de leads novos saía daqui apontando para o CRM, que foi
            desligado: a captação de vocês é indicação e plaquinha, não funil. */}

        {/* pedido de servico adicional: e a unica coisa aqui com prazo dado pela familia */}
        <PedidosAdicionais />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 8 }}>
          <Link href="/painel/fila" style={{ ...painel.card, textDecoration: "none", display: "block" }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: rasc ? "#d97706" : cor.navy }}>{rasc}</div>
            <div style={{ color: cor.cinza }}>rascunhos p/ aprovar</div>
          </Link>
          <Link href="/painel/financeiro" style={{ ...painel.card, textDecoration: "none", display: "block" }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: comp ? "#d97706" : cor.navy }}>{comp}</div>
            <div style={{ color: cor.cinza }}>comprovantes p/ conferir</div>
          </Link>
        </div>

        {ind && (
          <div style={painel.card}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 18, color: cor.navy }}>Este mês</strong>
              {/* o fechamento inteiro numa tela só — inclusive a foto de meses
                  passados, que aqui não dá para ver */}
              <Link href="/painel/financeiro" style={{ ...painel.botaoMiniSec, marginLeft: "auto" }}>
                Como foi o mês →
              </Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 12, marginTop: 12 }}>
              <Metrica titulo="Recebido" valor={`R$ ${ind.recebidoMes.toFixed(0)}`} cor="#16a34a" />
              <Metrica titulo="A receber" valor={`R$ ${ind.aReceber.toFixed(0)}`} cor={ind.aReceber > 0 ? "#dc2626" : cor.navy} />
              <Metrica titulo="Limpezas feitas" valor={String(ind.servExecutadosMes)} cor={cor.navy} />
              <Metrica titulo="Clientes ativos" valor={String(ind.clientesAtivos)} cor={cor.navy} />
              <Metrica titulo="Nota média" valor={ind.mediaAvaliacoes != null ? `${ind.mediaAvaliacoes.toFixed(1)}⭐` : "—"} cor="#d97706" />
              <Metrica titulo="IA automática" valor={ind.pctAutomatico != null ? `${ind.pctAutomatico}%` : "—"} cor={cor.teal} />
            </div>
          </div>
        )}

        {cap && (
          <div style={painel.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <strong style={{ fontSize: 18, color: cor.navy }}>Carga × capacidade</strong>
              <span style={{ fontWeight: 800, color: corUtil, fontSize: 20 }}>{util}%</span>
            </div>
            <div style={{ height: 10, background: "#e2e8f0", borderRadius: 999, overflow: "hidden", margin: "10px 0" }}>
              <div style={{ height: "100%", width: `${Math.min(100, util)}%`, background: corUtil }} />
            </div>
            <p style={{ color: cor.cinza, margin: "4px 0", fontSize: 15 }}>
              A Nina dá conta de ~<b>{cap.capacidadeMensal}</b> limpezas/mês. Hoje os planos consomem{" "}
              <b>{cap.cargaMensal}</b>. Sobra pra cerca de <b style={{ color: cor.teal }}>{cap.cabemTumulos} túmulos</b> novos
              ({cap.folgaMensal} limpezas/mês).
            </p>

            {/* 0044 — com mais de um cemitério, o total esconde o gargalo: um
                local atendido só às terças enche muito antes que a casa toda. */}
            {(cap.porCemiterio || []).length > 1 && (
              <div style={{ marginTop: 10, borderTop: `1px solid ${cor.linha}`, paddingTop: 10 }}>
                {(cap.porCemiterio || []).map((c: any) => {
                  const u = Math.round((c.utilizacao || 0) * 100);
                  const cu = u >= 90 ? "#dc2626" : u >= 70 ? "#d97706" : cor.teal;
                  return (
                    <div key={c.cemiterioId} style={{ display: "flex", gap: 10, alignItems: "baseline",
                                                      flexWrap: "wrap", marginTop: 6 }}>
                      <b style={{ color: cor.navy, fontSize: 15 }}>{c.nome}</b>
                      <span style={{ fontSize: 14, color: cor.cinza }}>
                        {c.cargaMensal} de {c.capacidadeMensal} limpezas/mês
                        {c.diasSemana ? ` · ${c.diasSemana.length} dia(s) por semana` : ""}
                      </span>
                      <b style={{ marginLeft: "auto", color: cu }}>{u}%</b>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div style={painel.card}>
          <strong style={{ fontSize: 18, color: cor.navy }}>Agenda da equipe</strong>
          <p style={{ color: cor.cinza, fontSize: 14, margin: "6px 0 0", lineHeight: 1.6 }}>
            Este botão faz duas coisas: <b>1)</b> cria as limpezas que os planos devem no período
            escolhido — cada plano tem sua periodicidade e a data da próxima ida; <b>2)</b> distribui
            essas limpezas pelos dias de trabalho, agrupando por quadra e rua para a rota render.
            <br />
            Pode clicar quantas vezes quiser: ele nunca duplica. Se não houver nada novo no período,
            o resultado será zero — e isso é o esperado.
          </p>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 12 }}>
            <div>
              <label style={painel.rotulo}>Olhar quantos dias à frente</label>
              <select style={{ ...painel.input, width: 150 }} value={horizonte}
                      onChange={(e) => setHorizonte(Number(e.target.value))}>
                <option value={30}>30 dias</option>
                <option value={60}>60 dias</option>
                <option value={90}>90 dias</option>
                <option value={180}>6 meses</option>
                <option value={365}>1 ano</option>
              </select>
            </div>
            <button style={painel.botao} onClick={gerarAgenda} disabled={gerando}>
              {gerando ? "Processando…" : "Gerar e distribuir"}
            </button>
          </div>

          {diag && (
            <div style={{ marginTop: 14, padding: 14, borderRadius: 10,
                          background: diag.geracao.criados > 0 ? "#f0fdf4" : "#f8fafc",
                          border: `1px solid ${diag.geracao.criados > 0 ? "#bbf7d0" : cor.linha}` }}>
              <strong style={{ color: cor.navy }}>
                {diag.geracao.criados > 0
                  ? `${diag.geracao.criados} limpeza(s) criada(s)`
                  : "Nada novo a criar neste período"}
              </strong>
              <ul style={{ margin: "8px 0 0", paddingLeft: 20, color: cor.cinza, fontSize: 14, lineHeight: 1.8 }}>
                <li><b>{diag.geracao.planosAtivos}</b> planos recorrentes ativos</li>
                <li><b>{diag.geracao.planosNoHorizonte}</b> com ida prevista nos próximos {diag.geracao.horizonteDias} dias</li>
                {diag.geracao.foraDoHorizonte > 0 && (
                  <li><b>{diag.geracao.foraDoHorizonte}</b> só voltam depois deste período
                    {diag.geracao.proximaData && (
                      <> — o próximo é em <b>{new Date(diag.geracao.proximaData + "T12:00:00").toLocaleDateString("pt-BR")}</b></>
                    )}
                  </li>
                )}
                {diag.geracao.jaExistiam > 0 && (
                  <li><b>{diag.geracao.jaExistiam}</b> já tinham limpeza criada (não duplicou)</li>
                )}
                {diag.geracao.falhas > 0 && (
                  <li style={{ color: "#b91c1c", fontWeight: 700 }}>
                    <b>{diag.geracao.falhas}</b> plano(s) deram erro e ficaram sem limpeza criada —
                    veja o motivo em Config → Diagnóstico. Eles não avançaram de data, então rodar
                    de novo depois de corrigir resolve.
                  </li>
                )}
                <li><b>{diag.alocacao.agendados}</b> limpeza(s) distribuída(s) em <b>{diag.alocacao.dias}</b> dia(s) de trabalho</li>
              </ul>
              {diag.geracao.criados === 0 && diag.geracao.foraDoHorizonte > 0 && (
                <p style={{ color: cor.navy, fontSize: 15, margin: "10px 0 0" }}>
                  Quer enxergar mais longe? Aumente o período acima para {diag.geracao.horizonteDias < 90 ? "90 dias" : "1 ano"} e gere de novo.
                </p>
              )}
              <a href="/painel/agenda" style={{ ...painel.botaoSec, display: "inline-block",
                 textDecoration: "none", marginTop: 12 }}>Ver a agenda</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * AS ROTINAS ESTÃO RODANDO?
 *
 * Só aparece quando alguma parou — é aviso, não painel de controle. O modelo é
 * o da faixa de disparos desligados (painel/ui.tsx), que é o único mecanismo de
 * estado global que este sistema já resolvia bem.
 *
 * Antes disto não havia lugar nenhum que respondesse a pergunta. A tela de
 * Diagnóstico lia só a lista de ERROS e, vazia, escrevia "Nenhum erro
 * registrado ✓" — a mesma tela verde para "rodou perfeito" e para "não roda há
 * uma semana".
 */
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

function Metrica({ titulo, valor, cor: c }: { titulo: string; valor: string; cor: string }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 800, color: c }}>{valor}</div>
      <div style={{ fontSize: 15, color: "#64748b" }}>{titulo}</div>
    </div>
  );
}
