"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PainelNav, painel, cor } from "../../ui";

export default function FichaCliente() {
  const params = useParams();
  const id = params?.id as string;
  const [d, setD] = useState<any>(null);
  const [inst, setInst] = useState("");
  const [modo, setModo] = useState("copiloto");
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);

  async function carregar() {
    const r = await fetch(`/api/clientes/${id}`).then((x) => x.json());
    if (r.ok) {
      setD(r);
      setInst(r.cliente.instrucoes_ia || "");
      setModo(r.cliente.modo);
      setAtivo(r.cliente.ativo_ia);
    }
  }
  useEffect(() => {
    if (id) carregar();
  }, [id]);

  async function salvar() {
    setSalvando(true);
    setOk(false);
    await fetch(`/api/clientes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instrucoes_ia: inst, modo, ativo_ia: ativo }),
    });
    setSalvando(false);
    setOk(true);
    setTimeout(() => setOk(false), 2000);
  }

  if (!d) {
    return (
      <div style={painel.wrap}>
        <PainelNav atual="/painel/clientes" />
        <div style={painel.conteudo}>
          <p style={{ color: cor.cinza }}>Carregando…</p>
        </div>
      </div>
    );
  }

  const c = d.cliente;
  const saldoTxt =
    Math.abs(d.saldo) < 0.005 ? "em dia" : d.saldo > 0 ? `adiantado R$ ${d.saldo.toFixed(2)}` : `em aberto R$ ${Math.abs(d.saldo).toFixed(2)}`;

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/clientes" />
      <div style={painel.conteudo}>
        <h1 style={painel.h1}>{c.nome}</h1>

        <div style={painel.card}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ color: cor.cinza, fontSize: 14 }}>{c.telefone}</div>
              <div style={{ marginTop: 6 }}>
                Pagamento: <b>{saldoTxt}</b>
                {d.aConferir > 0.005 && <span style={{ color: "#d97706" }}> (R$ {d.aConferir.toFixed(2)} a conferir)</span>}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, color: cor.cinza }}>score de entendimento</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: cor.teal }}>{Math.round(c.score)}</div>
            </div>
          </div>
        </div>

        <div style={painel.card}>
          <strong style={{ color: cor.navy }}>Atendimento da IA</strong>
          <div style={{ display: "flex", gap: 16, margin: "12px 0", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
              IA ativa neste contato
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Modo:
              <select style={{ ...painel.input, width: "auto", padding: 8 }} value={modo} onChange={(e) => setModo(e.target.value)}>
                <option value="copiloto">copiloto (rascunho)</option>
                <option value="automatico">automático</option>
              </select>
            </label>
          </div>
          <label style={painel.rotulo}>Instruções da IA para este contato (treino manual — têm prioridade)</label>
          <textarea
            style={{ ...painel.input, minHeight: 90, resize: "vertical", fontFamily: "inherit" }}
            value={inst}
            onChange={(e) => setInst(e.target.value)}
            placeholder="Ex.: sempre confirmar a data antes de cobrar; ele costuma pagar dia 5; tratar com Sr."
          />
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
            <button style={painel.botao} onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
            {ok && <span style={{ color: cor.teal }}>✓ salvo</span>}
          </div>
          {c.perfil_ia && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${cor.linha}` }}>
              <div style={painel.rotulo}>Memória (destilada do histórico)</div>
              <p style={{ color: cor.cinza, fontSize: 14, whiteSpace: "pre-wrap" }}>{c.perfil_ia}</p>
            </div>
          )}
        </div>

        <div style={painel.card}>
          <strong style={{ color: cor.navy }}>Túmulos e planos</strong>
          {d.tumulos.length === 0 && <p style={{ color: cor.cinza }}>Nenhum túmulo cadastrado.</p>}
          {d.tumulos.map((t: any) => (
            <div key={t.id} style={{ padding: "8px 0", borderBottom: `1px solid ${cor.linha}` }}>
              <b>{t.identificacao}</b> {t.quadras?.codigo ? `· quadra ${t.quadras.codigo}` : ""} {t.falecido_nome ? `· ${t.falecido_nome}` : ""}
            </div>
          ))}
          {d.planos.map((p: any) => (
            <div key={p.id} style={{ fontSize: 14, color: cor.cinza, marginTop: 6 }}>
              Plano: {p.cadencia} · {p.qtd_por_passagem}x/vez · R$ {Number(p.valor_vigente).toFixed(2)} (desde {p.data_valor_vigente})
            </div>
          ))}
        </div>

        <div style={painel.card}>
          <strong style={{ color: cor.navy }}>Últimas mensagens</strong>
          <div style={{ marginTop: 10 }}>
            {d.mensagens.length === 0 && <p style={{ color: cor.cinza }}>Sem histórico ainda.</p>}
            {d.mensagens.map((m: any, i: number) => (
              <div key={i} style={{ margin: "6px 0", textAlign: m.autor === "cliente" ? "left" : "right" }}>
                <span style={{ display: "inline-block", maxWidth: "80%", padding: "8px 12px", borderRadius: 12, background: m.autor === "cliente" ? "#e2e8f0" : cor.teal, color: m.autor === "cliente" ? cor.navy : "#fff", fontSize: 14 }}>
                  {m.texto}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
