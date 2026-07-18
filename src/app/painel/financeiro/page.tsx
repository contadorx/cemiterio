"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PainelNav, painel, cor } from "../ui";
import Entradas from "./Entradas";

interface Comp {
  id: string;
  imagem: string | null;
  valor: number | null;
  data: string | null;
  idTransacao: string | null;
  cliente: string;
}

export default function Financeiro() {
  const [aba, setAba] = useState<"gestao" | "entradas" | "conferir" | "relatorio" | "jazigos">("gestao");

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/financeiro" />
      <div style={painel.conteudo}>
        <h1 style={painel.h1}>Financeiro</h1>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {([
            ["gestao", "Gestão do negócio"],
            ["conferir", "Comprovantes a conferir"],
            ["entradas", "Entradas do banco"],
            ["relatorio", "Recebido no mês"],
            ["jazigos", "Resultado por jazigo"],
          ] as const).map(([v, rot]) => (
            <button key={v} style={aba === v ? painel.botao : painel.botaoSec}
                    onClick={() => setAba(v)}>
              {rot}
            </button>
          ))}
        </div>

        {aba === "gestao" && <Gestao />}
        {aba === "conferir" && <Conferir />}
        {aba === "entradas" && <Entradas />}
        {aba === "relatorio" && <Relatorio />}
        {aba === "jazigos" && <PorJazigo />}
      </div>
    </div>
  );
}

