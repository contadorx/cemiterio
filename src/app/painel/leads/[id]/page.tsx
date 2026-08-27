"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PainelNav, painel, cor } from "../../ui";
import { useConfirmar, useRecado } from "@/components/Dialogos";

interface MsgLead { t?: string; texto: string; de?: "nos"; via?: "celular" }
interface ClienteBusca { id: string; nome: string; telefone: string | null }

export default function LeadThread() {
  const recado = useRecado();
  const perguntar = useConfirmar();
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [lead, setLead] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [pensando, setPensando] = useState(false);
  const [abrirVinculo, setAbrirVinculo] = useState(false);
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<ClienteBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  async function carregar() {
    const r = await fetch(`/api/leads/${id}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) { setLead(r.lead); setErro(""); }
    else setErro(r?.erro || "não consegui carregar");
  }
  useEffect(() => { if (id) carregar(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => { fim.current?.scrollIntoView(); }, [lead]);

  async function enviar() {
    if (!texto.trim()) return;
    setOcupado(true);
    const r = await fetch(`/api/leads/${id}/responder`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (r?.ok) { setTexto(""); carregar(); }
    else recado.erro(r?.erro === "falha_envio"
      ? "Não consegui enviar pelo WhatsApp: " + (r?.detalhe || "")
      : "Não consegui enviar: " + (r?.erro || "erro"));
  }

  async function sugerir() {
    setPensando(true);
    const r = await fetch(`/api/leads/${id}/abordagem`, { method: "POST" })
      .then((x) => x.json()).catch(() => null);
    setPensando(false);
    if (r?.ok) setTexto(r.texto);
    else recado.erro(r?.erro === "teto_ia_atingido" ? "Teto de IA do dia atingido." : "Não consegui sugerir agora.");
  }

  async function converter() {
    if (!await perguntar({
      oQue: `Transformar ${lead.nome || lead.nome_wa || lead.telefone} em cliente?`,
      efeito: "A conversa vai junto e você completa a ficha em seguida.",
      confirmar: "Transformar em cliente",
    })) return;
    setOcupado(true);
    const r = await fetch(`/api/leads/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "converter" }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (r?.ok && r.clienteId) router.push(`/painel/clientes/${r.clienteId}`);
    else recado.erro("Não consegui converter: " + (r?.erro || "erro"));
  }

  // busca de família com debounce — não dispara a cada tecla
  useEffect(() => {
    if (!abrirVinculo) return;
    const q = busca.trim();
    if (q.length < 2) { setAchados([]); return; }
    let vivo = true;
    setBuscando(true);
    const t = setTimeout(async () => {
      const r = await fetch(`/api/clientes/buscar?q=${encodeURIComponent(q)}`)
        .then((x) => x.json()).catch(() => null);
      if (!vivo) return;
      setBuscando(false);
      setAchados(r?.ok ? r.clientes : []);
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [busca, abrirVinculo]);

  async function vincular(c: ClienteBusca) {
    if (!await perguntar({
      oQue: `Vincular esta conversa a ${c.nome}?`,
      efeito: `O histórico vai para a conversa dessa família e o número ${lead.telefone} passa a ser `
            + "reconhecido como dela — a próxima mensagem deste aparelho não vira lead de novo.",
      confirmar: "Vincular",
    })) return;
    setOcupado(true);
    const r = await fetch(`/api/leads/${id}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "vincular", clienteId: c.id }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (r?.ok && r.clienteId) router.push(`/painel/clientes/${r.clienteId}`);
    else recado.erro("Não consegui vincular: " + (r?.erro || "erro"));
  }

  async function patch(corpo: Record<string, any>, sair?: boolean) {
    setOcupado(true);
    const r = await fetch(`/api/leads/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (r?.ok) { sair ? router.push("/painel/conversas?aba=leads") : carregar(); }
    else recado.erro("Não consegui atualizar: " + (r?.erro || "erro"));
  }

  async function descartar() {
    if (await perguntar({
      oQue: "Descartar este lead?",
      efeito: "Ele some da lista ativa. Volta se a pessoa escrever de novo.",
      confirmar: "Descartar", tom: "perigo",
    })) {
      patch({ status: "descartado" }, true);
    }
  }
  async function naoEhLead() {
    const r0 = await perguntar({
      oQue: 'Marcar como "não é lead"?',
      efeito: "O número entra na lista de bloqueio e não volta a aparecer nem se a pessoa escrever de novo.",
      confirmar: "Não é lead", tom: "perigo",
      pedirMotivo: "Motivo (opcional)", motivoOpcional: true,
    });
    const motivo = !r0 ? null : (r0 === true ? "" : r0.motivo);
    if (motivo === null) return;
    patch({ ignorado: true, motivoIgnorado: motivo || null }, true);
  }

  if (!lead && !erro) {
    return (
      <div style={painel.wrap}>
        <PainelNav atual="/painel/conversas" />
        <div style={painel.conteudo}><p style={{ color: cor.cinza }}>Carregando…</p></div>
      </div>
    );
  }
  if (erro) {
    return (
      <div style={painel.wrap}>
        <PainelNav atual="/painel/conversas" />
        <div style={painel.conteudo}>
          <div style={{ ...painel.card, borderLeft: "4px solid #dc2626", background: "#fef2f2" }}>
            <strong style={{ color: "#991b1b" }}>Não consegui abrir este lead</strong>
            <p style={{ color: "#7f1d1d", fontSize: 15 }}>{erro}</p>
            <Link href="/painel/conversas?aba=leads" style={painel.botaoSec}>Voltar aos leads</Link>
          </div>
        </div>
      </div>
    );
  }

  const msgs: MsgLead[] = Array.isArray(lead.mensagens) ? lead.mensagens : [];
  const doWhats = lead.origem === "whatsapp";
  const convertido = lead.status === "convertido" || !!lead.cliente_id;

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/conversas" />
      <div style={painel.conteudo}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <Link href="/painel/conversas?aba=leads" style={{ color: cor.cinza, fontSize: 14, textDecoration: "none" }}>← Leads</Link>
            <h1 style={{ ...painel.h1, margin: "4px 0 0" }}>{lead.nome || lead.nome_wa || "Sem nome"}</h1>
          </div>
          <a href={`https://wa.me/${String(lead.telefone || "").replace(/\D/g, "")}`}
             target="_blank" rel="noreferrer" style={painel.botaoMiniSec}>WhatsApp ↗</a>
        </div>
        <p style={{ color: cor.cinza, marginTop: 4, fontSize: 14 }}>
          {lead.telefone} · {doWhats ? "escreveu no WhatsApp" : lead.origem === "manual" ? "prospecção" : lead.origem} · {lead.status}
          {lead.ignorado && <span style={{ color: "#b91c1c", fontWeight: 600 }}> · 🚫 não é lead</span>}
        </p>

        {lead.contexto && (
          <div style={{ ...painel.card, background: "#f8fafc", padding: 12 }}>
            <div style={painel.rotulo}>Contexto</div>
            <p style={{ margin: 0, color: "#334155", fontSize: 14 }}>{lead.contexto}</p>
            {lead.jazigo_ref && <p style={{ margin: "6px 0 0", color: cor.cinza, fontSize: 14 }}>Jazigo: {lead.jazigo_ref}</p>}
          </div>
        )}

        {convertido && (
          <div style={{ ...painel.card, borderLeft: `4px solid ${cor.teal}`, background: "#f0fdfa" }}>
            <span style={{ color: cor.navy }}>Este lead já virou cliente. </span>
            {lead.cliente_id && (
              <Link href={`/painel/clientes/${lead.cliente_id}`} style={{ color: cor.teal, fontWeight: 700 }}>
                Abrir a ficha do cliente →
              </Link>
            )}
          </div>
        )}

        {/* histórico */}
        <div style={{ ...painel.card, maxHeight: 420, overflowY: "auto" }}>
          {msgs.length === 0 && <p style={{ color: cor.cinza }}>Nenhuma mensagem ainda. Escreva a primeira abaixo.</p>}
          {msgs.map((m, i) => {
            const nosso = m.de === "nos";
            return (
              <div key={i} style={{ margin: "8px 0", textAlign: nosso ? "right" : "left" }}>
                <span style={{ display: "inline-block", maxWidth: "80%", padding: "8px 12px", borderRadius: 12,
                               background: nosso ? "#1e293b" : "#e2e8f0", color: nosso ? "#fff" : cor.navy, fontSize: 14 }}>
                  {m.texto}
                  {m.t && <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
                    {nosso ? (m.via === "celular" ? "você · pelo celular" : "nós") : "lead"} · {new Date(m.t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </div>}
                </span>
              </div>
            );
          })}
          <div ref={fim} />
        </div>

        {/* responder */}
        {!lead.ignorado && !convertido && (
          <div>
            <textarea
              rows={5}
              style={{ ...painel.input, width: "100%", minHeight: 120, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
              placeholder="Escreva a resposta…"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar(); }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
              <button style={painel.botao} onClick={enviar} disabled={ocupado || !texto.trim()}>Enviar pelo WhatsApp</button>
              <button style={painel.botaoSec} onClick={sugerir} disabled={pensando}>
                {pensando ? "Pensando…" : "✨ Sugerir mensagem"}
              </button>
              <span style={{ fontSize: 13, color: cor.cinza }}>Ctrl+Enter envia</span>
            </div>
          </div>
        )}

        {/* vincular a uma família que já existe */}
        {abrirVinculo && !convertido && (
          <div style={{ ...painel.card, marginTop: 14, borderLeft: `4px solid ${cor.teal}` }}>
            <div style={painel.rotulo}>Vincular a uma família da carteira</div>
            <p style={{ margin: "0 0 8px", fontSize: 13, color: cor.cinza }}>
              Para quando a família já é sua e escreveu de outro aparelho. O histórico entra na
              conversa dela e este número passa a ser reconhecido — não vira lead de novo.
            </p>
            <input
              style={{ ...painel.input, width: "100%" }}
              placeholder="Nome ou telefone da família…"
              value={busca}
              autoFocus
              onChange={(e) => setBusca(e.target.value)}
            />
            <div style={{ marginTop: 8 }}>
              {buscando && <p style={{ fontSize: 13, color: cor.cinza, margin: 0 }}>Procurando…</p>}
              {!buscando && busca.trim().length >= 2 && achados.length === 0 && (
                <p style={{ fontSize: 13, color: cor.cinza, margin: 0 }}>
                  Nenhuma família com esse nome. Se ela ainda não está na carteira, use
                  “Transformar em cliente”.
                </p>
              )}
              {achados.map((c) => (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                                         gap: 8, padding: "8px 0", borderBottom: `1px solid ${cor.linha}` }}>
                  <div>
                    <div style={{ color: cor.navy, fontWeight: 600, fontSize: 14 }}>{c.nome}</div>
                    <div style={{ color: cor.cinza, fontSize: 13 }}>{c.telefone || "sem telefone"}</div>
                  </div>
                  <button style={painel.botaoMini} onClick={() => vincular(c)} disabled={ocupado}>Vincular</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ações do lead */}
        <div style={{ ...painel.card, marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!convertido && (
            <>
              <button style={painel.botao} onClick={converter} disabled={ocupado}>Transformar em cliente</button>
              <button style={painel.botaoSec} onClick={() => setAbrirVinculo((v) => !v)} disabled={ocupado}>
                🔗 Vincular a família existente
              </button>
            </>
          )}
          {!lead.ignorado && lead.status !== "em_conversa" && !convertido && (
            <button style={painel.botaoSec} onClick={() => patch({ status: "em_conversa" })} disabled={ocupado}>Marcar “em conversa”</button>
          )}
          {!lead.ignorado && !convertido && (
            <>
              <button style={painel.botaoSec} onClick={descartar} disabled={ocupado}>Descartar</button>
              <button style={painel.botaoSec} onClick={naoEhLead} disabled={ocupado}>🚫 Não é lead</button>
            </>
          )}
          {lead.ignorado && (
            <button style={painel.botaoSec} onClick={() => patch({ ignorado: false, status: "novo" })} disabled={ocupado}>Voltar a mostrar</button>
          )}
        </div>
      </div>
    </div>
  );
}
