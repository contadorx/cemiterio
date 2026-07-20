"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { painel, cor } from "../ui";

/**
 * ENTRADAS DO BANCO
 *
 * Você olha o extrato, vê que entrou R$ 140 — disso não há dúvida. O que falta
 * é saber de quem foi: o Pix veio do filho, da nora, de uma conta com outro
 * nome. Aqui a entrada é registrada como certa e fica esperando dono.
 *
 * Enquanto não tem dono, não entra na conta de ninguém. Ao identificar, vira
 * crédito da família e a cobrança para.
 */
export default function Entradas() {
  const [d, setD] = useState<any>(null);
  const [pendentes, setPendentes] = useState(true);
  const [meses, setMeses] = useState(3);
  const [novo, setNovo] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const p = new URLSearchParams({ meses: String(meses) });
    if (pendentes) p.set("pendentes", "1");
    const r = await fetch(`/api/financeiro/entradas?${p}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) setD(r);
  }, [pendentes, meses]);
  useEffect(() => { carregar(); }, [carregar]);

  async function desfazer(id: string) {
    if (!confirm("Desfazer a identificação? O crédito sai da conta da família.")) return;
    setOcupado(id);
    await fetch("/api/financeiro/entradas", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entradaId: id }),
    });
    setOcupado(null); carregar();
  }

  async function apagar(id: string) {
    if (!confirm("Apagar esta entrada? Use quando tiver lançado errado.")) return;
    setOcupado(id);
    await fetch(`/api/financeiro/entradas?id=${id}`, { method: "DELETE" });
    setOcupado(null); carregar();
  }

  if (!d) return <p style={{ color: cor.cinza }}>Carregando…</p>;
  const money = (n: number) => `R$ ${Number(n || 0).toFixed(2)}`;

  return (
    <>
      <div style={{ ...painel.card, background: "#f8fafc" }}>
        <p style={{ margin: 0, fontSize: 15, color: cor.cinza, lineHeight: 1.6 }}>
          Lance aqui o que você vê no extrato. O dinheiro entrou — só falta dizer de quem é.
          Enquanto não tiver dono, não entra na conta de ninguém.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
                    gap: 12, marginBottom: 14 }}>
        <Cartao titulo="Sem dono" valor={String(d.totais.pendentes)}
                cor={d.totais.pendentes ? "#d97706" : cor.teal} destaque />
        <Cartao titulo="Valor sem dono" valor={money(d.totais.valorPendente)} cor={cor.navy} />
        <Cartao titulo="Já identificadas" valor={String(d.totais.identificadas)} cor={cor.teal} />
        <Cartao titulo="Entrou no período" valor={money(d.totais.recebidoPeriodo)} cor={cor.teal} />
      </div>

      <div style={{ ...painel.card, padding: 12 }}>
        <div data-filtros style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select style={{ ...painel.input, width: "auto" }} value={meses}
                  onChange={(e) => setMeses(Number(e.target.value))}>
            <option value={1}>Último mês</option>
            <option value={3}>Últimos 3 meses</option>
            <option value={12}>Último ano</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, color: cor.cinza }}>
            <input type="checkbox" checked={pendentes}
                   onChange={(e) => setPendentes(e.target.checked)} />
            só as que faltam identificar
          </label>
          <button style={{ ...painel.botao, marginLeft: "auto" }} onClick={() => setNovo(!novo)}>
            {novo ? "Fechar" : "+ Lançar entrada do extrato"}
          </button>
        </div>
      </div>

      {novo && <NovaEntrada onPronto={() => { setNovo(false); carregar(); }} />}

      {(d.entradas || []).length === 0 && (
        <div style={painel.card}>
          <p style={{ margin: 0, color: cor.cinza }}>
            {pendentes ? "Nenhuma entrada esperando dono. 🌿" : "Nenhuma entrada no período."}
          </p>
        </div>
      )}

      {(d.entradas || []).map((e: any) => (
        <Entrada key={e.id} e={e} ocupado={ocupado === e.id}
                 onMudou={carregar} onDesfazer={() => desfazer(e.id)} onApagar={() => apagar(e.id)} />
      ))}
    </>
  );
}

function Entrada({ e, ocupado, onMudou, onDesfazer, onApagar }: any) {
  const [palpites, setPalpites] = useState<any[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [busca, setBusca] = useState("");
  const [clientes, setClientes] = useState<any[]>([]);
  const money = (n: number) => `R$ ${Number(n || 0).toFixed(2)}`;

  async function pedirPalpites() {
    setBuscando(true);
    const r = await fetch(`/api/financeiro/entradas/palpites?id=${e.id}`)
      .then((x) => x.json()).catch(() => null);
    setBuscando(false);
    setPalpites(r?.palpites || []);
  }

  async function procurar(termo: string) {
    setBusca(termo);
    if (termo.length < 2) { setClientes([]); return; }
    const r = await fetch(`/api/clientes?busca=${encodeURIComponent(termo)}`)
      .then((x) => x.json()).catch(() => null);
    setClientes((r?.clientes || []).slice(0, 6));
  }

  async function identificar(clienteId: string, nome: string) {
    if (!confirm(`Esta entrada de ${money(e.valor)} é da família ${nome}?`)) return;
    const r = await fetch("/api/financeiro/entradas", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entradaId: e.id, clienteId }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) onMudou(); else alert("Não consegui identificar.");
  }

  const identificada = !!e.identificada_em;

  return (
    <div style={{ ...painel.card,
      borderLeft: identificada ? `4px solid ${cor.teal}` : "4px solid #d97706" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <b style={{ color: cor.navy, fontSize: 19 }}>{money(e.valor)}</b>
            <span style={{ color: cor.cinza, fontSize: 15 }}>
              {new Date(e.data + "T12:00:00").toLocaleDateString("pt-BR")}
            </span>
          </div>
          {e.remetente && (
            <div style={{ fontSize: 15, color: cor.navy, marginTop: 3 }}>
              de <b>{e.remetente}</b>
            </div>
          )}
          {e.observacao && (
            <div style={{ fontSize: 14, color: cor.cinza, marginTop: 2 }}>{e.observacao}</div>
          )}
          {identificada && (
            <div style={{ fontSize: 15, color: cor.teal, marginTop: 4 }}>
              ✓ é da família{" "}
              <Link href={`/painel/clientes/${e.cliente_id}`} style={{ color: cor.teal }}>
                {e.clientes?.nome}
              </Link>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
          {identificada ? (
            <button style={painel.botaoSec} disabled={ocupado} onClick={onDesfazer}>
              Era de outra família
            </button>
          ) : (
            <button style={painel.botao} disabled={buscando} onClick={pedirPalpites}>
              {buscando ? "…" : palpites ? "Ver de novo" : "De quem é?"}
            </button>
          )}
          <button style={painel.botaoMiniSec} disabled={ocupado} onClick={onApagar}>
            Apagar
          </button>
        </div>
      </div>

      {palpites && !identificada && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${cor.linha}` }}>
          {palpites.length > 0 ? (
            <>
              <div style={painel.rotulo}>Pode ser de:</div>
              {palpites.map((p: any) => (
                <div key={p.cliente_id} style={{ display: "flex", justifyContent: "space-between",
                       alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0",
                       borderTop: `1px solid ${cor.linha}` }}>
                  <div>
                    <b style={{ color: cor.navy }}>{p.nome}</b>
                    <div style={{ fontSize: 14, color: p.forca >= 90 ? cor.teal : cor.cinza }}>
                      {p.motivo}
                    </div>
                  </div>
                  <button style={p.forca >= 90 ? painel.botao : painel.botaoSec}
                          onClick={() => identificar(p.cliente_id, p.nome)}>
                    É esta
                  </button>
                </div>
              ))}
            </>
          ) : (
            <p style={{ color: cor.cinza, fontSize: 15, margin: 0 }}>
              Nenhum palpite — nenhum nome parecido nem valor que bata. Procure abaixo.
            </p>
          )}

          <div style={{ marginTop: 12 }}>
            <label style={painel.rotulo}>Procurar a família pelo nome</label>
            <input style={painel.input} value={busca} onChange={(e2) => procurar(e2.target.value)}
                   placeholder="digite parte do nome…" />
            {clientes.map((c: any) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between",
                     alignItems: "center", padding: "8px 0", borderTop: `1px solid ${cor.linha}` }}>
                <div>
                  <b style={{ color: cor.navy }}>{c.nome}</b>
                  <div style={{ fontSize: 14, color: c.atrasado ? "#dc2626" : cor.cinza }}>
                    {c.saldo < 0 ? `deve ${money(Math.abs(c.saldo))}` : c.saldo > 0 ? "adiantada" : "em dia"}
                  </div>
                </div>
                <button style={painel.botaoSec} onClick={() => identificar(c.id, c.nome)}>É esta</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NovaEntrada({ onPronto }: { onPronto: () => void }) {
  const [f, setF] = useState({
    valor: "", data: new Date().toISOString().slice(0, 10),
    remetente: "", identificador: "", observacao: "",
  });
  const [busca, setBusca] = useState("");
  const [clientes, setClientes] = useState<any[]>([]);
  const [cliente, setCliente] = useState<any>(null);
  const [debitos, setDebitos] = useState<any[]>([]);
  const [escolhidos, setEscolhidos] = useState<Record<string, boolean>>({});
  const [salvando, setSalvando] = useState(false);

  const money = (n: number) => `R$ ${Number(n || 0).toFixed(2)}`;

  async function procurar(termo: string) {
    setBusca(termo);
    if (termo.length < 2) { setClientes([]); return; }
    const r = await fetch(`/api/clientes?busca=${encodeURIComponent(termo)}`)
      .then((x) => x.json()).catch(() => null);
    setClientes((r?.clientes || []).slice(0, 6));
  }

  async function escolherCliente(c: any) {
    setCliente(c);
    setClientes([]);
    setBusca("");
    const r = await fetch(`/api/financeiro/debitos?cliente=${c.id}`)
      .then((x) => x.json()).catch(() => null);
    const lista = r?.debitos || [];
    setDebitos(lista);
    // marca tudo por padrão: o normal é o Pix pagar o que está em aberto
    const m: Record<string, boolean> = {};
    for (const d of lista) m[d.movimento_id] = true;
    setEscolhidos(m);
    // sugere o valor total em aberto, se ainda não digitou nada
    if (!f.valor && r?.total) setF((v) => ({ ...v, valor: String(r.total) }));
  }

  async function salvar() {
    const v = Number(String(f.valor).replace(",", "."));
    if (!v || v <= 0) return alert("Informe o valor que entrou.");
    setSalvando(true);
    const marcados = debitos.filter((d) => escolhidos[d.movimento_id]).map((d) => d.movimento_id);
    const r = await fetch("/api/financeiro/entradas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...f, valor: v,
        clienteId: cliente?.id || null,
        debitos: cliente && marcados.length ? marcados : null,
      }),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (!r?.ok) return alert("Falhou: " + (r?.erro || "erro"));

    if (cliente && r.sobrou > 0) {
      alert(`Lançado. ${r.quitados} lavagem(ns) quitada(s) e ${money(r.sobrou)} ficaram como crédito da família.`);
    } else if (cliente) {
      alert(`Lançado e creditado para ${cliente.nome}. ${r.quitados} lavagem(ns) quitada(s).`);
    }
    onPronto();
  }

  const totalEscolhido = debitos
    .filter((d) => escolhidos[d.movimento_id])
    .reduce((s, d) => s + Number(d.em_aberto), 0);

  return (
    <div style={{ ...painel.card, borderLeft: `4px solid ${cor.navy}` }}>
      <strong style={{ color: cor.navy }}>O que entrou no extrato</strong>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
        <div>
          <label style={painel.rotulo}>Valor</label>
          <input style={{ ...painel.input, width: 130 }} value={f.valor}
                 onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder="0,00" />
        </div>
        <div>
          <label style={painel.rotulo}>Data</label>
          <input type="date" style={{ ...painel.input, width: 165 }} value={f.data}
                 onChange={(e) => setF({ ...f, data: e.target.value })} />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={painel.rotulo}>Nome no extrato (opcional)</label>
          <input style={painel.input} value={f.remetente}
                 onChange={(e) => setF({ ...f, remetente: e.target.value })}
                 placeholder="ex.: ROBERTO C SILVA" />
        </div>
      </div>

      {/* ------------------ de quem é ------------------ */}
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${cor.linha}` }}>
        <label style={painel.rotulo}>De qual família é este dinheiro?</label>

        {cliente ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                        gap: 10, flexWrap: "wrap", background: "#f0fdfa", padding: 12,
                        borderRadius: 10, border: `1px solid ${cor.teal}` }}>
            <div>
              <b style={{ color: cor.navy, fontSize: 16 }}>{cliente.nome}</b>
              <div style={{ fontSize: 15, color: cliente.atrasado ? "#dc2626" : cor.cinza }}>
                {cliente.saldo < 0 ? `deve ${money(Math.abs(cliente.saldo))}`
                  : cliente.saldo > 0 ? `tem ${money(cliente.saldo)} de crédito` : "está em dia"}
              </div>
            </div>
            <button style={painel.botaoSec}
                    onClick={() => { setCliente(null); setDebitos([]); setEscolhidos({}); }}>
              trocar
            </button>
          </div>
        ) : (
          <>
            <input style={painel.input} value={busca} onChange={(e) => procurar(e.target.value)}
                   placeholder="digite o nome da família…" />
            {clientes.map((c: any) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between",
                     alignItems: "center", padding: "10px 0", borderTop: `1px solid ${cor.linha}` }}>
                <div>
                  <b style={{ color: cor.navy }}>{c.nome}</b>
                  <div style={{ fontSize: 14, color: c.atrasado ? "#dc2626" : cor.cinza }}>
                    {c.saldo < 0 ? `deve ${money(Math.abs(c.saldo))}` : c.saldo > 0 ? "adiantada" : "em dia"}
                  </div>
                </div>
                <button style={painel.botaoSec} onClick={() => escolherCliente(c)}>É esta</button>
              </div>
            ))}
            <p style={{ color: cor.cinza, fontSize: 14, margin: "8px 0 0" }}>
              Não sabe ainda? Deixe em branco — a entrada fica na fila e você identifica depois.
            </p>
          </>
        )}
      </div>

      {/* ------------------ quais lavagens ------------------ */}
      {cliente && debitos.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${cor.linha}` }}>
          <label style={painel.rotulo}>Este pagamento é de quais lavagens?</label>
          {debitos.map((d: any) => (
            <label key={d.movimento_id}
                   style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0",
                            borderTop: `1px solid ${cor.linha}`, cursor: "pointer" }}>
              <input type="checkbox" checked={!!escolhidos[d.movimento_id]}
                     onChange={(e) => setEscolhidos({ ...escolhidos, [d.movimento_id]: e.target.checked })}
                     style={{ width: 20, height: 20 }} />
              <div style={{ flex: 1 }}>
                <span style={{ color: cor.navy }}>
                  {d.jazigo !== "—" ? d.jazigo : d.descricao}
                </span>
                <div style={{ fontSize: 14, color: cor.cinza }}>
                  {d.data_lavagem
                    ? `lavagem de ${new Date(d.data_lavagem + "T12:00:00").toLocaleDateString("pt-BR")}`
                    : new Date(d.data + "T12:00:00").toLocaleDateString("pt-BR")}
                  {Number(d.ja_quitado) > 0 && ` · já pago ${money(d.ja_quitado)} de ${money(d.valor)}`}
                </div>
              </div>
              <b style={{ color: cor.navy }}>{money(d.em_aberto)}</b>
            </label>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10,
                        fontSize: 15, color: cor.cinza }}>
            <span>selecionado</span>
            <b style={{ color: cor.navy }}>{money(totalEscolhido)}</b>
          </div>
          {Number(f.valor) > 0 && Math.abs(Number(f.valor) - totalEscolhido) > 0.01 && (
            <p style={{ fontSize: 14, color: "#92400e", background: "#fffbeb", padding: 10,
                        borderRadius: 8, margin: "8px 0 0" }}>
              {Number(f.valor) > totalEscolhido
                ? `Entrou ${money(Number(f.valor) - totalEscolhido)} a mais — vira crédito da família.`
                : `Falta ${money(totalEscolhido - Number(f.valor))} para quitar tudo que está marcado.`}
            </p>
          )}
        </div>
      )}

      {cliente && debitos.length === 0 && (
        <p style={{ color: cor.cinza, fontSize: 15, marginTop: 12 }}>
          Esta família não tem nada em aberto — o valor entra como crédito para as próximas.
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={painel.rotulo}>Identificador da transação (opcional)</label>
          <input style={painel.input} value={f.identificador}
                 onChange={(e) => setF({ ...f, identificador: e.target.value })}
                 placeholder="E2E do Pix — evita lançar duas vezes" />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={painel.rotulo}>Observação</label>
          <input style={painel.input} value={f.observacao}
                 onChange={(e) => setF({ ...f, observacao: e.target.value })} />
        </div>
      </div>

      <button style={{ ...painel.botao, marginTop: 12 }} onClick={salvar} disabled={salvando}>
        {salvando ? "Lançando…" : cliente ? `Lançar e creditar para ${cliente.nome.split(" ")[0]}` : "Lançar sem identificar"}
      </button>
    </div>
  );
}

function Cartao({ titulo, valor, cor: c, destaque }:
  { titulo: string; valor: string; cor: string; destaque?: boolean }) {
  return (
    <div style={{ ...painel.card, marginBottom: 0, borderTop: `3px solid ${c}` }}>
      <div style={{ fontSize: 14, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {titulo}
      </div>
      <div style={{ fontSize: destaque ? 26 : 22, fontWeight: 700, color: c, marginTop: 4 }}>{valor}</div>
    </div>
  );
}