function Conferir() {
  const [itens, setItens] = useState<Comp[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function carregar() {
    const r = await fetch("/api/comprovantes").then((x) => x.json());
    if (r.ok) setItens(r.comprovantes);
  }
  useEffect(() => {
    carregar();
  }, []);

  async function conciliar(id: string, aprovar: boolean) {
    setOcupado(id);
    await fetch("/api/financeiro/conciliar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comprovanteId: id, aprovar }),
    });
    setOcupado(null);
    carregar();
  }

  if (itens.length === 0) return <p style={{ color: cor.cinza }}>Nada para conferir agora.</p>;

  return (
    <>
      {itens.map((c) => (
        <div key={c.id} style={painel.card}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <strong style={{ color: cor.navy }}>{c.cliente}</strong>
            <span style={{ fontWeight: 800, color: cor.teal }}>
              {c.valor != null ? `R$ ${Number(c.valor).toFixed(2)}` : "valor não lido"}
            </span>
          </div>
          <div style={{ fontSize: 14, color: cor.cinza }}>
            {c.data || "sem data"} {c.idTransacao ? `· ${c.idTransacao}` : ""}
          </div>
          {c.imagem && (
            <a href={c.imagem} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.imagem} alt="comprovante" style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 10, marginTop: 10 }} />
            </a>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={painel.botao} disabled={ocupado === c.id} onClick={() => conciliar(c.id, true)}>
              Confirmar pagamento
            </button>
            <button style={painel.botaoPerigo} disabled={ocupado === c.id} onClick={() => conciliar(c.id, false)}>
              Rejeitar
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

function Relatorio() {
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));
  const [d, setD] = useState<any>(null);
  const [carregando, setCarregando] = useState(false);

  async function carregar(m: string) {
    setCarregando(true);
    const r = await fetch(`/api/financeiro/relatorio?mes=${m}`).then((x) => x.json()).catch(() => null);
    setD(r);
    setCarregando(false);
  }
  useEffect(() => {
    carregar(mes);
  }, [mes]);

  const real = (n: number) => `R$ ${Number(n).toFixed(2)}`;

  return (
    <>
      <div style={painel.card}>
        <label style={painel.rotulo}>Mês de referência</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={{ ...painel.input, width: 200 }} />
          <a href={`/api/financeiro/export?mes=${mes}`} style={{ ...painel.botaoSec, textDecoration: "none", display: "inline-block" }}>
            Exportar CSV
          </a>
        </div>
      </div>

      {carregando && <p style={{ color: cor.cinza }}>Carregando...</p>}

      {d?.ok && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12, marginBottom: 8 }}>
            <CartaoGestao titulo="Recebido no mês" valor={real(d.recebido)} cor="#16a34a" />
            <CartaoGestao titulo="Serviço prestado" valor={real(d.executado)} cor={cor.navy} />
            <CartaoGestao titulo="A conferir" valor={real(d.aConferir)} cor="#d97706" />
            <CartaoGestao titulo="Total a receber" valor={real(d.totalReceber)} cor="#dc2626" />
          </div>

          <div style={painel.card}>
            <strong style={{ color: cor.navy }}>Em aberto (a cobrar)</strong>
            {d.emAberto.length === 0 && <p style={{ color: cor.cinza, margin: "8px 0 0" }}>Ninguém em aberto. 🎉</p>}
            {(d.emAberto || []).map((x: any, i: number) => (
              <div key={i} style={linha}>
                <span>{x.cliente}</span>
                <span style={{ color: "#dc2626", fontWeight: 700 }}>{real(x.valor)}</span>
              </div>
            ))}
          </div>

          <div style={painel.card}>
            <strong style={{ color: cor.navy }}>Adiantados (crédito a usar)</strong>
            {d.adiantados.length === 0 && <p style={{ color: cor.cinza, margin: "8px 0 0" }}>Ninguém adiantado.</p>}
            {(d.adiantados || []).map((x: any, i: number) => (
              <div key={i} style={linha}>
                <span>{x.cliente}</span>
                <span style={{ color: "#16a34a", fontWeight: 700 }}>{real(x.valor)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Cartao({ titulo, valor, cor: c }: { titulo: string; valor: string; cor: string }) {
  return (
    <div style={{ ...painel.card, marginBottom: 0 }}>
      <div style={{ fontSize: 15, color: cor.cinza }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: c, marginTop: 4 }}>{valor}</div>
    </div>
  );
}

const linha: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "8px 0",
  borderTop: `1px solid ${cor.linha}`,
  marginTop: 8,
  fontSize: 15,
  color: cor.navy,
};


function Gestao() {
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));
  const [d, setD] = useState<any>(null);
  const [novo, setNovo] = useState({ tipo: "saida", valor: "", data: new Date().toISOString().slice(0, 10), categoriaId: "", descricao: "" });
  const [lancando, setLancando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/financeiro/gestao?mes=${mes}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) setD(r);
  }, [mes]);
  useEffect(() => { carregar(); }, [carregar]);

  async function lancar() {
    const v = Number(String(novo.valor).replace(",", "."));
    if (!v || v <= 0) return alert("Informe o valor.");
    setLancando(true);
    const r = await fetch("/api/financeiro/gestao", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...novo, valor: v }),
    }).then((x) => x.json()).catch(() => null);
    setLancando(false);
    if (r?.ok) { setNovo({ ...novo, valor: "", descricao: "" }); carregar(); }
    else alert("Falhou: " + (r?.erro || "erro"));
  }

  async function excluir(id: string) {
    if (!confirm("Excluir este lançamento?")) return;
    await fetch(`/api/financeiro/lancamentos/${id}`, { method: "DELETE" });
    carregar();
  }

  if (!d) return <p style={{ color: cor.cinza }}>Carregando…</p>;
  const r = d.resumo;
  const money = (n: number) => `R$ ${Number(n || 0).toFixed(2)}`;
  const cats = d.categorias || [];
  const entradas = (d.fluxo || []).filter((x: any) => x.tipo === "entrada");
  const saidas = (d.fluxo || []).filter((x: any) => x.tipo === "saida");

  return (
    <>
      <div style={{ ...painel.card, padding: 12 }}>
        <label style={painel.rotulo}>Mês</label>
        <input type="month" style={{ ...painel.input, width: 180 }} value={mes}
               onChange={(e) => setMes(e.target.value)} />
      </div>

      {/* resultado do mês */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 14 }}>
        <CartaoGestao titulo="Entradas" valor={money(r.entradas)} cor={cor.teal} />
        <CartaoGestao titulo="Saídas" valor={money(r.saidas)} cor="#dc2626" />
        <CartaoGestao titulo="Resultado do mês"
                valor={money(r.resultado)}
                cor={r.resultado >= 0 ? cor.teal : "#dc2626"} destaque />
        <CartaoGestao titulo={d.ia.medido ? "Custo de IA (medido)" : "Custo de IA (estimado)"}
                valor={money(d.ia.custoMes)} cor="#7c3aed"
                rodape={d.ia.medido
                  ? `${d.ia.chamadas} chamadas · ${money(d.ia.custoPorDia)}/dia · ${((d.ia.tokensEntrada + d.ia.tokensSaida) / 1000).toFixed(0)}k tokens`
                  : `${d.ia.chamadas} chamadas · ainda sem medição por tokens`} />
      </div>

      {r.naoLancado > 0 && (
        <div style={{ ...painel.card, borderLeft: "4px solid #d97706", background: "#fffbeb" }}>
          <strong style={{ color: "#92400e" }}>{money(r.naoLancado)} recebido das famílias sem lançamento aqui</strong>
          <p style={{ color: "#78350f", fontSize: 15, margin: "6px 0 0" }}>
            As famílias pagaram {money(r.recebidoFamilias)} este mês, mas só {money(r.entradas)} está
            classificado no fluxo de caixa. Lance a diferença como entrada para o resultado ficar certo.
          </p>
        </div>
      )}

      {/* novo lançamento */}
      <div style={painel.card}>
        <strong style={{ color: cor.navy }}>Novo lançamento</strong>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
          <div>
            <label style={painel.rotulo}>Tipo</label>
            <select style={{ ...painel.input, width: 120 }} value={novo.tipo}
                    onChange={(e) => setNovo({ ...novo, tipo: e.target.value, categoriaId: "" })}>
              <option value="saida">Saída</option>
              <option value="entrada">Entrada</option>
            </select>
          </div>
          <div>
            <label style={painel.rotulo}>Categoria</label>
            <select style={{ ...painel.input, width: 190 }} value={novo.categoriaId}
                    onChange={(e) => setNovo({ ...novo, categoriaId: e.target.value })}>
              <option value="">— escolher —</option>
              {cats.filter((c: any) => c.tipo === novo.tipo).map((c: any) =>
                <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={painel.rotulo}>Valor</label>
            <input style={{ ...painel.input, width: 110 }} value={novo.valor}
                   onChange={(e) => setNovo({ ...novo, valor: e.target.value })} placeholder="0,00" />
          </div>
          <div>
            <label style={painel.rotulo}>Data</label>
            <input type="date" style={{ ...painel.input, width: 160 }} value={novo.data}
                   onChange={(e) => setNovo({ ...novo, data: e.target.value })} />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={painel.rotulo}>Descrição</label>
            <input style={painel.input} value={novo.descricao}
                   onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
                   placeholder="ex.: 2 vassouras + água sanitária" />
          </div>
          <button style={painel.botao} onClick={lancar} disabled={lancando}>
            {lancando ? "…" : "Lançar"}
          </button>
        </div>
      </div>

      {/* fluxo por categoria */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
        <div style={painel.card}>
          <strong style={{ color: cor.teal }}>Entradas por categoria</strong>
          {entradas.length === 0 && <p style={{ color: cor.cinza, fontSize: 14, margin: "8px 0 0" }}>Nada lançado.</p>}
          {entradas.map((x: any, i: number) => (
            <LinhaGestao key={i} nome={x.categoria} qtd={x.qtd} valor={money(x.total)} />
          ))}
        </div>
        <div style={painel.card}>
          <strong style={{ color: "#dc2626" }}>Saídas por categoria</strong>
          {saidas.length === 0 && <p style={{ color: cor.cinza, fontSize: 14, margin: "8px 0 0" }}>Nada lançado.</p>}
          {saidas.map((x: any, i: number) => (
            <LinhaGestao key={i} nome={x.categoria} qtd={x.qtd} valor={money(x.total)}
                   sub={x.grupo === "retirada" ? "retirada" : x.grupo === "pessoal" ? "pessoal" : undefined} />
          ))}
        </div>
      </div>

      {/* lançamentos do mês */}
      <div style={painel.card}>
        <strong style={{ color: cor.navy }}>Lançamentos de {mes}</strong>
        {(d.lancamentos || []).length === 0 && (
          <p style={{ color: cor.cinza, fontSize: 14, margin: "8px 0 0" }}>Nenhum lançamento neste mês.</p>
        )}
        {(d.lancamentos || []).map((l: any) => (
          <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 10,
                 alignItems: "center", padding: "8px 0", borderTop: `1px solid ${cor.linha}`, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 14 }}>
                {l.categorias_financeiras?.nome || "Sem categoria"}
                {l.descricao ? <span style={{ color: cor.cinza }}> · {l.descricao}</span> : null}
              </div>
              <div style={{ fontSize: 14, color: cor.cinza }}>
                {new Date(l.data + "T12:00:00").toLocaleDateString("pt-BR")}
                {l.automatico ? " · automático" : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <b style={{ color: l.tipo === "entrada" ? cor.teal : "#dc2626" }}>
                {l.tipo === "entrada" ? "+" : "−"} {money(l.valor)}
              </b>
              {!l.automatico && (
                <button style={{ ...painel.botaoSec, padding: "4px 10px", fontSize: 14 }}
                        onClick={() => excluir(l.id)}>excluir</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function CartaoGestao({ titulo, valor, cor: c, rodape, destaque }:
  { titulo: string; valor: string; cor: string; rodape?: string; destaque?: boolean }) {
  return (
    <div style={{ ...painel.card, marginBottom: 0, borderTop: `3px solid ${c}` }}>
      <div style={{ fontSize: 14, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>{titulo}</div>
      <div style={{ fontSize: destaque ? 26 : 22, fontWeight: 700, color: c, marginTop: 4 }}>{valor}</div>
      {rodape && <div style={{ fontSize: 14, color: "#6b7280", marginTop: 4 }}>{rodape}</div>}
    </div>
  );
}

function LinhaGestao({ nome, qtd, valor, sub }: { nome: string; qtd: number; valor: string; sub?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0",
                  borderTop: "1px solid #e2e8f0", marginTop: 8 }}>
      <span>{nome} {sub && <span style={{ fontSize: 15, color: "#6b7280" }}>({sub})</span>}
        <span style={{ color: "#6b7280", fontSize: 14 }}> · {qtd}x</span></span>
      <b>{valor}</b>
    </div>
  );
}


function PorJazigo() {
  const [meses, setMeses] = useState(12);
  const [d, setD] = useState<any>(null);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/financeiro/jazigos?meses=${meses}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) setD(r);
  }, [meses]);
  useEffect(() => { carregar(); }, [carregar]);

  if (!d) return <p style={{ color: cor.cinza }}>Carregando…</p>;
  const money = (n: number) => `R$ ${Number(n || 0).toFixed(2)}`;

  return (
    <>
      <div style={{ ...painel.card, padding: 12 }}>
        <label style={painel.rotulo}>Período</label>
        <select style={{ ...painel.input, width: 180 }} value={meses}
                onChange={(e) => setMeses(Number(e.target.value))}>
          <option value={3}>Últimos 3 meses</option>
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Últimos 12 meses</option>
          <option value={24}>Últimos 2 anos</option>
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 14 }}>
        <CartaoGestao titulo="Receita" valor={money(d.totais.receita)} cor={cor.teal} />
        <CartaoGestao titulo="Custo (mão de obra + material)" valor={money(d.totais.custo)} cor="#dc2626" />
        <CartaoGestao titulo="Margem" valor={money(d.totais.margem)} destaque
                cor={d.totais.margem >= 0 ? cor.teal : "#dc2626"} />
        <CartaoGestao titulo="No prejuízo" valor={String(d.totais.noPrejuizo)} cor="#d97706"
                rodape="jazigos que custam mais do que rendem" />
      </div>

      {d.semMedicao > 0 && (
        <div style={{ ...painel.card, borderLeft: "4px solid #d97706", background: "#fffbeb" }}>
          <strong style={{ color: "#92400e" }}>{d.semMedicao} jazigo(s) sem tempo medido</strong>
          <p style={{ color: "#78350f", fontSize: 15, margin: "6px 0 0" }}>
            O custo de mão de obra só aparece quando a Nina usa &ldquo;Começar&rdquo; e
            &ldquo;Finalizar&rdquo; no app. Até lá, esses jazigos mostram margem cheia — que não é real.
          </p>
        </div>
      )}

      <div style={painel.card}>
        <strong style={{ color: cor.navy }}>Do pior para o melhor</strong>
        <p style={{ color: cor.cinza, fontSize: 15, margin: "6px 0 10px" }}>
          Margem = o que a família paga menos o tempo gasto e o material.
        </p>
        {(d.jazigos || []).map((j: any) => {
          const semTempo = !j.minutos;
          return (
            <div key={j.tumulo_id} style={{ display: "flex", justifyContent: "space-between", gap: 10,
                   flexWrap: "wrap", padding: "10px 0", borderTop: `1px solid ${cor.linha}` }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <b style={{ color: cor.navy }}>{j.jazigo}</b>
                <span style={{ color: cor.cinza }}> · {j.cliente || "—"}</span>
                <div style={{ fontSize: 15, color: cor.cinza }}>
                  {j.quadra}{j.rua ? ` · ${j.rua}` : ""} · {j.limpezas} limpeza(s)
                  {semTempo ? " · tempo não medido" : ` · ${j.minutos} min`}
                </div>
              </div>
              <div style={{ textAlign: "right", minWidth: 150 }}>
                <div style={{ fontSize: 15, color: cor.cinza }}>
                  {money(j.receita)} − {money(j.custo_total)}
                </div>
                <b style={{ color: Number(j.margem) < 0 ? "#dc2626" : cor.teal, fontSize: 16 }}>
                  {money(j.margem)}{j.margem_pct != null && ` (${j.margem_pct}%)`}
                </b>
              </div>
            </div>
          );
        })}
        {d.jazigos.length === 0 && (
          <p style={{ color: cor.cinza, fontSize: 14 }}>Nenhuma limpeza executada no período.</p>
        )}
      </div>
    </>
  );
}


/**
 * BATER COM O BANCO
 *
 * Lista os pagamentos que entraram sem comprovante — aqueles em que a família
 * disse que pagou e você registrou para não continuar cobrando.
 * Aqui você abre o extrato ao lado e vai dando o visto.
 */
function BaterComBanco() {
  const [d, setD] = useState<any>(null);
  const [meses, setMeses] = useState(6);
  const [soPendentes, setSoPendentes] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/financeiro/conferir-banco?meses=${meses}`)
      .then((x) => x.json()).catch(() => null);
    if (r?.ok) setD(r);
  }, [meses]);
  useEffect(() => { carregar(); }, [carregar]);

  async function marcar(id: string, conferido: boolean, nota?: string) {
    setOcupado(id);
    await fetch("/api/financeiro/conferir-banco", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movimentoId: id, conferido, nota }),
    });
    setOcupado(null);
    carregar();
  }

  if (!d) return <p style={{ color: cor.cinza }}>Carregando…</p>;
  const money = (n: number) => `R$ ${Number(n || 0).toFixed(2)}`;
  const lista = (d.lancamentos || []).filter((x: any) => (soPendentes ? !x.conferido : true));

  return (
    <>
      <div style={{ ...painel.card, background: "#f8fafc" }}>
        <p style={{ margin: 0, fontSize: 15, color: cor.cinza, lineHeight: 1.6 }}>
          Estes valores entraram porque a família <b>disse</b> que pagou — sem comprovante.
          Foram lançados na conta dela para a cobrança parar. Abra o extrato do banco ao lado
          e vá dando o visto no que encontrar.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
                    gap: 12, marginBottom: 14 }}>
        <CartaoGestao titulo="Falta conferir" valor={String(d.totais.pendentes)}
                cor={d.totais.pendentes ? "#d97706" : cor.teal} destaque />
        <CartaoGestao titulo="Valor em jogo" valor={money(d.totais.valorPendente)} cor={cor.navy} />
        <CartaoGestao titulo="Já conferidos" valor={String(d.totais.conferidos)} cor={cor.teal} />
        {d.totais.maisAntigo > 30 && (
          <CartaoGestao titulo="Mais antigo" valor={`${d.totais.maisAntigo} dias`} cor="#b91c1c"
                  rodape="esperando conferência" />
        )}
      </div>

      <div style={{ ...painel.card, padding: 12 }}>
        <div data-filtros style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select style={{ ...painel.input, width: "auto" }} value={meses}
                  onChange={(e) => setMeses(Number(e.target.value))}>
            <option value={3}>Últimos 3 meses</option>
            <option value={6}>Últimos 6 meses</option>
            <option value={12}>Último ano</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, color: cor.cinza }}>
            <input type="checkbox" checked={soPendentes}
                   onChange={(e) => setSoPendentes(e.target.checked)} />
            só o que falta conferir
          </label>
        </div>
      </div>

      {lista.length === 0 && (
        <div style={painel.card}>
          <p style={{ margin: 0, color: cor.cinza }}>
            {soPendentes
              ? "Tudo conferido. 🌿"
              : "Nenhum pagamento sem comprovante no período."}
          </p>
        </div>
      )}

      {lista.map((x: any) => (
        <div key={x.id} style={{ ...painel.card,
          borderLeft: x.conferido ? `4px solid ${cor.teal}`
            : x.dias_esperando > 30 ? "4px solid #b91c1c" : "4px solid #d97706" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <Link href={`/painel/clientes/${x.cliente_id}`} style={{ textDecoration: "none" }}>
                <strong style={{ color: cor.navy, fontSize: 16 }}>{x.cliente}</strong>
              </Link>
              <div style={{ fontSize: 15, color: cor.cinza, marginTop: 3 }}>
                {new Date(x.data + "T12:00:00").toLocaleDateString("pt-BR")}
                {" · "}{x.descricao || "pagamento informado"}
                {!x.conferido && x.dias_esperando > 0 && (
                  <span style={{ color: x.dias_esperando > 30 ? "#b91c1c" : "#92400e" }}>
                    {" · "}há {x.dias_esperando} dia{x.dias_esperando > 1 ? "s" : ""} esperando
                  </span>
                )}
              </div>
              {x.nota && (
                <div style={{ fontSize: 14, color: cor.cinza, marginTop: 4, fontStyle: "italic" }}>
                  {x.nota}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ color: cor.navy, fontSize: 17 }}>{money(x.valor)}</b>
              {x.conferido ? (
                <button style={painel.botaoSec} disabled={ocupado === x.id}
                        onClick={() => marcar(x.id, false)}>
                  ✓ conferido · desfazer
                </button>
              ) : (
                <>
                  <button style={painel.botao} disabled={ocupado === x.id}
                          onClick={() => marcar(x.id, true)}>
                    Achei no extrato
                  </button>
                  <button style={painel.botaoSec} disabled={ocupado === x.id}
                          onClick={() => {
                            const nota = prompt(
                              "Não achou no extrato? Anote o que fazer:\n" +
                              "(ex.: perguntar a data certa, conferir outra conta)", "");
                            if (nota !== null) marcar(x.id, false, nota || "não localizado no extrato");
                          }}>
                    Não achei
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
