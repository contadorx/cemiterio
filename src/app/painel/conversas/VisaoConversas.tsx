"use client";

/**
 * A lista de conversas, agora como ABA da central de Atendimento.
 * A pagina /painel/conversas virou a casca com as abas.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { painel, cor } from "../ui";
import Notificacoes from "../../_pwa/Notificacoes";
import InstalarApp, { avisar } from "../../InstalarApp";
import { useConfirmar, type Pedido, useRecado } from "@/components/Dialogos";

interface Conversa {
  id: string;
  tipo?: string;
  fixada?: boolean;
  estado?: "sem_resposta" | "lida_sem_resposta" | "respondida" | "sem_movimento";
  esperandoHa?: number | null;
  foto?: string | null;
  ultimoAutor?: string | null;
  aguardandoDesde?: string | null;
  respondidaEm?: string | null;
  horasEsperando?: number | null;
  cliente: string;
  telefone: string;
  assunto: string | null;
  escalada: boolean;
  resolvida: boolean;
  arquivada: boolean;
  atualizada: string;
  rascunhoPendente: boolean;
  /** O que a IA preparou e por que não mandou. Nulo = não há sugestão. */
  sugestao: { texto: string; motivo: string | null } | null;
  ultima: { texto: string; autor: string } | null;
}

const ASSUNTOS: Record<string, string> = {
  cobranca: "💰 Cobrança",
  agendamento: "📅 Agendamento",
  duvida: "❓ Dúvida",
  luto: "🕊 Luto",
  reclamacao: "⚠️ Reclamação",
  outro: "• Outro",
};

