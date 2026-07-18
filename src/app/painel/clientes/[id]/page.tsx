"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PainelNav, painel, cor } from "../../ui";

export default function FichaCliente() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [d, setD] = useState<any>(null);
  const [inst, setInst] = useState("");
  const [modo, setModo] = useState("copiloto");
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);
  const [hist, setHist] = useState("");
  const [treinando, setTreinando] = useState(false);

  async function abrirConversa() {
    const r = await fetch(`/api/clientes/${id}/conversa`, { method: "POST" }).then((x) => x.json());
    if (r.ok) router.push(`/painel/conversas/${r.conversaId}`);
  }

  async function treinar() {
    if (!hist.trim()) return;
    setTreinando(true);
    const r = await fetch(`/api/clientes/${id}/treinar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ historico: hist }),
    }).then((x) => x.json());
    setTreinando(false);
    if (r.ok) {
      setHist("");
      carregar();
    }
  }

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h1 style={painel.h1}>{c.nome}</h1>
          <button style={painel.botao} onClick={abrirConversa}>Abrir conversa</button>
        </div>

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

        {d.pagamentos && d.pagamentos.length > 0 && (
          <div style={painel.card}>
            <strong style={{ color: cor.navy }}>Pagamentos recebidos</strong>
            {d.pagamentos.map((p: any) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: `1px solid ${cor.linha}`, marginTop: 8 }}>
                <span>
                  {new Date(p.data + "T12:00:00").toLocaleDateString("pt-BR")} · <b style={{ color: "#16a34a" }}>R$ {Number(p.valor).toFixed(2)}</b>
                </span>
                <a href={`/painel/recibo/${p.id}`} target="_blank" rel="noreferrer" style={{ ...painel.botaoSec, padding: "6px 12px", textDecoration: "none" }}>
                  Recibo
                </a>
              </div>
            ))}
          </div>
        )}

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

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${cor.linha}` }}>
            <label style={painel.rotulo}>Treinar com histórico — cole a conversa antiga do WhatsApp e a IA destila no perfil</label>
            <textarea
              style={{ ...painel.input, minHeight: 90, resize: "vertical", fontFamily: "inherit" }}
              value={hist}
              onChange={(e) => setHist(e.target.value)}
              placeholder="Cole aqui as mensagens antigas deste cliente…"
            />
            <button style={{ ...painel.botaoSec, marginTop: 8 }} onClick={treinar} disabled={treinando}>
              {treinando ? "Destilando…" : "Treinar com este histórico"}
            </button>
          </div>
        </div>

        <div style={painel.card}>
          <strong style={{ color: cor.navy }}>Túmulos e planos</strong>
          <p style={{ color: cor.cinza, fontSize: 13, margin: "6px 0 0" }}>
            As datas de memória (falecimento/nascimento) alimentam as mensagens de carinho — o sistema
            sugere um rascunho 7 dias antes, todo ano.
          </p>
          {d.tumulos.length === 0 && <p style={{ color: cor.cinza }}>Nenhum túmulo cadastrado.</p>}
          {d.tumulos.map((t: any) => (
            <TumuloEdit key={t.id} t={t} onSalvo={carregar} />
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

        <PrivacidadeIndicacao clienteId={id} consentimentoEm={c.consentimento_em} codigo={c.codigo_indicacao} />
      </div>
    </div>
  );
}

function PrivacidadeIndicacao({ clienteId, consentimentoEm, codigo: codigoInicial }: { clienteId: string; consentimentoEm: string | null; codigo: string | null }) {
  const [codigo, setCodigo] = useState<string | null>(codigoInicial || null);
  const [busy, setBusy] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [consentido, setConsentido] = useState(!!consentimentoEm);

  const linkIndicacao = codigo ? `${typeof window !== "undefined" ? window.location.origin : ""}/indicar/${codigo}` : "";

  async function acao(acao: string, extra?: any) {
    setBusy(true);
    const r = await fetch(`/api/clientes/${clienteId}/lgpd`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao, ...extra }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    return r;
  }

  async function gerarIndicacao() {
    const r = await acao("indicacao");
    if (r?.ok) setCodigo(r.codigo);
  }

  async function marcarConsentimento() {
    const r = await acao("consentimento", { via: "cadastro" });
    if (r?.ok) setConsentido(true);
  }

  async function anonimizar() {
    if (!confirm("Remover os dados pessoais deste cliente (LGPD)? Nome, telefone e mensagens serão apagados. O histórico financeiro é mantido sem identificação. Isso não pode ser desfeito.")) return;
    const r = await acao("anonimizar");
    if (r?.ok) {
      alert("Dados removidos.");
      location.reload();
    } else alert("Falhou: " + (r?.erro || "erro"));
  }

  async function exportar() {
    const r = await fetch(`/api/clientes/${clienteId}/lgpd`).then((x) => x.json());
    if (!r?.ok) return alert("Falhou ao exportar.");
    const blob = new Blob([JSON.stringify(r.export, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dados-cliente-${clienteId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copiar() {
    navigator.clipboard?.writeText(linkIndicacao);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  return (
    <div style={painel.card}>
      <strong style={{ color: cor.navy }}>Privacidade e indicação</strong>

      <div style={{ marginTop: 12 }}>
        <label style={painel.rotulo}>Indicação (o cliente indica outras famílias)</label>
        {codigo ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input readOnly value={linkIndicacao} style={{ ...painel.input, flex: 1, minWidth: 200, fontSize: 13 }} onFocus={(e) => e.target.select()} />
            <button style={painel.botaoSec} onClick={copiar}>{copiado ? "✓ copiado" : "Copiar"}</button>
          </div>
        ) : (
          <button style={painel.botaoSec} onClick={gerarIndicacao} disabled={busy}>Gerar link de indicação</button>
        )}
      </div>

      <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${cor.linha}` }}>
        <label style={painel.rotulo}>LGPD</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {consentido ? (
            <span style={{ color: cor.teal, fontSize: 14 }}>✓ consentimento registrado</span>
          ) : (
            <button style={painel.botaoSec} onClick={marcarConsentimento} disabled={busy}>Registrar consentimento</button>
          )}
          <button style={painel.botaoSec} onClick={exportar}>Exportar dados</button>
          <button style={painel.botaoPerigo} onClick={anonimizar} disabled={busy}>Remover dados</button>
        </div>
      </div>
    </div>
  );
}

function TumuloEdit({ t, onSalvo }: { t: any; onSalvo: () => void }) {
  const datas: any[] = Array.isArray(t.datas_gatilho) ? t.datas_gatilho : [];
  const dFal = datas.find((d) => d?.tipo === "falecimento")?.data || "";
  const dNas = datas.find((d) => d?.tipo === "nascimento")?.data || "";

  const [editando, setEditando] = useState(false);
  const [falecido, setFalecido] = useState(t.falecido_nome || "");
  const [falec, setFalec] = useState(dFal);
  const [nasc, setNasc] = useState(dNas);
  const [salvando, setSalvando] = useState(false);
  const [token, setToken] = useState<string | null>(t.qr_token || null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const linkPortal = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/familia/${token}` : "";

  async function salvar() {
    setSalvando(true);
    const r = await fetch(`/api/tumulos/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        falecido_nome: falecido,
        data_falecimento: falec,
        data_nascimento: nasc,
      }),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (r?.ok) {
      setEditando(false);
      onSalvo();
    } else alert("Falhou: " + (r?.erro || "erro"));
  }

  async function portalAcao(acao: "emitir" | "revogar") {
    setPortalBusy(true);
    const r = await fetch(`/api/tumulos/${t.id}/portal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao }),
    }).then((x) => x.json()).catch(() => null);
    setPortalBusy(false);
    if (r?.ok) setToken(r.token);
    else alert("Falhou: " + (r?.erro || "erro"));
  }

  function copiar() {
    if (!linkPortal) return;
    navigator.clipboard?.writeText(linkPortal);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  return (
    <div style={{ padding: "8px 0", borderBottom: `1px solid ${cor.linha}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span>
          <b>{t.identificacao}</b> {t.quadras?.codigo ? `· quadra ${t.quadras.codigo}` : ""}{" "}
          {t.falecido_nome ? `· ${t.falecido_nome}` : ""}
          {dFal ? ` · 🕊 ${dFal}` : ""}
          {token ? " · 🔗 portal ativo" : ""}
        </span>
        <button style={{ ...painel.botaoSec, padding: "6px 12px" }} onClick={() => setEditando(!editando)}>
          {editando ? "Fechar" : "Editar"}
        </button>
      </div>
      {editando && (
        <>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label style={painel.rotulo}>Nome do falecido</label>
              <input style={{ ...painel.input, width: 200 }} value={falecido} onChange={(e) => setFalecido(e.target.value)} />
            </div>
            <div>
              <label style={painel.rotulo}>Falecimento (MM-DD)</label>
              <input style={{ ...painel.input, width: 110 }} value={falec} onChange={(e) => setFalec(e.target.value)} placeholder="07-23" />
            </div>
            <div>
              <label style={painel.rotulo}>Nascimento (MM-DD)</label>
              <input style={{ ...painel.input, width: 110 }} value={nasc} onChange={(e) => setNasc(e.target.value)} placeholder="01-15" />
            </div>
            <button style={painel.botao} onClick={salvar} disabled={salvando}>
              {salvando ? "..." : "Salvar"}
            </button>
          </div>

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${cor.linha}` }}>
            <label style={painel.rotulo}>Portal da família (link com as fotos das limpezas)</label>
            {token ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input readOnly value={linkPortal} style={{ ...painel.input, flex: 1, minWidth: 220, fontSize: 13 }} onFocus={(e) => e.target.select()} />
                <button style={painel.botaoSec} onClick={copiar}>{copiado ? "✓ copiado" : "Copiar"}</button>
                <button style={painel.botaoPerigo} onClick={() => portalAcao("revogar")} disabled={portalBusy}>
                  Desativar
                </button>
              </div>
            ) : (
              <button style={painel.botaoSec} onClick={() => portalAcao("emitir")} disabled={portalBusy}>
                {portalBusy ? "..." : "Gerar link do portal"}
              </button>
            )}
            <p style={{ color: cor.cinza, fontSize: 12, margin: "6px 0 0" }}>
              Qualquer pessoa com o link vê as fotos e datas das limpezas (sem dados de pagamento). Desative a qualquer momento.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
