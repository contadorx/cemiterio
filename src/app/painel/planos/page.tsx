"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PainelNav, painel, cor } from "../ui";

const MESES: Record<string, number> = {
  mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12, avulso: 0,
};

/**
 * PLANOS — tudo da carteira numa tela só, editável na linha.
 * É aqui que se define quando lavar, quando cobrar e por quanto.
 */
export default function Planos() {
  const [d, setD] = useState<any>(null);
  const [f, setF] = useState({ busca: "", quadra: "", cadencia: "", situacao: "ativos",
                               ordem: "quadra", teste: false });
  const [quadras, setQuadras] = useState<any[]>([]);
  const [editando, setEditando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => {
      if (k === "teste") { if (v) p.set("teste", "1"); } else if (v) p.set(k, String(v));
    });
    const r = await fetch(`/api/planos?${p}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) setD(r);
  }, [f]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    fetch("/api/quadras").then((x) => x.json()).then((r) => r.ok && setQuadras(r.quadras)).catch(() => {});
  }, []);

  const money = (n: number) => `R$ ${Number(n || 0).toFixed(2)}`;
  const dt = (s: string | null) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/planos" />
      <div style={painel.conteudo}>
        <h1 style={painel.h1}>Planos e cobrança</h1>
        <p style={{ color: cor.cinza, fontSize: 14, marginTop: -8, marginBottom: 14 }}>
          Cada linha é um jazigo. Aqui se define <b>por quanto</b>, <b>de quanto em quanto tempo</b>,
          <b> quando lavar</b> e <b>quando cobrar</b>. Clique em Editar para ajustar direto na linha.
        </p>

        <div style={{ ...painel.card, padding: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input style={{ ...painel.input, flex: 1, minWidth: 170 }} value={f.busca}
                   onChange={(e) => setF({ ...f, busca: e.target.value })}
                   placeholder="Buscar família ou jazigo…" />
            <select style={{ ...painel.input, width: "auto" }} value={f.situacao}
                    onChange={(e) => setF({ ...f, situacao: e.target.value })}>
              <option value="ativos">Ativos</option>
              <option value="falta_data">Falta data de lavagem ou cobrança</option>
              <option value="nao_conferido">Ainda não conferidos</option>
              <option value="atrasados">Com pagamento vencido</option>
              <option value="inativos">Inativos</option>
              <option value="">Todos</option>
            </select>
            <select style={{ ...painel.input, width: "auto" }} value={f.quadra}
                    onChange={(e) => setF({ ...f, quadra: e.target.value })}>
              <option value="">Todas as quadras</option>
              {quadras.map((q) => <option key={q.id} value={q.codigo}>{q.codigo}</option>)}
            </select>
            <select style={{ ...painel.input, width: "auto" }} value={f.cadencia}
                    onChange={(e) => setF({ ...f, cadencia: e.target.value })}>
              <option value="">Toda periodicidade</option>
              {Object.keys(MESES).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select style={{ ...painel.input, width: "auto" }} value={f.ordem}
                    onChange={(e) => setF({ ...f, ordem: e.target.value })}>
              <option value="quadra">Ordem da rota</option>
              <option value="lavagem">Próxima lavagem</option>
              <option value="cobranca">Próxima cobrança</option>
              <option value="valor">Maior valor</option>
            </select>
          </div>
        </div>

        {d && (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12, fontSize: 14, color: cor.cinza }}>
            <span><b style={{ color: cor.navy }}>{d.totais.quantidade}</b> jazigos</span>
            <span><b style={{ color: cor.navy }}>{money(d.totais.mensal)}</b> por mês</span>
            {d.totais.faltaData > 0 && (
              <span style={{ color: "#d97706" }}>
                <b>{d.totais.faltaData}</b> sem data de lavagem ou cobrança
              </span>
            )}
            {d.totais.naoConferidos > 0 && (
              <span><b>{d.totais.naoConferidos}</b> ainda não conferidos</span>
            )}
          </div>
        )}

        {!d && <p style={{ color: cor.cinza }}>Carregando…</p>}
        {d && d.planos.length === 0 && (
          <div style={painel.card}><p style={{ margin: 0, color: cor.cinza }}>Nenhum plano com esses filtros.</p></div>
        )}

        {d && d.planos.map((p: any) => (
          <Linha key={p.id} p={p} aberto={editando === p.id}
                 onAbrir={() => setEditando(editando === p.id ? null : p.id)}
                 onSalvo={() => { setEditando(null); carregar(); }} />
        ))}
      </div>
    </div>
  );
}

function Linha({ p, aberto, onAbrir, onSalvo }:
  { p: any; aberto: boolean; onAbrir: () => void; onSalvo: () => void }) {
  const [e, setE] = useState({
    cadencia: p.cadencia, valor_mensal: p.valorMensal, ativo: p.ativo,
    pago_ate: p.pagoAte || "", proximo_servico: p.proximaLavagem || "",
    proxima_cobranca: p.proximaCobranca || "",
  });
  const [salvando, setSalvando] = useState(false);

  const money = (n: number) => `R$ ${Number(n || 0).toFixed(2)}`;
  const dt = (s: string | null) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";
  const ciclo = (MESES[e.cadencia] || 0) > 0
    ? (Number(e.valor_mensal) || 0) * MESES[e.cadencia] : Number(e.valor_mensal) || 0;

  async function salvar() {
    setSalvando(true);
    const r = await fetch(`/api/planos/${p.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...e, migrado: true }),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (r?.ok) onSalvo(); else alert("Falhou: " + (r?.erro || "erro"));
  }

  return (
    <div style={{ ...painel.card,
      borderLeft: !p.ativo ? "4px solid #94a3b8"
        : p.faltaData ? "4px solid #d97706"
        : p.atrasado ? "4px solid #dc2626" : `1px solid ${cor.linha}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <Link href={`/painel/clientes/${p.clienteId}`} style={{ textDecoration: "none" }}>
            <strong style={{ color: cor.navy }}>{p.cliente}</strong>
          </Link>
          <span style={{ color: cor.cinza }}> · {p.jazigo}</span>
          <div style={{ fontSize: 13, color: cor.cinza, marginTop: 3 }}>
            {p.quadra}{p.rua ? ` · ${p.rua}` : ""} · {p.cadencia} ·{" "}
            <b style={{ color: cor.navy }}>{money(p.valorMensal)}/mês</b>
            {MESES[p.cadencia] > 1 && ` (${money(p.valorCiclo)} por cobrança)`}
            {p.antecipada && " · antecipada"}
            {!p.ativo && " · INATIVO"}
            {p.conferido && " · ✓"}
          </div>
          <div style={{ fontSize: 13, marginTop: 3,
                        color: p.faltaData ? "#d97706" : cor.cinza }}>
            Pago até {dt(p.pagoAte)} · Lava em <b>{dt(p.proximaLavagem)}</b> · Cobra em <b>{dt(p.proximaCobranca)}</b>
            {p.faltaData && " ← falta preencher"}
          </div>
        </div>
        <button style={{ ...painel.botaoMiniSec, alignSelf: "flex-start" }} onClick={onAbrir}>
          {aberto ? "Fechar" : "Editar"}
        </button>
      </div>

      {aberto && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${cor.linha}` }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label style={painel.rotulo}>Periodicidade</label>
              <select style={{ ...painel.input, width: 130 }} value={e.cadencia}
                      onChange={(x) => setE({ ...e, cadencia: x.target.value })}>
                {Object.keys(MESES).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={painel.rotulo}>Valor mensal</label>
              <input type="number" style={{ ...painel.input, width: 110 }} value={e.valor_mensal}
                     onChange={(x) => setE({ ...e, valor_mensal: Number(x.target.value) })} />
            </div>
            <div>
              <label style={painel.rotulo}>Cobrança do ciclo</label>
              <div style={{ ...painel.input, width: 120, background: "#f8fafc", fontWeight: 700 }}>
                {money(ciclo)}
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 12 }}>
              <input type="checkbox" checked={e.ativo}
                     onChange={(x) => setE({ ...e, ativo: x.target.checked })} /> Ativo
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <div>
              <label style={painel.rotulo}>Pago até</label>
              <input type="date" style={{ ...painel.input, width: 155 }} value={e.pago_ate}
                     onChange={(x) => setE({ ...e, pago_ate: x.target.value })} />
            </div>
            <div>
              <label style={painel.rotulo}>Próxima lavagem</label>
              <input type="date" style={{ ...painel.input, width: 155 }} value={e.proximo_servico}
                     onChange={(x) => setE({ ...e, proximo_servico: x.target.value })} />
            </div>
            <div>
              <label style={painel.rotulo}>Próxima cobrança</label>
              <input type="date" style={{ ...painel.input, width: 155 }} value={e.proxima_cobranca}
                     onChange={(x) => setE({ ...e, proxima_cobranca: x.target.value })} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button style={painel.botao} onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            <Link href={`/painel/clientes/${p.clienteId}`}
                  style={{ ...painel.botaoSec, textDecoration: "none" }}>
              Abrir ficha completa
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