export default function VisaoConversas() {
  const recado = useRecado();
  const [lista, setLista] = useState<Conversa[]>([]);
  const [cont, setCont] = useState({ pendentes: 0, escaladas: 0, aguardando: 0, arquivadas: 0 });
  const [ultimoAviso, setUltimoAviso] = useState<string>("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [f, setF] = useState({ situacao: "pendentes", assunto: "", busca: "", de: "", ate: "" });

  /**
   * `?ver=aguardando` — o atalho vindo da linha de resumo lá de cima.
   *
   * Sem isto, aqueles links abririam a aba e deixariam a pessoa procurando
   * qual das 161 conversas era. O recorte vem junto com o clique.
   *
   * Lido no `window` dentro do efeito, e não com `useSearchParams` — que no
   * Next 14 exigiria um <Suspense> em volta da página inteira só por isso. É a
   * mesma escolha que a casca das abas já faz.
   */
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("ver");
    if (v && ["aguardando", "pendentes", "escaladas", "resolvidas", "todas", "arquivadas"].includes(v)) {
      setF((x) => ({ ...x, situacao: v }));
    }
  }, []);
  const [maisFiltros, setMaisFiltros] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [emMassa, setEmMassa] = useState(false);

  const perguntar = useConfirmar();

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const p = new URLSearchParams();
      Object.entries(f).forEach(([k, v]) => v && p.set(k, String(v)));
      const r = await fetch(`/api/conversas?${p}`).then((x) => x.json()).catch(() => null);

      if (!r?.ok) {
        setErro(r?.erro || "não consegui carregar as conversas");
        return;
      }
      // alguém respondeu? avisa pelo navegador (só a primeira vez de cada)
      const novas = (r.conversas || []).filter((c: any) => c.ultimoAutor === "cliente");
      const marca = novas.map((c: any) => `${c.id}:${c.atualizada}`).join("|");
      if (ultimoAviso && marca && marca !== ultimoAviso && novas.length) {
        const c = novas[0];
        try {
          avisar(
            `${c.cliente} respondeu`,
            String(c.ultima?.texto || "").slice(0, 120),
            `/painel/conversas/${c.id}`
          );
        } catch { /* avisar nunca pode travar a tela */ }
      }
      setUltimoAviso(marca);
      setLista(r.conversas || []);
      // mantém selecionadas só as que ainda aparecem na lista
      const presentes = new Set((r.conversas || []).map((c: any) => c.id));
      setSel((prev) => new Set([...prev].filter((id) => presentes.has(id))));
      if (r.contadores) setCont(r.contadores);
    } finally {
      // sempre sai do "carregando", mesmo se algo acima falhar.
      // Sem isto, um erro no meio deixava a tela presa em "Carregando…".
      setCarregando(false);
    }
  }, [f, ultimoAviso]);

  useEffect(() => { carregar(); }, [carregar]);

  // Ao voltar para esta tela (depois de responder numa conversa, por exemplo),
  // a lista se atualiza sozinha. Sem isto, ela mostrava o estado de antes.
  useEffect(() => {
    const aoVoltar = () => { if (document.visibilityState === "visible") carregar(); };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    window.addEventListener("pageshow", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
      window.removeEventListener("pageshow", aoVoltar);
    };
  }, [carregar]);

  // confere de tempos em tempos: é o que permite avisar sem precisar recarregar
  useEffect(() => {
    const t = setInterval(carregar, 45000);
    return () => clearInterval(t);
  }, [carregar]);

  async function acao(id: string, acao: string, confirmar?: Pedido) {
    if (confirmar && !await perguntar({
      oQue: confirmar.oQue, efeito: confirmar.efeito,
      confirmar: confirmar.confirmar, tom: confirmar.tom,
    })) return;
    const r = await fetch(`/api/conversas/${id}/acao`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) carregar();
    else recado.erro("Falhou: " + (r?.erro || "erro"));
  }

  // conversas que podem entrar na seleção (recados de equipe ficam de fora,
  // como já acontece nas ações por item)
  const selecionaveis = lista.filter((c) => c.tipo !== "equipe");
  const todasMarcadas = selecionaveis.length > 0 && selecionaveis.every((c) => sel.has(c.id));

  function alternarUma(id: string) {
    setSel((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function alternarTodas() {
    setSel(todasMarcadas ? new Set() : new Set(selecionaveis.map((c) => c.id)));
  }

  async function acaoMassa(acao: string, confirmar?: Pedido) {
    const ids = [...sel];
    if (!ids.length) return;
    if (confirmar && !await perguntar({
      oQue: confirmar.oQue, efeito: confirmar.efeito,
      confirmar: confirmar.confirmar, tom: confirmar.tom,
    })) return;
    setEmMassa(true);
    const r = await fetch("/api/conversas/acao-massa", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, acao }),
    }).then((x) => x.json()).catch(() => null);
    setEmMassa(false);
    if (r?.ok) { setSel(new Set()); carregar(); }
    else recado.erro("Falhou: " + (r?.erro || "erro"));
  }

  const abas: [string, string, number | null][] = [
    ["aguardando", "Esperando resposta", cont.aguardando],
    ["pendentes", "Precisam de você", cont.pendentes],
    ["escaladas", "Escaladas", cont.escaladas],
    ["resolvidas", "Resolvidas", null],
    ["todas", "Todas", null],
    ["arquivadas", "Arquivadas", cont.arquivadas],
  ];

  return (
    <div>
      <div>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center",
                      gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
          <Notificacoes />
        </div>

        <InstalarApp />

        {/* situação */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {abas.map(([v, rot, n]) => (
            <button key={v}
              style={f.situacao === v ? painel.botao : painel.botaoSec}
              onClick={() => setF({ ...f, situacao: v })}>
              {rot}{n ? ` (${n})` : ""}
            </button>
          ))}
        </div>

        {/* busca + assunto */}
        <div style={{ ...painel.card, padding: 12 }}>
          <div data-filtros style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              style={{ ...painel.input, flex: 1, minWidth: 180 }}
              value={f.busca}
              onChange={(e) => setF({ ...f, busca: e.target.value })}
              placeholder="Buscar por nome ou telefone…"
            />
            <select style={{ ...painel.input, width: "auto" }} value={f.assunto}
                    onChange={(e) => setF({ ...f, assunto: e.target.value })}>
              <option value="">Todos os assuntos</option>
              {Object.entries(ASSUNTOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button style={painel.botaoSec} onClick={() => setMaisFiltros(!maisFiltros)}>
              {maisFiltros ? "− período" : "+ período"}
            </button>
          </div>

          {maisFiltros && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "flex-end" }}>
              <div>
                <label style={painel.rotulo}>De</label>
                <input type="date" style={{ ...painel.input, width: 160 }} value={f.de}
                       onChange={(e) => setF({ ...f, de: e.target.value })} />
              </div>
              <div>
                <label style={painel.rotulo}>Até</label>
                <input type="date" style={{ ...painel.input, width: 160 }} value={f.ate}
                       onChange={(e) => setF({ ...f, ate: e.target.value })} />
              </div>
              <button style={painel.botaoSec}
                      onClick={() => setF({ situacao: f.situacao, assunto: "", busca: "", de: "", ate: "" })}>
                Limpar filtros
              </button>
            </div>
          )}
        </div>

        {/* seleção em massa */}
        {selecionaveis.length > 0 && (
          <div style={{
            position: "sticky", top: 0, zIndex: 5, marginBottom: 12,
            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            background: sel.size > 0 ? cor.navy : "#fff",
            color: sel.size > 0 ? "#fff" : cor.navy,
            border: `1px solid ${sel.size > 0 ? cor.navy : cor.linha}`,
            borderRadius: 12, padding: "10px 14px",
          }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 15 }}>
              <input type="checkbox" checked={todasMarcadas} onChange={alternarTodas}
                     style={{ width: 18, height: 18 }} />
              {sel.size > 0 ? `${sel.size} selecionada(s)` : "Selecionar todas"}
            </label>

            {sel.size > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginLeft: "auto" }}>
                {f.situacao === "arquivadas" ? (
                  <button style={painel.botaoMiniSec} disabled={emMassa}
                          onClick={() => acaoMassa("desarquivar")}>Reabrir</button>
                ) : (
                  <>
                    <button style={painel.botaoMiniSec} disabled={emMassa}
                            onClick={() => acaoMassa("resolver")}>Resolver</button>
                    <button style={painel.botaoMiniSec} disabled={emMassa}
                            onClick={() => acaoMassa("arquivar")}>Arquivar</button>
                  </>
                )}
                <button style={painel.botaoMiniPerigo} disabled={emMassa}
                        onClick={() => acaoMassa("excluir", {
                          oQue: `Excluir ${sel.size} conversa(s)?`,
                          efeito: "As mensagens serão apagadas e não voltam. O histórico financeiro não é afetado.",
                          confirmar: "Excluir", tom: "perigo",
                        })}>
                  Excluir
                </button>
                <button style={{ ...painel.botaoMiniSec, background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,.4)" }}
                        disabled={emMassa} onClick={() => setSel(new Set())}>
                  Limpar
                </button>
              </div>
            )}
          </div>
        )}

        {carregando && <p style={{ color: cor.cinza }}>Carregando…</p>}

        {!carregando && erro && (
          <div style={{ ...painel.card, borderLeft: "4px solid #dc2626", background: "#fef2f2" }}>
            <strong style={{ color: "#991b1b" }}>Não consegui carregar as conversas</strong>
            <p style={{ color: "#7f1d1d", fontSize: 15, margin: "6px 0 12px" }}>{erro}</p>
            <button style={painel.botao} onClick={carregar}>Tentar de novo</button>
          </div>
        )}
        {!carregando && lista.length === 0 && (
          <div style={painel.card}>
            <p style={{ color: cor.cinza, margin: 0 }}>
              {f.situacao === "pendentes"
                ? "Nada pendente. Tudo que precisava de você já foi resolvido. 🌿"
                : "Nenhuma conversa com esses filtros."}
            </p>
          </div>
        )}

        {lista.map((c) => (
          <div key={c.id} style={{ ...painel.card,
            background: sel.has(c.id) ? "#eef2ff" : c.tipo === "equipe" ? "#f0fdfa" : "#fff",
            outline: sel.has(c.id) ? `2px solid ${cor.navy}` : "none",
            borderLeft:
              c.tipo === "equipe" ? `4px solid ${cor.teal}`
              : (c.horasEsperando ?? 0) >= 24 ? "4px solid #b91c1c"     // esperando há mais de um dia
              : c.estado === "sem_resposta" || c.estado === "lida_sem_resposta" ? "4px solid #d97706"
              : c.escalada ? "4px solid #dc2626"
              : `1px solid ${cor.linha}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              {c.tipo !== "equipe" && (
                <input
                  type="checkbox"
                  checked={sel.has(c.id)}
                  onChange={() => alternarUma(c.id)}
                  aria-label={`Selecionar conversa com ${c.cliente}`}
                  style={{ width: 18, height: 18, marginTop: 4, flexShrink: 0, cursor: "pointer" }}
                />
              )}
              <div style={{ flex: 1, minWidth: 200 }}>
                <Link href={`/painel/conversas/${c.id}`} style={{ textDecoration: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {c.foto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.foto} alt="" style={{ width: 36, height: 36, borderRadius: "50%",
                           objectFit: "cover", flexShrink: 0 }} />
                    ) : null}
                    <strong style={{ color: cor.navy, fontSize: 16 }}>
                      {c.tipo === "equipe" && "📌 "}{c.cliente}
                    </strong>
                  </div>
                </Link>
                <div style={{ fontSize: 15, marginTop: 3 }}>
                  {/* um só lugar decide o status: a coluna estado, mantida pelo banco */}
                  {c.estado === "sem_resposta" || c.estado === "lida_sem_resposta" ? (
                    <span style={{ color: (c.horasEsperando ?? 0) >= 24 ? "#b91c1c" : "#92400e",
                                   fontWeight: 600 }}>
                      ⬅ esperando resposta
                      {(c.horasEsperando ?? 0) >= 24
                        ? ` há ${Math.floor((c.horasEsperando ?? 0) / 24)} dia(s)`
                        : (c.horasEsperando ?? 0) >= 1 ? ` há ${c.horasEsperando}h` : " agora"}
                      {c.estado === "lida_sem_resposta" && " · você já viu"}
                    </span>
                  ) : c.estado === "respondida" ? (
                    <span style={{ color: cor.teal }}>
                      ✓ {c.ultimoAutor === "ia" ? "a IA respondeu" : "você respondeu"}
                    </span>
                  ) : (
                    <span style={{ color: cor.cinza }}>sem movimento</span>
                  )}
                </div>
                <div style={{ fontSize: 15, color: cor.cinza, marginTop: 2 }}>
                  {c.tipo === "equipe" ? "Recados de quem está no campo"
                    : c.assunto ? ASSUNTOS[c.assunto] || c.assunto : "sem assunto"}
                  {" · "}
                  {new Date(c.atualizada).toLocaleDateString("pt-BR")}
                  {c.rascunhoPendente && <span style={{ color: "#d97706" }}> · a IA sugeriu uma resposta</span>}
                  {c.escalada && <span style={{ color: "#dc2626" }}> · escalada</span>}
                  {c.resolvida && !c.arquivada && <span style={{ color: cor.teal }}> · resolvida</span>}
                </div>
                {c.ultima && (
                  <p style={{ color: cor.cinza, fontSize: 14, margin: "6px 0 0" }}>
                    <b>{c.ultima.autor === "cliente" ? "Cliente" : "Nós"}:</b>{" "}
                    {c.ultima.texto.slice(0, 110)}{c.ultima.texto.length > 110 ? "…" : ""}
                  </p>
                )}

                {/* A SUGESTÃO DA IA, NO CONTEXTO DA CONVERSA.
                    Ela morava numa aba própria — uma lista de rascunhos soltos,
                    sem a pergunta que os originou. Era a segunda porta que a
                    0094 fechou para as mensagens e deixou aberta para a IA, e
                    foi assim que 162 rascunhos se acumularam sem ninguém ver.

                    Aqui ela aparece embaixo da última mensagem, que é o único
                    lugar onde dá para julgar se a resposta serve. E o MOTIVO
                    junto: "a IA ficou em dúvida" e "disparos desligados" pedem
                    decisões diferentes. */}
                {c.sugestao && (
                  <div style={{ marginTop: 8, paddingLeft: 10,
                                borderLeft: "3px solid #d97706" }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#92400e" }}>
                      A IA sugeriu
                      {c.sugestao.motivo ? ` — segurou porque: ${c.sugestao.motivo}` : ""}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 14, color: cor.cinza, lineHeight: 1.45 }}>
                      {c.sugestao.texto.slice(0, 160)}
                      {c.sugestao.texto.length > 160 ? "…" : ""}
                    </p>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
                <Link href={`/painel/conversas/${c.id}`} style={painel.botaoMiniSec}>
                  Abrir
                </Link>
                {c.tipo !== "equipe" && !c.arquivada && !c.resolvida && (
                  <button style={painel.botaoMiniSec}
                          onClick={() => acao(c.id, "resolver")}>Resolver</button>
                )}
                {c.tipo !== "equipe" && !c.arquivada && (
                  <button style={painel.botaoMiniSec}
                          onClick={() => acao(c.id, "arquivar")}>Arquivar</button>
                )}
                {c.arquivada && (
                  <button style={painel.botaoMiniSec}
                          onClick={() => acao(c.id, "desarquivar")}>Reabrir</button>
                )}
                {c.tipo !== "equipe" && <button style={painel.botaoMiniPerigo}
                        onClick={() => acao(c.id, "excluir", {
                          oQue: `Excluir a conversa com ${c.cliente}?`,
                          efeito: "As mensagens serão apagadas e não voltam. O histórico financeiro não é afetado.",
                          confirmar: "Excluir", tom: "perigo",
                        })}>
                  Excluir
                </button>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
