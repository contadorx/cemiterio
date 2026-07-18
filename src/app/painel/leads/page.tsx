"use client";

import { useCallback, useEffect, useState } from "react";
import { PainelNav, painel, cor } from "../ui";

/**
 * LEADS — duas naturezas bem diferentes:
 *  · quem ESCREVEU no WhatsApp e não é cliente (a IA não responde: pode ser
 *    alguém da vida pessoal da Sureya)
 *  · quem a Sureya QUER abordar (prospecção, com o contexto que ela conhece)
 */
export default function Leads() {
  const [lista, setLista] = useState<any[]>([]);
  const [f, setF] = useState({ status: "", origem: "", ocultos: false });
  const [novo, setNovo] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const p = new URLSearchParams();
    if (f.status) p.set("status", f.status);
    if (f.origem) p.set("origem", f.origem);
    if (f.ocultos) p.set("ocultos", "1");
    const r = await fetch(`/api/leads?${p}`).then((x) => x.json()).catch(() => null);
    setLista(r?.leads || []);
    setCarregando(false);
  }, [f]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/leads" />
      <div style={painel.conteudo}>
        <h1 style={painel.h1}>Leads e prospecção</h1>

        <div style={{ ...painel.card, borderLeft: `4px solid ${cor.navy}`, background: "#f8fafc" }}>
          <p style={{ margin: 0, fontSize: 14, color: cor.cinza, lineHeight: 1.6 }}>
            O WhatsApp é o número pessoal da Sureya, então <b>a IA nunca responde sozinha</b> a
            quem não é cliente — pode ser uma amiga, um parente ou alguém do outro trabalho.
            Quem escreve aparece aqui para ela decidir. Para abordar alguém, cadastre com o
            contexto que você conhece e peça uma sugestão de mensagem.
          </p>
        </div>

        <div style={{ ...painel.card, padding: 12 }}>
          <div data-filtros style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select style={{ ...painel.input, width: "auto" }} value={f.origem}
                    onChange={(e) => setF({ ...f, origem: e.target.value })}>
              <option value="">Todas as origens</option>
              <option value="whatsapp">Escreveram no WhatsApp</option>
              <option value="manual">Prospecção (cadastrei eu)</option>
              <option value="indicacao">Indicação</option>
            </select>
            <select style={{ ...painel.input, width: "auto" }} value={f.status}
                    onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="">Ativos (esconde descartados)</option>
              <option value="novo">Novos</option>
              <option value="em_conversa">Em conversa</option>
              <option value="convertido">Viraram cliente</option>
              <option value="descartado">Descartados</option>
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, color: cor.cinza }}>
              <input type="checkbox" checked={f.ocultos}
                     onChange={(e) => setF({ ...f, ocultos: e.target.checked })} />
              mostrar ignorados
            </label>
            <button style={{ ...painel.botao, marginLeft: "auto" }} onClick={() => setNovo(!novo)}>
              {novo ? "Fechar" : "+ Nova prospecção"}
            </button>
          </div>
        </div>

        {novo && <NovoLead onPronto={() => { setNovo(false); carregar(); }} />}

        {carregando && <p style={{ color: cor.cinza }}>Carregando…</p>}
        {!carregando && lista.length === 0 && (
          <div style={painel.card}><p style={{ margin: 0, color: cor.cinza }}>Nenhum lead com esses filtros.</p></div>
        )}

        {lista.map((l) => <Lead key={l.id} l={l} onMudou={carregar} />)}
      </div>
    </div>
  );
}

function NovoLead({ onPronto }: { onPronto: () => void }) {
  const [f, setF] = useState({ nome: "", telefone: "", contexto: "", jazigoRef: "", proximoPasso: "" });
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    const r = await fetch("/api/leads", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (r?.ok) onPronto();
    else alert("Falhou: " + (r?.erro || "erro"));
  }

  return (
    <div style={painel.card}>
      <strong style={{ color: cor.navy }}>Quem você quer abordar?</strong>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={painel.rotulo}>Nome</label>
          <input style={painel.input} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        </div>
        <div>
          <label style={painel.rotulo}>WhatsApp</label>
          <input style={{ ...painel.input, width: 170 }} value={f.telefone}
                 onChange={(e) => setF({ ...f, telefone: e.target.value })} placeholder="11 99999-9999" />
        </div>
        <div style={{ minWidth: 160 }}>
          <label style={painel.rotulo}>Jazigo de interesse</label>
          <input style={painel.input} value={f.jazigoRef}
                 onChange={(e) => setF({ ...f, jazigoRef: e.target.value })} placeholder="Família SILVA · QD 1" />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label style={painel.rotulo}>
          O que você sabe sobre a pessoa (é isto que a IA usa para escrever)
        </label>
        <textarea style={{ ...painel.input, minHeight: 70, fontFamily: "inherit" }} value={f.contexto}
                  onChange={(e) => setF({ ...f, contexto: e.target.value })}
                  placeholder="Ex.: irmã da dona Cecília, que indicou. O jazigo do pai está sem cuidado há uns 2 anos. Falei com ela no cemitério em maio." />
      </div>
      <button style={{ ...painel.botao, marginTop: 12 }} onClick={salvar} disabled={salvando}>
        {salvando ? "Salvando…" : "Cadastrar"}
      </button>
    </div>
  );
}

