"use client";

import { useCallback, useEffect, useState } from "react";
import { painel, cor } from "../ui";

/**
 * CONTA DA AJUDANTE
 *
 * A Nina compra material do próprio bolso. Enquanto não é reembolsada, o
 * dinheiro dela está no negócio — e isso precisa aparecer em algum lugar.
 *
 * Cada compra vira duas coisas: material no estoque e uma dívida com ela.
 * Ao pagar, sai do caixa classificado como "Pagamento da ajudante".
 */
export default function Equipe() {
  const [d, setD] = useState<any>(null);
  const [materiais, setMateriais] = useState<any[]>([]);
  const [novo, setNovo] = useState(false);
  const [f, setF] = useState({
    membroId: "", materialId: "", quantidade: "1", valor: "",
    data: new Date().toISOString().slice(0, 10),
  });
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([
      fetch("/api/equipe/conta").then((x) => x.json()).catch(() => null),
      fetch("/api/config/materiais").then((x) => x.json()).catch(() => null),
    ]);
    if (a?.ok) {
      setD(a);
      if (!f.membroId && a.equipe?.[0]) setF((v) => ({ ...v, membroId: a.equipe[0].user_id }));
    }
    if (b?.ok) setMateriais(b.materiais || []);
  }, [f.membroId]);
  useEffect(() => { carregar(); }, [carregar]);

  async function registrar() {
    const v = Number(String(f.valor).replace(",", "."));
    if (!f.membroId || !f.materialId || !v) return alert("Preencha quem comprou, o quê e quanto.");
    setOcupado(true);
    const r = await fetch("/api/equipe/conta", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, valor: v, quantidade: Number(f.quantidade) || 1 }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (r?.ok) { setF({ ...f, materialId: "", quantidade: "1", valor: "" }); setNovo(false); carregar(); }
    else alert("Falhou: " + (r?.erro || "erro"));
  }

  async function pagar(membroId: string, nome: string, total: number) {
    const txt = prompt(
      `Pagar quanto para ${nome}?\n\nEm aberto: R$ ${total.toFixed(2)}\n` +
      `Deixe como está para pagar tudo, ou digite um valor menor.`,
      total.toFixed(2)
    );
    if (txt === null) return;
    const v = Number(txt.replace(",", "."));
    if (!v || v <= 0) return;
    setOcupado(true);
    const r = await fetch("/api/equipe/conta", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ membroId, valor: v }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (r?.ok) {
      alert(`Pago R$ ${Number(r.pago).toFixed(2)} — lançado no caixa como saída.`);
      carregar();
    } else alert(r?.erro || "Não consegui registrar o pagamento.");
  }

  async function remover(id: string) {
    if (!confirm("Remover este lançamento?")) return;
    const r = await fetch(`/api/equipe/conta?id=${id}`, { method: "DELETE" })
      .then((x) => x.json()).catch(() => null);
    if (r?.ok) carregar(); else alert(r?.erro || "Não consegui remover.");
  }

  if (!d) return <p style={{ color: cor.cinza }}>Carregando…</p>;
  const money = (n: number) => `R$ ${Number(n || 0).toFixed(2)}`;
  const emAberto = (d.lancamentos || []).filter((l: any) => !l.pago_em);
  const pagos = (d.lancamentos || []).filter((l: any) => l.pago_em);

  return (
    <>
      <div style={{ ...painel.card, background: "#f8fafc" }}>
        <p style={{ margin: 0, fontSize: 15, color: cor.cinza, lineHeight: 1.6 }}>
          Quando a Nina compra material do próprio bolso, registre aqui: o material entra no
          estoque e o valor fica como dívida com ela até você pagar.
        </p>
      </div>

      {(d.saldos || []).length > 0 && (
        <div style={{ ...painel.card, borderLeft: "4px solid #d97706", background: "#fffbeb" }}>
          <strong style={{ color: "#92400e" }}>A pagar</strong>
          {(d.saldos || []).map((s: any) => (
            <div key={s.membro_id} style={{ display: "flex", justifyContent: "space-between",
                   alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 0",
                   borderTop: "1px solid #fde68a" }}>
              <div>
                <b style={{ color: cor.navy, fontSize: 16 }}>{s.nome}</b>
                <div style={{ fontSize: 15, color: "#78350f" }}>
                  {s.itens} lançamento(s)
                  {s.mais_antigo && ` · o mais antigo é de ${new Date(s.mais_antigo + "T12:00:00").toLocaleDateString("pt-BR")}`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <b style={{ color: "#92400e", fontSize: 19 }}>{money(s.a_receber)}</b>
                <button style={painel.botao} disabled={ocupado}
                        onClick={() => pagar(s.membro_id, s.nome, Number(s.a_receber))}>
                  Pagar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
                    gap: 12, marginBottom: 14 }}>
        <Cartao titulo="Em aberto com a equipe" valor={money(d.totais.aPagar)}
                cor={d.totais.aPagar ? "#d97706" : cor.teal} destaque />
        <Cartao titulo="Pago neste mês" valor={money(d.totais.pagoNoMes)} cor={cor.navy} />
      </div>

      <div style={{ ...painel.card, padding: 12 }}>
        <button style={painel.botao} onClick={() => setNovo(!novo)}>
          {novo ? "Fechar" : "+ Ela comprou material"}
        </button>
      </div>

      {novo && (
        <div style={{ ...painel.card, borderLeft: `4px solid ${cor.navy}` }}>
          <strong style={{ color: cor.navy }}>Compra feita pela ajudante</strong>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
            <div>
              <label style={painel.rotulo}>Quem comprou</label>
              <select style={{ ...painel.input, width: 160 }} value={f.membroId}
                      onChange={(e) => setF({ ...f, membroId: e.target.value })}>
                {(d.equipe || []).map((m: any) => (
                  <option key={m.user_id} value={m.user_id}>{m.nome}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={painel.rotulo}>O quê</label>
              <select style={painel.input} value={f.materialId}
                      onChange={(e) => setF({ ...f, materialId: e.target.value })}>
                <option value="">— escolher —</option>
                {materiais.map((m: any) => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={painel.rotulo}>Quantidade</label>
              <input type="number" step="0.5" style={{ ...painel.input, width: 110 }}
                     value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: e.target.value })} />
            </div>
            <div>
              <label style={painel.rotulo}>Quanto pagou</label>
              <input style={{ ...painel.input, width: 120 }} value={f.valor}
                     onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder="0,00" />
            </div>
            <div>
              <label style={painel.rotulo}>Quando</label>
              <input type="date" style={{ ...painel.input, width: 160 }} value={f.data}
                     onChange={(e) => setF({ ...f, data: e.target.value })} />
            </div>
            <button style={painel.botao} onClick={registrar} disabled={ocupado}>
              {ocupado ? "…" : "Registrar"}
            </button>
          </div>
          <p style={{ color: cor.cinza, fontSize: 14, margin: "10px 0 0" }}>
            O material entra no estoque e o valor fica a pagar para ela.
          </p>
        </div>
      )}

      {emAberto.length > 0 && (
        <div style={painel.card}>
          <strong style={{ color: cor.navy }}>Ainda a pagar</strong>
          {emAberto.map((l: any) => (
            <Linha key={l.id} l={l} onRemover={() => remover(l.id)} />
          ))}
        </div>
      )}

      {pagos.length > 0 && (
        <div style={painel.card}>
          <strong style={{ color: cor.navy }}>Já pagos</strong>
          {pagos.slice(0, 20).map((l: any) => <Linha key={l.id} l={l} />)}
        </div>
      )}
    </>
  );
}

function Linha({ l, onRemover }: { l: any; onRemover?: () => void }) {
  const money = (n: number) => `R$ ${Number(n || 0).toFixed(2)}`;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  gap: 10, flexWrap: "wrap", padding: "10px 0",
                  borderTop: `1px solid ${cor.linha}` }}>
      <div>
        <span style={{ color: cor.navy }}>{l.descricao || l.tipo}</span>
        <div style={{ fontSize: 14, color: cor.cinza }}>
          {new Date(l.data + "T12:00:00").toLocaleDateString("pt-BR")}
          {l.pago_em && ` · pago em ${new Date(l.pago_em).toLocaleDateString("pt-BR")}`}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <b style={{ color: l.pago_em ? cor.cinza : "#92400e" }}>{money(l.valor)}</b>
        {onRemover && (
          <button style={painel.botaoMiniSec}
                  onClick={onRemover}>remover</button>
        )}
      </div>
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
