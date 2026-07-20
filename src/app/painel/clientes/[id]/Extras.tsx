"use client";

import { useCallback, useEffect, useState } from "react";
import { painel, cor } from "../../ui";

/**
 * SERVIÇOS EXTRAS
 *
 * Flores, vela, limpeza pesada, pintura de letras. Coisas que a família pede e
 * que hoje eram combinadas por fora — e nem sempre cobradas.
 *
 * Aqui viram pedido registrado: quando entrega, o valor entra na conta da
 * família sozinho. E o que é sazonal (Finados, Dia das Mães) aparece destacado
 * quando chega a época.
 */
export default function Extras({ clienteId, tumulos, onMudou }: {
  clienteId: string;
  tumulos: any[];
  onMudou: () => void;
}) {
  const [catalogo, setCatalogo] = useState<any[]>([]);
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [aberto, setAberto] = useState(false);
  const [escolhido, setEscolhido] = useState<any>(null);
  const [qtd, setQtd] = useState("1");
  const [preco, setPreco] = useState("");
  const [tumuloId, setTumuloId] = useState("");
  const [obs, setObs] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([
      fetch("/api/extras").then((x) => x.json()).catch(() => null),
      fetch(`/api/extras/pedidos?clienteId=${clienteId}`).then((x) => x.json()).catch(() => null),
    ]);
    if (a?.ok) setCatalogo(a.extras || []);
    if (b?.ok) setPedidos(b.pedidos || []);
  }, [clienteId]);

  useEffect(() => { carregar(); }, [carregar]);

  function escolher(e: any) {
    setEscolhido(e);
    setPreco(String(e.preco));
    setQtd("1");
    if (tumulos.length === 1) setTumuloId(tumulos[0].id);
  }

  async function pedir() {
    if (!escolhido) return;
    setOcupado(true);
    const r = await fetch("/api/extras/pedidos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clienteId, extraId: escolhido.id, nome: escolhido.nome,
        quantidade: Number(qtd) || 1, precoUnit: Number(preco) || 0,
        tumuloId: tumuloId || null, observacao: obs || null,
      }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (r?.ok) { setEscolhido(null); setObs(""); setAberto(false); carregar(); onMudou(); }
    else alert("Falhou: " + (r?.erro || "erro"));
  }

  async function agir(pedidoId: string, acao: "entregar" | "cancelar") {
    if (acao === "entregar" && !confirm("Marcar como entregue? O valor entra na conta da família.")) return;
    if (acao === "cancelar" && !confirm("Cancelar este pedido?")) return;
    setOcupado(true);
    const r = await fetch("/api/extras/pedidos", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pedidoId, acao }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (r?.ok) { carregar(); onMudou(); } else alert("Falhou.");
  }

  const money = (n: number) => `R$ ${Number(n || 0).toFixed(2)}`;
  const abertos = pedidos.filter((p) => p.status === "pedido");
  const naEpoca = catalogo.filter((e) => e.sazonal && e.naEpoca);
  const porCategoria: Record<string, any[]> = {};
  for (const e of catalogo) (porCategoria[e.categoria] ||= []).push(e);

  const nomeCategoria: Record<string, string> = {
    flores: "🌷 Flores", limpeza: "🧽 Limpeza", reparo: "🔧 Reparos",
    memoria: "🕯 Memória", outro: "Outros",
  };

  return (
    <div style={painel.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                    gap: 10, flexWrap: "wrap" }}>
        <strong style={{ color: cor.navy }}>Serviços extras</strong>
        <button style={painel.botaoSec} onClick={() => setAberto(!aberto)}>
          {aberto ? "Fechar" : "+ Oferecer algo"}
        </button>
      </div>

      {naEpoca.length > 0 && !aberto && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10,
                      padding: 12, marginTop: 12 }}>
          <b style={{ color: "#92400e" }}>É época de: {naEpoca.map((e) => e.nome).join(", ")}</b>
          <div style={{ fontSize: 14, color: "#78350f", marginTop: 4 }}>
            Vale mencionar na próxima conversa com esta família.
          </div>
        </div>
      )}

      {abertos.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={painel.rotulo}>Pedidos em aberto</div>
          {abertos.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between",
                   alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 0",
                   borderTop: `1px solid ${cor.linha}` }}>
              <div>
                <b style={{ color: cor.navy }}>{p.nome}</b>
                {Number(p.quantidade) > 1 && <span style={{ color: cor.cinza }}> ×{p.quantidade}</span>}
                <div style={{ fontSize: 14, color: cor.cinza }}>
                  pedido em {new Date(p.data_pedido + "T12:00:00").toLocaleDateString("pt-BR")}
                  {p.tumulos?.identificacao ? ` · ${p.tumulos.identificacao}` : ""}
                  {p.observacao ? ` · ${p.observacao}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ color: cor.navy }}>{money(p.total)}</b>
                <button style={painel.botao} disabled={ocupado}
                        onClick={() => agir(p.id, "entregar")}>Entreguei</button>
                <button style={painel.botaoMiniSec} disabled={ocupado}
                        onClick={() => agir(p.id, "cancelar")}>Cancelar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {aberto && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${cor.linha}` }}>
          {!escolhido ? (
            Object.entries(porCategoria).map(([cat, itens]) => (
              <div key={cat} style={{ marginBottom: 14 }}>
                <div style={painel.rotulo}>{nomeCategoria[cat] || cat}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {itens.map((e) => (
                    <button key={e.id}
                      style={{ ...painel.botaoSec, flexDirection: "column", alignItems: "flex-start",
                               textAlign: "left", padding: "12px 14px", minHeight: 0,
                               opacity: e.sazonal && !e.naEpoca ? 0.5 : 1 }}
                      onClick={() => escolher(e)}>
                      <div style={{ fontWeight: 700, color: cor.navy }}>{e.nome}</div>
                      <div style={{ fontSize: 14, color: cor.cinza }}>
                        {money(e.preco)}
                        {e.sazonal && (e.naEpoca ? " · é a época!" : " · fora de época")}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <b style={{ color: cor.navy, fontSize: 16 }}>{escolhido.nome}</b>
                <button style={{ background: "none", border: "none", color: cor.cinza,
                                 cursor: "pointer", fontSize: 15 }}
                        onClick={() => setEscolhido(null)}>escolher outro</button>
              </div>
              {escolhido.descricao && (
                <p style={{ color: cor.cinza, fontSize: 14, margin: "6px 0 0" }}>{escolhido.descricao}</p>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
                <div>
                  <label style={painel.rotulo}>Quantidade</label>
                  <input type="number" step="0.5" style={{ ...painel.input, width: 100 }}
                         value={qtd} onChange={(e) => setQtd(e.target.value)} />
                </div>
                <div>
                  <label style={painel.rotulo}>Preço ({escolhido.unidade})</label>
                  <input type="number" step="0.01" style={{ ...painel.input, width: 120 }}
                         value={preco} onChange={(e) => setPreco(e.target.value)} />
                </div>
                <div>
                  <label style={painel.rotulo}>Total</label>
                  <div style={{ ...painel.input, width: 120, background: "#f8fafc", fontWeight: 700 }}>
                    {money((Number(qtd) || 0) * (Number(preco) || 0))}
                  </div>
                </div>
                {tumulos.length > 1 && (
                  <div>
                    <label style={painel.rotulo}>Em qual jazigo</label>
                    <select style={{ ...painel.input, width: 200 }} value={tumuloId}
                            onChange={(e) => setTumuloId(e.target.value)}>
                      <option value="">— todos —</option>
                      {tumulos.map((t) => (
                        <option key={t.id} value={t.id}>{t.identificacao}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div style={{ marginTop: 10 }}>
                <label style={painel.rotulo}>Observação</label>
                <input style={painel.input} value={obs} onChange={(e) => setObs(e.target.value)}
                       placeholder="ex.: rosas brancas, como ela pediu" />
              </div>

              <button style={{ ...painel.botao, marginTop: 12 }} onClick={pedir} disabled={ocupado}>
                {ocupado ? "Registrando…" : "Registrar pedido"}
              </button>
              <p style={{ color: cor.cinza, fontSize: 14, margin: "8px 0 0" }}>
                Fica como pedido em aberto. Ao marcar &ldquo;Entreguei&rdquo;, o valor entra na
                conta da família.
              </p>
            </>
          )}
        </div>
      )}

      {!aberto && abertos.length === 0 && (
        <p style={{ color: cor.cinza, fontSize: 15, margin: "10px 0 0" }}>
          Nada pedido no momento. Flores, vela, limpeza pesada e pintura de letras são os
          mais procurados.
        </p>
      )}
    </div>
  );
}