function Lead({ l, onMudou }: { l: any; onMudou: () => void }) {
  const [sugestao, setSugestao] = useState("");
  const [pensando, setPensando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const msgs = Array.isArray(l.mensagens) ? l.mensagens : [];
  const doWhats = l.origem === "whatsapp";

  async function sugerir() {
    setPensando(true);
    const r = await fetch(`/api/leads/${l.id}/abordagem`, { method: "POST" })
      .then((x) => x.json()).catch(() => null);
    setPensando(false);
    if (r?.ok) setSugestao(r.texto);
    else alert(r?.erro === "teto_ia_atingido" ? "Teto de IA do dia atingido." : "Não consegui sugerir agora.");
  }

  async function mudarStatus(status: string) {
    const r = await fetch(`/api/leads/${l.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) onMudou(); else alert("Não consegui atualizar.");
  }

  /** Não é cliente e não vai ser: some da lista e não volta nem escrevendo de novo. */
  async function naoEhLead() {
    const motivo = prompt(
      `Marcar ${l.nome || l.nome_wa || l.telefone} como "não é lead"?\n\n` +
      `Some da lista e o número não volta a aparecer nem se escrever de novo.\n` +
      `Se quiser, anote o motivo (opcional):`,
      ""
    );
    if (motivo === null) return;   // cancelou
    const r = await fetch(`/api/leads/${l.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ignorado: true, motivoIgnorado: motivo || null }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) onMudou(); else alert("Não consegui marcar.");
  }

  async function voltarASerLead() {
    const r = await fetch(`/api/leads/${l.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ignorado: false, status: "novo" }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) onMudou();
  }

  const tel = String(l.telefone || "").replace(/\D/g, "");
  const linkWhats = `https://wa.me/${tel}${sugestao ? `?text=${encodeURIComponent(sugestao)}` : ""}`;

  return (
    <div style={{ ...painel.card, borderLeft: doWhats ? "4px solid #d97706" : `4px solid ${cor.teal}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <strong style={{ color: cor.navy, fontSize: 16 }}>
            {l.nome || l.nome_wa || "Sem nome"}
          </strong>
          <div style={{ fontSize: 15, color: cor.cinza, marginTop: 2 }}>
            {l.telefone} · {doWhats ? "escreveu no WhatsApp" : l.origem === "manual" ? "prospecção" : l.origem}
            {" · "}{l.status}
            {l.ignorado && (
              <span style={{ color: "#b91c1c", fontWeight: 600 }}>
                {" · "}🚫 não é lead{l.motivo_ignorado ? ` (${l.motivo_ignorado})` : ""}
              </span>
            )}
          </div>
          {l.jazigo_ref && <div style={{ fontSize: 15, color: cor.cinza }}>Jazigo: {l.jazigo_ref}</div>}
          {l.contexto && (
            <p style={{ fontSize: 14, color: "#334155", margin: "8px 0 0", background: "#f8fafc",
                        padding: 10, borderRadius: 8 }}>{l.contexto}</p>
          )}
          {msgs.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 14, color: cor.cinza, textTransform: "uppercase" }}>O que escreveu:</div>
              {msgs.slice(-3).map((m: any, i: number) => (
                <p key={i} style={{ fontSize: 14, margin: "4px 0", color: "#334155" }}>“{m.texto}”</p>
              ))}
            </div>
          )}
        </div>
      </div>

      {sugestao && (
        <div style={{ marginTop: 12, padding: 12, background: "#f0fdfa", borderRadius: 10,
                      border: `1px solid ${cor.teal}` }}>
          <div style={{ fontSize: 14, color: cor.teal, textTransform: "uppercase", marginBottom: 6 }}>
            Sugestão — leia e ajuste antes de mandar
          </div>
          <textarea style={{ ...painel.input, minHeight: 150, fontFamily: "inherit",
                             lineHeight: 1.5, resize: "vertical" }}
                    value={sugestao} onChange={(e) => setSugestao(e.target.value)} />
          <div style={{ fontSize: 13, color: cor.cinza, marginTop: 6 }}>
            {sugestao.trim().split(/\s+/).filter(Boolean).length} palavras · edite à vontade antes de mandar
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button style={painel.botaoSec} onClick={sugerir} disabled={pensando}>
          {pensando ? "Pensando…" : sugestao ? "Sugerir outra" : "✨ Sugerir mensagem"}
        </button>
        {sugestao && (
          <button style={painel.botaoSec} onClick={() => {
            navigator.clipboard?.writeText(sugestao); setCopiado(true); setTimeout(() => setCopiado(false), 1500);
          }}>{copiado ? "✓ copiado" : "Copiar"}</button>
        )}
        <a href={linkWhats} target="_blank" rel="noreferrer"
           style={{ ...painel.botao, textDecoration: "none" }}>Abrir no WhatsApp</a>
        {l.status !== "convertido" && (
          <button style={painel.botaoSec} onClick={() => mudarStatus("em_conversa")}>Em conversa</button>
        )}
        {!l.ignorado && (
          <>
            <button style={painel.botaoSec} onClick={() => mudarStatus("descartado")}>
              Descartar
            </button>
            <button style={painel.botaoSec} onClick={naoEhLead}>
              🚫 Não é lead
            </button>
          </>
        )}
        {l.ignorado && (
          <button style={painel.botaoSec} onClick={voltarASerLead}>
            Voltar a mostrar
          </button>
        )}
      </div>
    </div>
  );
}
