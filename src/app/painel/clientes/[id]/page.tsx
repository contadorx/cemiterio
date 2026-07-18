"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PainelNav, painel, cor } from "../../ui";
import { ATALHOS_FREQUENCIA, descreverFrequencia, intervaloEmDias, lavagensPorAno } from "@/lib/frequencia";

export default function FichaCliente() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [d, setD] = useState<any>(null);
  // cada bloco avisa aqui o que tem para salvar; a barra embaixo salva tudo junto
  const [pendencias, setPendencias] = useState<Record<string, () => Promise<boolean>>>({});
  const [salvandoTudo, setSalvandoTudo] = useState(false);

  function registrarPendencia(chave: string, salvar: (() => Promise<boolean>) | null) {
    setPendencias((p) => {
      const novo = { ...p };
      if (salvar) novo[chave] = salvar; else delete novo[chave];
      return novo;
    });
  }

  async function salvarTudo() {
    setSalvandoTudo(true);
    let falhou = 0;
    for (const salvar of Object.values(pendencias)) {
      const ok = await salvar().catch(() => false);
      if (!ok) falhou++;
    }
    setSalvandoTudo(false);
    setPendencias({});
    carregar();
    if (falhou) alert(`${falhou} bloco(s) não salvaram. Confira e tente de novo.`);
  }
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
          <Identificacao c={c} onSalvo={carregar} registrar={registrarPendencia} />
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
              <div style={{ fontSize: 15, color: cor.cinza }}>score de entendimento</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: cor.teal }}>{Math.round(c.score)}</div>
            </div>
          </div>
        </div>

        {d.pagamentos && d.pagamentos.length > 0 && (
          <div style={painel.card}>
            <strong style={{ color: cor.navy }}>Pagamentos recebidos</strong>
            {(d.pagamentos || []).map((p: any) => (
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
          <p style={{ color: cor.cinza, fontSize: 15, margin: "6px 0 0" }}>
            As datas de memória (falecimento/nascimento) alimentam as mensagens de carinho — o sistema
            sugere um rascunho 7 dias antes, todo ano.
          </p>
          {d.tumulos.length === 0 && <p style={{ color: cor.cinza }}>Nenhum túmulo cadastrado.</p>}
          {(d.tumulos || []).map((t: any) => (
            <TumuloEdit key={t.id} t={t}
                        plano={(d.planos || []).find((p: any) => p.tumulo_id === t.id) || null}
                        onSalvo={carregar} />
          ))}

        </div>

        <div style={painel.card}>
          <strong style={{ color: cor.navy }}>Últimas mensagens</strong>
          <div style={{ marginTop: 10 }}>
            {d.mensagens.length === 0 && <p style={{ color: cor.cinza }}>Sem histórico ainda.</p>}
            {(d.mensagens || []).map((m: any, i: number) => (
              <div key={i} style={{ margin: "6px 0", textAlign: m.autor === "cliente" ? "left" : "right" }}>
                <span style={{ display: "inline-block", maxWidth: "80%", padding: "8px 12px", borderRadius: 12, background: m.autor === "cliente" ? "#e2e8f0" : cor.teal, color: m.autor === "cliente" ? cor.navy : "#fff", fontSize: 14 }}>
                  {m.texto}
                </span>
              </div>
            ))}
          </div>
        </div>

        <BarraSalvar />

        <RegistrarPagamento clienteId={id} nome={c.nome} onSalvo={carregar} />

        <SaldoAbertura clienteId={id} saldoAtual={d.saldo} onSalvo={carregar} />

        <ReguaCobranca cliente={c} onSalvo={carregar} registrar={registrarPendencia} />

        <ExcluirCliente clienteId={id} nome={c.nome} />

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
            <input readOnly value={linkIndicacao} style={{ ...painel.input, flex: 1, minWidth: 200, fontSize: 15 }} onFocus={(e) => e.target.select()} />
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

function TumuloEdit({ t, plano, onSalvo }: { t: any; plano: any; onSalvo: () => void }) {
  const datas: any[] = Array.isArray(t.datas_gatilho) ? t.datas_gatilho : [];
  const dFal = datas.find((d) => d?.tipo === "falecimento")?.data || "";
  const dNas = datas.find((d) => d?.tipo === "nascimento")?.data || "";

  const [aberto, setAberto] = useState(false);
  const [quadras, setQuadras] = useState<any[]>([]);
  const [f, setF] = useState({
    identificacao: t.identificacao || "",
    numero: t.numero || "",
    quadra_id: t.quadra_id || "",
    rua: t.rua || "",
    falecido_nome: t.falecido_nome || "",
    data_falecimento: dFal,
    data_nascimento: dNas,
  });
  const [p, setP] = useState({
    cadencia: plano?.cadencia || "mensal",
    lavagens_por_ciclo: plano?.lavagens_por_ciclo ?? plano?.qtd_por_passagem ?? 1,
    valor_mensal: plano?.valor_mensal ?? plano?.valor_vigente ?? 0,
    ativo: plano?.ativo !== false,
    pago_ate: (plano?.pago_ate || "").slice(0, 10),
    proximo_servico: (plano?.proximo_servico || "").slice(0, 10),
    proxima_cobranca: (plano?.proxima_cobranca || "").slice(0, 10),
    momento_cobranca: plano?.momento_cobranca || "depois",
  });
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);
  const [token, setToken] = useState<string | null>(t.qr_token || null);
  const [copiado, setCopiado] = useState(false);
  const [gpsMsg, setGpsMsg] = useState("");
  const refEnq = useRef<HTMLInputElement>(null);
  const refRef = useRef<HTMLInputElement>(null);

  const MESES: Record<string, number> = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12, avulso: 0 };
  const valorCiclo = (MESES[p.cadencia] || 0) > 0
    ? (Number(p.valor_mensal) || 0) * MESES[p.cadencia]
    : Number(p.valor_mensal) || 0;

  useEffect(() => {
    if (!aberto || quadras.length) return;
    fetch("/api/quadras").then((x) => x.json()).then((r) => r.ok && setQuadras(r.quadras)).catch(() => {});
  }, [aberto, quadras.length]);

  const linkPortal = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/t/${token}`
    : "";

  async function salvar() {
    setSalvando(true);
    const a = await fetch(`/api/tumulos/${t.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    }).then((x) => x.json()).catch(() => null);
    const b = plano
      ? await fetch(`/api/planos/${plano.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...p, migrado: true }),
        }).then((x) => x.json()).catch(() => null)
      : { ok: true };
    setSalvando(false);
    if (a?.ok && b?.ok) { setOk(true); setTimeout(() => setOk(false), 2000); onSalvo(); }
    else alert("Falhou: " + (a?.erro || b?.erro || "erro"));
  }

  async function subirFoto(tipo: "enquadramento" | "referencia", arq: File) {
    const buf = await arq.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const r = await fetch(`/api/tumulos/${t.id}/foto-referencia`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64: btoa(bin), mimetype: arq.type || "image/jpeg", tipo }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) onSalvo();
    else alert("Falhou ao enviar a foto.");
  }

  async function capturarGps() {
    setGpsMsg("Procurando sinal…");
    const { capturarGps: cap, qualidade } = await import("@/lib/gps");
    const l = await cap({ alvoMetros: 8, timeoutMs: 15000, aoProgredir: (x) => setGpsMsg(`Sinal: ${x} m…`) });
    if (!l) { setGpsMsg("Não consegui o GPS. Verifique a localização do aparelho."); return; }
    const q = qualidade(l.precisao);
    if (!q.serve) { setGpsMsg(`Sinal ${q.rotulo} (${l.precisao} m). Chegue mais perto.`); return; }
    const r = await fetch(`/api/tumulos/${t.id}/gps`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...l, origem: "confirmacao" }),
    }).then((x) => x.json()).catch(() => null);
    setGpsMsg(r?.ok ? `✓ Salvo (${r.amostras} leituras, ±${r.precisao} m)` : r?.mensagem || "Não consegui salvar.");
    if (r?.ok) onSalvo();
  }

  async function excluirJazigo() {
    if (!confirm(`Excluir o jazigo "${t.identificacao}"? Isso apaga o plano e os agendamentos dele.`)) return;
    const r = await fetch(`/api/tumulos/${t.id}`, { method: "DELETE" }).then((x) => x.json()).catch(() => null);
    if (r?.ok) onSalvo();
    else alert(r?.mensagem || r?.erro || "Não consegui excluir.");
  }

  async function portalAcao(acao: "emitir" | "revogar") {
    const r = await fetch(`/api/tumulos/${t.id}/portal`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setToken(r.token); onSalvo(); }
    else alert("Falhou: " + (r?.erro || "erro"));
  }

  const localAtual = [t.quadras?.codigo, t.rua, t.numero ? `nº ${t.numero}` : null]
    .filter(Boolean).join(" · ") || "sem local";
  const migrado = !!plano?.migrado_em;

  return (
    <div style={{ padding: "10px 0", borderBottom: `1px solid ${cor.linha}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span>
          <b>{t.identificacao}</b>
          <span style={{ color: cor.cinza }}> · {localAtual}</span>
          {plano && (
            <span style={{ color: cor.cinza }}>
              {" · "}{descreverFrequencia(plano.cadencia, plano.lavagens_por_ciclo ?? 1)}
              {" · R$ "}{Number(plano.valor_vigente).toFixed(2)}
            </span>
          )}
          {plano?.ativo === false && <span style={{ color: "#dc2626" }}> · INATIVO</span>}
          {token ? " · 🔗" : ""}
          {migrado ? " · ✓ conferido" : ""}
        </span>
        <button style={{ ...painel.botaoSec, padding: "6px 12px" }} onClick={() => setAberto(!aberto)}>
          {aberto ? "Fechar" : "Editar"}
        </button>
      </div>

      {aberto && (
        <div style={{ marginTop: 12 }}>
          {/* ---------------- LOCALIZAÇÃO ---------------- */}
          <div style={bloco}>
            <div style={blocoTitulo}>Localização</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <label style={painel.rotulo}>Identificação do jazigo</label>
                <input style={{ ...painel.input, width: 220 }} value={f.identificacao}
                       onChange={(e) => setF({ ...f, identificacao: e.target.value })} />
              </div>
              <div>
                <label style={painel.rotulo}>Número do jazigo</label>
                <input style={{ ...painel.input, width: 120 }} value={f.numero}
                       onChange={(e) => setF({ ...f, numero: e.target.value })}
                       placeholder="se tiver" />
              </div>
              <div>
                <label style={painel.rotulo}>Quadra</label>
                <select style={{ ...painel.input, width: 130 }} value={f.quadra_id}
                        onChange={(e) => setF({ ...f, quadra_id: e.target.value })}>
                  <option value="">—</option>
                  {quadras.map((q) => <option key={q.id} value={q.id}>{q.codigo}</option>)}
                </select>
              </div>
              <div>
                <label style={painel.rotulo}>Rua</label>
                <input style={{ ...painel.input, width: 110 }} value={f.rua}
                       onChange={(e) => setF({ ...f, rua: e.target.value })} placeholder="RUA 1" />
              </div>
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button style={painel.botaoSec} onClick={capturarGps}>📍 Marcar GPS aqui</button>
              {t.lat != null && (
                <a style={{ ...painel.botaoSec, textDecoration: "none" }} target="_blank" rel="noreferrer"
                   href={`https://www.google.com/maps?q=${t.lat},${t.lng}`}>
                  ver no mapa {t.gps_precisao ? `(±${t.gps_precisao} m · ${t.gps_amostras} leituras)` : ""}
                </a>
              )}
              {t.lat == null && <span style={{ color: cor.cinza, fontSize: 15 }}>sem GPS ainda</span>}
            </div>
            {gpsMsg && <p style={{ fontSize: 15, color: cor.teal, margin: "6px 0 0" }}>{gpsMsg}</p>}
          </div>

          {/* ---------------- FOTOS ---------------- */}
          <div style={bloco}>
            <div style={blocoTitulo}>Fotos de referência</div>
            <input ref={refEnq} type="file" accept="image/*" hidden
                   onChange={(e) => e.target.files?.[0] && subirFoto("enquadramento", e.target.files[0])} />
            <input ref={refRef} type="file" accept="image/*" hidden
                   onChange={(e) => e.target.files?.[0] && subirFoto("referencia", e.target.files[0])} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ textAlign: "center" }}>
                {t.foto_enquadramento_url
                  ? <img src={t.foto_enquadramento_url} alt="de longe" style={miniFoto} />
                  : <div style={{ ...miniFoto, ...semFoto }}>sem foto</div>}
                <button style={{ ...painel.botaoSec, padding: "6px 10px", marginTop: 6, fontSize: 15 }}
                        onClick={() => refEnq.current?.click()}>
                  {t.foto_enquadramento_url ? "Trocar" : "Enviar"} foto de longe
                </button>
              </div>
              <div style={{ textAlign: "center" }}>
                {t.foto_referencia_url
                  ? <img src={t.foto_referencia_url} alt="lápide" style={miniFoto} />
                  : <div style={{ ...miniFoto, ...semFoto }}>sem foto</div>}
                <button style={{ ...painel.botaoSec, padding: "6px 10px", marginTop: 6, fontSize: 15 }}
                        onClick={() => refRef.current?.click()}>
                  {t.foto_referencia_url ? "Trocar" : "Enviar"} close da lápide
                </button>
              </div>
            </div>
            <p style={{ color: cor.cinza, fontSize: 14, margin: "8px 0 0" }}>
              A foto de longe é tirada do corredor e mostra o jazigo entre os vizinhos — é ela que ajuda a achar.
            </p>
          </div>

          {/* ---------------- MEMÓRIA ---------------- */}
          <div style={bloco}>
            <div style={blocoTitulo}>Memória</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div>
                <label style={painel.rotulo}>Nome do falecido (opcional)</label>
                <input style={{ ...painel.input, width: 220 }} value={f.falecido_nome}
                       onChange={(e) => setF({ ...f, falecido_nome: e.target.value })} />
              </div>
              <div>
                <label style={painel.rotulo}>Falecimento (MM-DD)</label>
                <input style={{ ...painel.input, width: 110 }} value={f.data_falecimento}
                       onChange={(e) => setF({ ...f, data_falecimento: e.target.value })} placeholder="07-23" />
              </div>
              <div>
                <label style={painel.rotulo}>Nascimento (MM-DD)</label>
                <input style={{ ...painel.input, width: 110 }} value={f.data_nascimento}
                       onChange={(e) => setF({ ...f, data_nascimento: e.target.value })} placeholder="01-15" />
              </div>
            </div>
          </div>

          {/* ---------------- PLANO E MIGRAÇÃO ---------------- */}
          {plano && (
            <div style={{ ...bloco, background: migrado ? "#f0fdf4" : "#fffbeb",
                          borderColor: migrado ? "#bbf7d0" : "#fde68a" }}>
              <div style={blocoTitulo}>
                Plano e início da operação {migrado ? "· ✓ conferido" : "· falta conferir"}
              </div>
              <label style={painel.rotulo}>Com que frequência a Nina vai a este jazigo</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {ATALHOS_FREQUENCIA.map((a) => {
                  const marcado = p.cadencia === a.cadencia && Number(p.lavagens_por_ciclo) === a.lavagens;
                  return (
                    <button key={a.rotulo}
                      style={{ ...(marcado ? painel.botao : painel.botaoSec), padding: "10px 14px", fontSize: 14 }}
                      onClick={() => setP({ ...p, cadencia: a.cadencia, lavagens_por_ciclo: a.lavagens })}>
                      {a.rotulo}
                    </button>
                  );
                })}
              </div>

              <div style={{ background: "#f0fdfa", border: `1px solid ${cor.teal}`, borderRadius: 10,
                            padding: 12, marginBottom: 12 }}>
                <b style={{ color: cor.navy }}>
                  {descreverFrequencia(p.cadencia, Number(p.lavagens_por_ciclo))}
                </b>
                {p.cadencia !== "avulso" && (
                  <div style={{ fontSize: 14, color: cor.cinza, marginTop: 4 }}>
                    A Nina volta a cada ~{intervaloEmDias(p.cadencia, Number(p.lavagens_por_ciclo))} dias
                    {" · "}{lavagensPorAno(p.cadencia, Number(p.lavagens_por_ciclo))} lavagens por ano
                    {" · "}cobrança {p.cadencia}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <label style={painel.rotulo}>Período de cobrança</label>
                  <select style={{ ...painel.input, width: 130 }} value={p.cadencia}
                          onChange={(e) => setP({ ...p, cadencia: e.target.value })}>
                    {["mensal","bimestral","trimestral","semestral","anual","avulso"].map((c) =>
                      <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {p.cadencia !== "avulso" && (
                  <div>
                    <label style={painel.rotulo}>Lavagens no período</label>
                    <select style={{ ...painel.input, width: 110 }} value={p.lavagens_por_ciclo}
                            onChange={(e) => setP({ ...p, lavagens_por_ciclo: Number(e.target.value) })}>
                      {[1,2,3,4,6,8,12].map((n) => <option key={n} value={n}>{n}x</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label style={painel.rotulo}>Valor mensal (R$)</label>
                  <input type="number" style={{ ...painel.input, width: 110 }} value={p.valor_mensal}
                         onChange={(e) => setP({ ...p, valor_mensal: Number(e.target.value) })} />
                </div>
                <div>
                  <label style={painel.rotulo}>Cobrança do ciclo</label>
                  <div style={{ ...painel.input, width: 120, background: "#f8fafc", fontWeight: 700 }}>
                    R$ {valorCiclo.toFixed(2)}
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 12 }}>
                  <input type="checkbox" checked={p.ativo}
                         onChange={(e) => setP({ ...p, ativo: e.target.checked })} />
                  Ativo
                </label>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <div>
                  <label style={painel.rotulo}>Pago até</label>
                  <input type="date" style={{ ...painel.input, width: 160 }} value={p.pago_ate}
                         onChange={(e) => setP({ ...p, pago_ate: e.target.value })} />
                </div>
                <div>
                  <label style={painel.rotulo}>Próxima lavagem</label>
                  <input type="date" style={{ ...painel.input, width: 160 }} value={p.proximo_servico}
                         onChange={(e) => setP({ ...p, proximo_servico: e.target.value })} />
                </div>
                <div>
                  <label style={painel.rotulo}>Quando cobrar</label>
                  <select style={{ ...painel.input, width: 210 }} value={p.momento_cobranca}
                          onChange={(e) => setP({ ...p, momento_cobranca: e.target.value })}>
                    <option value="depois">Depois da lavagem (padrão)</option>
                    <option value="antes">Antes — paga para a gente ir</option>
                    <option value="contra_foto">Contra a foto — cobra ao entregar</option>
                  </select>
                </div>
                <div>
                  <label style={painel.rotulo}>Próxima cobrança</label>
                  <input type="date" style={{ ...painel.input, width: 160 }} value={p.proxima_cobranca}
                         onChange={(e) => setP({ ...p, proxima_cobranca: e.target.value })} />
                </div>
              </div>
              <p style={{ color: cor.cinza, fontSize: 14, margin: "8px 0 0" }}>
                Ao salvar, este jazigo é marcado como conferido — é assim que você acompanha o que já foi migrado.
              </p>
            </div>
          )}

          {/* ---------------- PORTAL ---------------- */}
          <div style={bloco}>
            <div style={blocoTitulo}>Portal da família</div>
            {token ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input readOnly value={linkPortal} style={{ ...painel.input, flex: 1, minWidth: 200, fontSize: 15 }}
                       onFocus={(e) => e.target.select()} />
                <button style={painel.botaoSec} onClick={() => {
                  navigator.clipboard?.writeText(linkPortal); setCopiado(true);
                  setTimeout(() => setCopiado(false), 1500);
                }}>{copiado ? "✓ copiado" : "Copiar"}</button>
                <button style={painel.botaoPerigo} onClick={() => portalAcao("revogar")}>Desativar</button>
              </div>
            ) : (
              <button style={painel.botaoSec} onClick={() => portalAcao("emitir")}>Gerar link do portal</button>
            )}
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <button style={painel.botao} onClick={salvar} disabled={salvando} data-salvar="1">
              {salvando ? "Salvando…" : "Salvar jazigo"}
            </button>
            {ok && <span style={{ color: cor.teal }}>✓ salvo</span>}
            <button style={{ ...painel.botaoPerigo, marginLeft: "auto" }} onClick={excluirJazigo}>
              Excluir jazigo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const bloco: React.CSSProperties = {
  border: `1px solid ${cor.linha}`, borderRadius: 12, padding: 14, marginBottom: 10, background: "#fff",
};
const blocoTitulo: React.CSSProperties = {
  fontSize: 15, fontWeight: 700, color: cor.navy, textTransform: "uppercase",
  letterSpacing: 0.5, marginBottom: 10,
};
const miniFoto: React.CSSProperties = {
  width: 150, height: 100, objectFit: "cover", borderRadius: 8, display: "block", border: `1px solid ${cor.linha}`,
};
const semFoto: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8",
  fontSize: 15, background: "#f8fafc",
};

function ReguaCobranca({ cliente, onSalvo, registrar }: {
  cliente: any; onSalvo: () => void;
  registrar?: (chave: string, salvar: (() => Promise<boolean>) | null) => void;
}) {
  const [f, setF] = useState({
    tratamento: cliente.tratamento || "",
    regua_cobranca: cliente.regua_cobranca || "padrao",
    dias_entre_cobrancas: cliente.dias_entre_cobrancas ?? 7,
    max_lembretes: cliente.max_lembretes ?? 3,
    orientacao_cobranca: cliente.orientacao_cobranca || "",
    ativacao_ativa: !!cliente.ativacao_ativa,
    ativacao_meses: cliente.ativacao_meses ?? 6,
    cobranca_antecipada: !!cliente.cobranca_antecipada,
  });
  const [inicial] = useState({
    tratamento: cliente.tratamento || "",
    regua_cobranca: cliente.regua_cobranca || "padrao",
    dias_entre_cobrancas: cliente.dias_entre_cobrancas ?? 7,
    max_lembretes: cliente.max_lembretes ?? 3,
    orientacao_cobranca: cliente.orientacao_cobranca || "",
    ativacao_ativa: !!cliente.ativacao_ativa,
    ativacao_meses: cliente.ativacao_meses ?? 6,
    cobranca_antecipada: !!cliente.cobranca_antecipada,
  });
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);

  const original = JSON.stringify({
    tratamento: cliente.tratamento || "", regua_cobranca: cliente.regua_cobranca || "padrao",
    dias_entre_cobrancas: cliente.dias_entre_cobrancas ?? 7, max_lembretes: cliente.max_lembretes ?? 3,
    orientacao_cobranca: cliente.orientacao_cobranca || "", ativacao_ativa: !!cliente.ativacao_ativa,
    ativacao_meses: cliente.ativacao_meses ?? 6, cobranca_antecipada: !!cliente.cobranca_antecipada,
  });

  async function gravar(): Promise<boolean> {
    const r = await fetch(`/api/clientes/${cliente.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    }).then((x) => x.json()).catch(() => null);
    return !!r?.ok;
  }

  useEffect(() => {
    if (!registrar) return;
    registrar("regua", JSON.stringify(f) !== original ? gravar : null);
    return () => registrar("regua", null);
  }, [f]);

  async function salvar() {
    setSalvando(true);
    const ok2 = await gravar();
    setSalvando(false);
    if (ok2) { setOk(true); setTimeout(() => setOk(false), 2000); onSalvo(); }
    else alert("Não consegui salvar.");
  }

  const explica: Record<string, string> = {
    suave: "Um único lembrete, bem gentil. Se não responder, a IA para e avisa você.",
    padrao: "Até três lembretes espaçados e acolhedores.",
    firme: "Até três lembretes mais objetivos, ainda respeitosos.",
    nao_cobrar: "A IA NUNCA cobra esta família. Se falarem de valores, encaminha para você.",
  };

  return (
    <div style={painel.card}
         data-alterado={JSON.stringify(f) !== JSON.stringify(inicial) ? "1" : "0"}>
      <strong style={{ color: cor.navy }}>Como a IA trata esta família</strong>

      <div style={{ marginTop: 12 }}>
        <label style={painel.rotulo}>Tratamento (como se dirigir à pessoa)</label>
        <select style={{ ...painel.input, width: "auto" }} value={f.tratamento}
                onChange={(e) => setF({ ...f, tratamento: e.target.value })}>
          <option value="">— não definido —</option>
          <option value="a senhora">a senhora</option>
          <option value="o senhor">o senhor</option>
          <option value="a Dra">a Dra</option>
          <option value="você">você (informal)</option>
        </select>
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${cor.linha}` }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: cor.navy, marginBottom: 12 }}>
          <input type="checkbox" checked={f.cobranca_antecipada}
                 onChange={(e) => setF({ ...f, cobranca_antecipada: e.target.checked })} />
          Cobrança antecipada (paga antes da lavagem)
        </label>

        <label style={painel.rotulo}>Régua de cobrança</label>
        <select style={{ ...painel.input, width: "auto" }} value={f.regua_cobranca}
                onChange={(e) => setF({ ...f, regua_cobranca: e.target.value })}>
          <option value="suave">Suave — um lembrete só</option>
          <option value="padrao">Padrão — até três lembretes</option>
          <option value="firme">Firme — mais objetiva</option>
          <option value="nao_cobrar">Não cobrar — só você resolve</option>
        </select>
        <p style={{ color: cor.cinza, fontSize: 15, margin: "6px 0 0" }}>{explica[f.regua_cobranca]}</p>

        {f.regua_cobranca !== "nao_cobrar" && (
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <div>
              <label style={painel.rotulo}>Dias entre lembretes</label>
              <input type="number" style={{ ...painel.input, width: 100 }} value={f.dias_entre_cobrancas}
                     onChange={(e) => setF({ ...f, dias_entre_cobrancas: Number(e.target.value) })} />
            </div>
            {f.regua_cobranca !== "suave" && (
              <div>
                <label style={painel.rotulo}>Máx. de lembretes</label>
                <input type="number" style={{ ...painel.input, width: 100 }} value={f.max_lembretes}
                       onChange={(e) => setF({ ...f, max_lembretes: Number(e.target.value) })} />
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          <label style={painel.rotulo}>
            Orientação específica (vale acima da régua — a IA lê isto antes de tudo)
          </label>
          <textarea
            style={{ ...painel.input, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
            value={f.orientacao_cobranca}
            onChange={(e) => setF({ ...f, orientacao_cobranca: e.target.value })}
            placeholder="Ex.: acordo de pagar jan a março à vista · sempre atrasa, não insistir · falar com o filho"
          />
        </div>
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${cor.linha}` }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: cor.navy }}>
          <input type="checkbox" checked={f.ativacao_ativa}
                 onChange={(e) => setF({ ...f, ativacao_ativa: e.target.checked })} />
          Convidar periodicamente (para quem é avulso, em vez de cobrar)
        </label>
        {f.ativacao_ativa && (
          <div style={{ marginTop: 8 }}>
            <label style={painel.rotulo}>Convidar a cada quantos meses</label>
            <input type="number" style={{ ...painel.input, width: 100 }} value={f.ativacao_meses}
                   onChange={(e) => setF({ ...f, ativacao_meses: Number(e.target.value) })} />
            {cliente.ultima_ativacao_em && (
              <p style={{ color: cor.cinza, fontSize: 14, margin: "6px 0 0" }}>
                Último convite: {new Date(cliente.ultima_ativacao_em).toLocaleDateString("pt-BR")}
              </p>
            )}
          </div>
        )}
        <p style={{ color: cor.cinza, fontSize: 14, margin: "8px 0 0" }}>
          Convites de Finados, Dia das Mães, Dia dos Pais e Natal vão para todas as famílias,
          independente desta opção.
        </p>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14 }}>
        <button style={painel.botao} onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        {ok && <span style={{ color: cor.teal }}>✓ salvo</span>}
      </div>
    </div>
  );
}


function SaldoAbertura({ clienteId, saldoAtual, onSalvo }:
  { clienteId: string; saldoAtual: number; onSalvo: () => void }) {
  const [valor, setValor] = useState<string>("");
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);

  async function salvar() {
    const v = Number(valor.replace(",", "."));
    if (!isFinite(v)) return alert("Informe um valor.");
    if (!confirm(
      v > 0 ? `Registrar R$ ${v.toFixed(2)} em aberto para esta família?`
            : v < 0 ? `Registrar R$ ${Math.abs(v).toFixed(2)} de crédito (pagou adiantado)?`
                    : "Zerar o saldo de abertura desta família?"
    )) return;
    setSalvando(true);
    const r = await fetch(`/api/clientes/${clienteId}/saldo-abertura`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valor: v, nota }),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (r?.ok) { setOk(true); setValor(""); setNota(""); setTimeout(() => setOk(false), 2500); onSalvo(); }
    else alert("Falhou: " + (r?.erro || "erro"));
  }

  return (
    <div style={painel.card}>
      <strong style={{ color: cor.navy }}>Saldo de abertura (migração)</strong>
      <p style={{ color: cor.cinza, fontSize: 15, margin: "6px 0 12px" }}>
        Quanto esta família devia quando entrou no sistema. Use o valor POSITIVO para o que está
        em aberto e NEGATIVO se ela pagou adiantado. Saldo atual no sistema:{" "}
        <b style={{ color: saldoAtual < 0 ? "#dc2626" : cor.teal }}>
          R$ {Math.abs(Number(saldoAtual || 0)).toFixed(2)} {saldoAtual < 0 ? "em aberto" : saldoAtual > 0 ? "de crédito" : ""}
        </b>
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label style={painel.rotulo}>Valor em aberto (R$)</label>
          <input style={{ ...painel.input, width: 140 }} value={valor}
                 onChange={(e) => setValor(e.target.value)} placeholder="ex.: 180 ou -150" />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={painel.rotulo}>Observação (opcional)</label>
          <input style={painel.input} value={nota} onChange={(e) => setNota(e.target.value)}
                 placeholder="ex.: pendente desde jun/25" />
        </div>
        <button style={painel.botao} onClick={salvar} disabled={salvando}>
          {salvando ? "…" : "Registrar"}
        </button>
        {ok && <span style={{ color: cor.teal, paddingBottom: 12 }}>✓ registrado</span>}
      </div>
      <p style={{ color: cor.cinza, fontSize: 14, margin: "8px 0 0" }}>
        Entra no histórico como &ldquo;Saldo de abertura (migração)&rdquo;. Registrar de novo substitui o anterior.
      </p>
    </div>
  );
}


function ExcluirCliente({ clienteId, nome }: { clienteId: string; nome: string }) {
  const [ocupado, setOcupado] = useState(false);

  async function excluir() {
    if (!confirm(`Excluir "${nome}" e todos os jazigos dela? Esta ação não pode ser desfeita.`)) return;
    setOcupado(true);
    const r = await fetch(`/api/clientes/${clienteId}`, { method: "DELETE" })
      .then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (r?.ok) { alert("Família excluída."); location.href = "/painel/clientes"; }
    else alert(r?.mensagem || r?.erro || "Não consegui excluir.");
  }

  return (
    <div style={{ ...painel.card, borderLeft: "4px solid #dc2626" }}>
      <strong style={{ color: cor.navy }}>Excluir esta família</strong>
      <p style={{ color: cor.cinza, fontSize: 15, margin: "6px 0 12px" }}>
        Só é permitido enquanto não houver lançamento no financeiro. Se já houver, use
        &ldquo;Remover dados&rdquo; acima (LGPD): apaga o que é pessoal e preserva a contabilidade.
      </p>
      <button style={painel.botaoPerigo} onClick={excluir} disabled={ocupado}>
        {ocupado ? "…" : "Excluir família"}
      </button>
    </div>
  );
}


/**
 * IDENTIFICAÇÃO — nome, apelido, telefone e foto.
 * A foto ajuda a lembrar de quem se trata: são 59 famílias, muitas com nomes
 * parecidos. Mudanças em nome e telefone ficam registradas no histórico.
 */
function Identificacao({ c, onSalvo, registrar }: {
  c: any; onSalvo: () => void;
  registrar?: (chave: string, salvar: (() => Promise<boolean>) | null) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ nome: c.nome || "", apelido: c.apelido || "", telefone: c.telefone || "" });
  const [salvando, setSalvando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const refFoto = useRef<HTMLInputElement>(null);

  const mudou = f.nome !== (c.nome || "") || f.apelido !== (c.apelido || "")
    || f.telefone !== (c.telefone || "");

  useEffect(() => {
    if (!registrar) return;
    registrar("identificacao", mudou && editando ? gravar : null);
    return () => registrar("identificacao", null);
  }, [mudou, editando, f.nome, f.apelido, f.telefone]);

  async function gravar(): Promise<boolean> {
    if (!f.nome.trim()) return false;
    const r = await fetch(`/api/clientes/${c.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    }).then((x) => x.json()).catch(() => null);
    return !!r?.ok;
  }

  async function salvar() {
    if (!f.nome.trim()) return alert("O nome não pode ficar em branco.");
    setSalvando(true);
    const r = await fetch(`/api/clientes/${c.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (r?.ok) { setEditando(false); onSalvo(); }
    else alert("Falhou: " + (r?.erro || "erro"));
  }

  async function enviarFoto(arq: File) {
    setEnviandoFoto(true);
    const buf = await arq.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const r = await fetch(`/api/clientes/${c.id}/foto`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64: btoa(bin), mimetype: arq.type || "image/jpeg" }),
    }).then((x) => x.json()).catch(() => null);
    setEnviandoFoto(false);
    if (r?.ok) onSalvo(); else alert("Não consegui enviar a foto.");
  }

  async function tirarFoto() {
    if (!confirm("Remover a foto desta família?")) return;
    await fetch(`/api/clientes/${c.id}/foto`, { method: "DELETE" });
    onSalvo();
  }

  const iniciais = String(c.nome || "?").trim().split(/\s+/).slice(0, 2)
    .map((x: string) => x[0]).join("").toUpperCase();

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap" }}>
      <input ref={refFoto} type="file" accept="image/*" hidden
             onChange={(e) => e.target.files?.[0] && enviarFoto(e.target.files[0])} />

      <div style={{ textAlign: "center" }}>
        {c.foto_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.foto_url} alt={c.nome} onClick={() => refFoto.current?.click()}
               style={{ width: 88, height: 88, borderRadius: "50%", objectFit: "cover",
                        border: `3px solid ${cor.linha}`, cursor: "pointer", display: "block" }} />
        ) : (
          <div onClick={() => refFoto.current?.click()}
               style={{ width: 88, height: 88, borderRadius: "50%", background: cor.navy,
                        color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 30, fontWeight: 700, cursor: "pointer" }}>
            {iniciais}
          </div>
        )}
        <button style={{ background: "none", border: "none", color: cor.cinza, fontSize: 14,
                         cursor: "pointer", marginTop: 6 }}
                onClick={() => (c.foto_url ? tirarFoto() : refFoto.current?.click())}>
          {enviandoFoto ? "enviando…" : c.foto_url ? "remover" : "pôr foto"}
        </button>
      </div>

      <div style={{ flex: 1, minWidth: 240 }}
           data-alterado={editando && (f.nome !== (c.nome || "") || f.apelido !== (c.apelido || "")
             || f.telefone !== (c.telefone || "")) ? "1" : "0"}>
        {editando ? (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={painel.rotulo}>Nome</label>
                <input style={painel.input} value={f.nome}
                       onChange={(e) => setF({ ...f, nome: e.target.value })} />
              </div>
              <div style={{ minWidth: 150 }}>
                <label style={painel.rotulo}>Como é chamada</label>
                <input style={painel.input} value={f.apelido}
                       onChange={(e) => setF({ ...f, apelido: e.target.value })}
                       placeholder="ex.: Dona Cida" />
              </div>
              <div>
                <label style={painel.rotulo}>WhatsApp</label>
                <input style={{ ...painel.input, width: 180 }} value={f.telefone}
                       onChange={(e) => setF({ ...f, telefone: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button style={painel.botao} onClick={salvar} disabled={salvando} data-salvar="1">
                {salvando ? "Salvando…" : "Salvar"}
              </button>
              <button style={painel.botaoSec} onClick={() => {
                setF({ nome: c.nome || "", apelido: c.apelido || "", telefone: c.telefone || "" });
                setEditando(false);
              }}>Cancelar</button>
            </div>
            <p style={{ color: cor.cinza, fontSize: 14, margin: "8px 0 0" }}>
              Mudanças em nome e telefone ficam registradas, para não se perder o rastro.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ ...painel.h1, margin: 0 }}>{c.nome}</h1>
            {c.apelido && (
              <div style={{ color: cor.cinza, fontSize: 15 }}>chamada de {c.apelido}</div>
            )}
            <div style={{ color: cor.cinza, fontSize: 14, marginTop: 4 }}>
              {String(c.telefone).startsWith("sem-tel")
                ? <span style={{ color: "#d97706" }}>sem telefone cadastrado</span>
                : c.telefone}
              {c.tratamento && ` · ${c.tratamento}`}
            </div>
            <button style={{ ...painel.botaoSec, marginTop: 10, padding: "6px 14px" }}
                    onClick={() => setEditando(true)}>
              Editar dados
            </button>
          </>
        )}
      </div>
    </div>
  );
}


/**
 * Pagamento lançado direto, atrelado à família.
 * Para o caso comum de "pagou e não mandou o comprovante": entra marcado,
 * para você conferir no extrato do banco depois.
 */
function RegistrarPagamento({ clienteId, nome, onSalvo }:
  { clienteId: string; nome: string; onSalvo: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({
    valor: "", data: new Date().toISOString().slice(0, 10),
    descricao: "", semComprovante: true,
  });
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const v = Number(String(f.valor).replace(",", "."));
    if (!v || v <= 0) return alert("Informe o valor.");
    setSalvando(true);
    const r = await fetch("/api/financeiro/pagamento-avulso", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clienteId, ...f, valor: v }),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (r?.ok) { setF({ ...f, valor: "", descricao: "" }); setAberto(false); onSalvo(); }
    else alert("Falhou: " + (r?.erro || "erro"));
  }

  if (!aberto) {
    return (
      <button style={{ ...painel.botaoSec, marginBottom: 14 }} onClick={() => setAberto(true)}>
        💰 Registrar pagamento de {nome.split(" ")[0]}
      </button>
    );
  }

  return (
    <div style={{ ...painel.card, borderLeft: `4px solid ${cor.teal}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ color: cor.navy }}>Registrar pagamento</strong>
        <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer",
                         color: cor.cinza }} onClick={() => setAberto(false)}>✕</button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
        <div>
          <label style={painel.rotulo}>Valor (R$)</label>
          <input style={{ ...painel.input, width: 130 }} value={f.valor}
                 onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder="0,00" />
        </div>
        <div>
          <label style={painel.rotulo}>Data do pagamento</label>
          <input type="date" style={{ ...painel.input, width: 165 }} value={f.data}
                 onChange={(e) => setF({ ...f, data: e.target.value })} />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={painel.rotulo}>Observação</label>
          <input style={painel.input} value={f.descricao}
                 onChange={(e) => setF({ ...f, descricao: e.target.value })}
                 placeholder="ex.: disse que pagou dia 10, conferir no extrato" />
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14,
                      margin: "12px 0", color: cor.navy }}>
        <input type="checkbox" checked={f.semComprovante}
               onChange={(e) => setF({ ...f, semComprovante: e.target.checked })} />
        Sem comprovante — a família informou, ainda vou conferir no banco
      </label>

      <button style={painel.botao} onClick={salvar} disabled={salvando}>
        {salvando ? "Registrando…" : "Lançar no extrato"}
      </button>
      <p style={{ color: cor.cinza, fontSize: 14, margin: "8px 0 0" }}>
        Entra como crédito na conta desta família e zera a régua de cobrança.
      </p>
    </div>
  );
}


/**
 * BARRA DE SALVAR — a ficha tem vários blocos e cada um tinha o próprio botão.
 * Isso obriga a pessoa a lembrar de salvar em três lugares, e uma edição
 * esquecida se perde. A barra avisa quando há mudança pendente e salva tudo.
 */
function BarraSalvar() {
  const [pendentes, setPendentes] = useState(0);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    // conta quantos formulários da ficha estão com mudança não salva
    const conta = () => {
      const marcados = document.querySelectorAll("[data-alterado='1']");
      setPendentes(marcados.length);
    };
    conta();
    const t = setInterval(conta, 800);
    return () => clearInterval(t);
  }, []);

  async function salvarTudo() {
    setSalvando(true);
    // dispara o salvar de cada bloco alterado, em ordem
    const botoes = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-salvar='1']")
    );
    for (const b of botoes) {
      b.click();
      await new Promise((r) => setTimeout(r, 400));
    }
    setSalvando(false);
  }

  if (!pendentes) return null;

  return (
    <div style={{
      position: "sticky", bottom: 0, zIndex: 20, marginTop: 8,
      background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12,
      padding: 14, display: "flex", gap: 12, alignItems: "center",
      justifyContent: "space-between", flexWrap: "wrap",
      boxShadow: "0 -4px 16px rgba(0,0,0,.06)",
    }}>
      <span style={{ color: "#92400e", fontSize: 15 }}>
        {pendentes === 1 ? "Há uma alteração não salva" : `Há ${pendentes} alterações não salvas`}
      </span>
      <button style={painel.botao} onClick={salvarTudo} disabled={salvando}>
        {salvando ? "Salvando…" : "Salvar tudo"}
      </button>
    </div>
  );
}
