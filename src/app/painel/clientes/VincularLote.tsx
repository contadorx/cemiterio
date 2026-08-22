"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { painel, cor, numeroBR } from "../ui";
import { ATALHOS_FREQUENCIA } from "@/lib/frequencia";

/**
 * VINCULAR EM LOTE — a mesa onde o que a equipe capturou no campo ganha dono.
 *
 * A ajudante cadastra o jazigo no celular com foto e GPS, mas SEM família (o
 * papel "campo" não pode atribuir família de propósito). Esses jazigos ficam
 * órfãos. Antes, dar dono a eles era um a um, abrindo a ficha de cada família.
 *
 * Aqui os órfãos aparecem com FOTO e GPS — que é o que permite reconhecer o
 * túmulo sentado na mesa — e recebem família (existente ou nova) numa passada
 * só. O plano é opcional em cada linha.
 */

type Orfao = {
  id: string;
  identificacao: string;
  rua: string | null;
  numero: string | null;
  falecido: string | null;
  observacoes: string | null;
  quadraId: string | null;
  quadra: string | null;
  cemiterio: string | null;
  lat: number | null;
  lng: number | null;
  gpsPrecisao: number | null;
  fotoEnquadramento: string | null;
  fotoReferencia: string | null;
  criadoEm: string | null;
};

type Familia = {
  id: string; nome: string; telefone: string | null; quadras: string[];
  /** A família existe e ainda não se sabe com quem falar (0091). */
  semContato?: boolean;
};

type Atrib = {
  modo: "existente" | "nova";
  clienteId: string;
  clienteNome: string;
  novoNome: string;
  novoTel: string;
  freq: number; // índice em ATALHOS_FREQUENCIA, -1 = sem plano
  valor: string;
};

const VAZIO: Atrib = {
  modo: "existente", clienteId: "", clienteNome: "",
  novoNome: "", novoTel: "", freq: -1, valor: "",
};

function semAcento(s: string) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export default function VincularLote({ onMudou }: { onMudou?: () => void }) {
  const [carregando, setCarregando] = useState(true);
  const [orfaos, setOrfaos] = useState<Orfao[]>([]);
  const [familias, setFamilias] = useState<Familia[]>([]);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [quadraFiltro, setQuadraFiltro] = useState("");
  const [marcados, setMarcados] = useState<Record<string, true>>({});
  const [atrib, setAtrib] = useState<Record<string, Atrib>>({});
  const [salvando, setSalvando] = useState(false);
  const [relatorio, setRelatorio] = useState<{ ok: boolean; mensagem: string; ident: string }[]>([]);
  const [foto, setFoto] = useState<string | null>(null);
  const seq = useRef(0);

  async function carregar() {
    const meu = ++seq.current;
    setCarregando(true);
    setErro("");
    try {
      const r = await fetch("/api/tumulos/orfaos");
      const j = await r.json();
      if (meu !== seq.current) return; // só a busca mais nova pinta a tela
      if (!j?.ok) { setErro(j?.erro || "Não consegui carregar."); setOrfaos([]); }
      else { setOrfaos(j.orfaos || []); setFamilias(j.familias || []); }
    } catch {
      if (meu === seq.current) setErro("Sem conexão.");
    } finally {
      if (meu === seq.current) setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, []);

  const quadras = useMemo(() => {
    const s = new Set<string>();
    orfaos.forEach((o) => { if (o.quadra) s.add(o.quadra); });
    return Array.from(s).sort();
  }, [orfaos]);

  const visiveis = useMemo(() => {
    const b = semAcento(busca.trim());
    return orfaos.filter((o) => {
      if (quadraFiltro && o.quadra !== quadraFiltro) return false;
      if (!b) return true;
      return (
        semAcento(o.identificacao).includes(b) ||
        semAcento(o.falecido || "").includes(b) ||
        semAcento(o.quadra || "").includes(b) ||
        semAcento(o.rua || "").includes(b)
      );
    });
  }, [orfaos, busca, quadraFiltro]);

  function pegar(id: string): Atrib {
    return atrib[id] || VAZIO;
  }
  function mudar(id: string, p: Partial<Atrib>) {
    setAtrib((a) => ({ ...a, [id]: { ...(a[id] || VAZIO), ...p } }));
  }

  const idsMarcados = Object.keys(marcados).filter((id) => visiveis.some((o) => o.id === id));

  // Um item só está pronto quando dá para saber de QUAL FAMÍLIA é o jazigo.
  //
  // O telefone saiu da conta (0091). Era ele a parede: 81 dos 204 jazigos
  // capturados no campo são de famílias de quem a Sureya ainda não tem número,
  // e exigir o telefone deixava todos parados esperando algo que talvez nunca
  // chegue. Nome da família basta; o contato entra quando aparecer.
  function pronto(id: string): boolean {
    const a = pegar(id);
    if (a.modo === "nova") return !!a.novoNome.trim();
    return !!a.clienteId;
  }
  const prontos = idsMarcados.filter(pronto);

  async function enviar() {
    if (!prontos.length) return;

    // valida o dinheiro ANTES de mandar: valor ilegível não vira preço chutado
    const itens: any[] = [];
    for (const id of prontos) {
      const a = pegar(id);
      const o = orfaos.find((x) => x.id === id);
      const item: any = { tumuloId: id };
      if (a.modo === "nova") item.novaFamilia = { nome: a.novoNome.trim(), telefone: a.novoTel.trim() };
      else item.familiaId = a.clienteId;   // `clienteId` no estado é o id da FAMÍLIA desde a 0091

      if (a.freq >= 0) {
        const at = ATALHOS_FREQUENCIA[a.freq];
        if (at.cadencia !== "avulso") {
          const v = numeroBR(a.valor);
          if (!isFinite(v) || v <= 0) {
            setErro(`Valor do plano de "${o?.identificacao || id}" não entendido. Digite como 60 ou 60,50 — ou deixe "Definir depois".`);
            return;
          }
          item.plano = { cadencia: at.cadencia, lavagensPorCiclo: at.lavagens, valorMensal: v };
        }
      }
      itens.push(item);
    }

    setSalvando(true);
    setErro("");
    setRelatorio([]);
    try {
      const r = await fetch("/api/tumulos/vincular-lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens }),
      });
      const j = await r.json();
      if (!j?.ok) { setErro(j?.mensagem || j?.erro || "Não consegui vincular."); return; }

      const linhas = (j.resultados || []).map((x: any) => ({
        ok: !!x.ok,
        mensagem: x.mensagem,
        ident: orfaos.find((o) => o.id === x.tumuloId)?.identificacao || "—",
      }));
      setRelatorio(linhas);

      // some da fila só o que realmente entrou; o que falhou continua na tela
      const okIds = new Set((j.resultados || []).filter((x: any) => x.ok).map((x: any) => x.tumuloId));
      setOrfaos((lista) => lista.filter((o) => !okIds.has(o.id)));
      setMarcados((m) => {
        const novo = { ...m };
        okIds.forEach((id: any) => delete novo[id]);
        return novo;
      });
      if (okIds.size && onMudou) onMudou();
    } catch {
      setErro("Sem conexão. Nada foi vinculado.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      {foto && (
        <div
          onClick={() => setFoto(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 50,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto} alt="foto do jazigo" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 12 }} />
        </div>
      )}

      <div style={painel.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <strong style={{ color: cor.navy, fontSize: 17 }}>
            Jazigos do campo sem família {carregando ? "" : `(${orfaos.length})`}
          </strong>
          <button style={painel.botaoMiniSec} onClick={carregar} disabled={carregando}>
            {carregando ? "Carregando…" : "Atualizar"}
          </button>
        </div>
        <p style={{ color: cor.cinza, fontSize: 14, margin: "8px 0 0" }}>
          Foi a equipe que cadastrou no cemitério, com foto e GPS. Escolha a família de
          cada um — ou marque vários e aplique a mesma família de uma vez.
        </p>
      </div>

      {erro && (
        <div style={{ ...painel.card, background: "rgb(var(--zm-perigo) / 0.08)", border: "1px solid #fecaca", color: "rgb(var(--zm-perigo))" }}>
          {erro}
        </div>
      )}

      {!!relatorio.length && (
        <div style={painel.card}>
          <strong style={{ color: cor.navy }}>Resultado</strong>
          <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
            {relatorio.map((l, i) => (
              <div key={i} style={{ fontSize: 14, color: l.ok ? "#166534" : "rgb(var(--zm-perigo))" }}>
                {l.ok ? "✓" : "✕"} <strong>{l.ident}</strong> — {l.mensagem}
              </div>
            ))}
          </div>
        </div>
      )}

      {!carregando && !orfaos.length && !erro && (
        <div style={painel.card}>
          <p style={{ margin: 0, color: cor.cinza }}>
            Nenhum jazigo esperando família. Quando a equipe cadastrar no aplicativo de
            campo, ele aparece aqui.
          </p>
        </div>
      )}

      {!!orfaos.length && (
        <>
          <div style={{ ...painel.card, display: "grid", gap: 10, gridTemplateColumns: "1fr 180px" }}>
            <input
              style={painel.input}
              placeholder="Buscar por lote, falecido, quadra ou rua"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <select style={painel.input} value={quadraFiltro} onChange={(e) => setQuadraFiltro(e.target.value)}>
              <option value="">Todas as quadras</option>
              {quadras.map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>

          <AplicarEmLote
            familias={familias}
            quantos={idsMarcados.length}
            onAplicar={(f) => {
              setAtrib((a) => {
                const novo = { ...a };
                idsMarcados.forEach((id) => {
                  novo[id] = { ...(novo[id] || VAZIO), modo: "existente", clienteId: f.id, clienteNome: f.nome };
                });
                return novo;
              });
            }}
            onTodos={() => {
              const todos: Record<string, true> = {};
              visiveis.forEach((o) => { todos[o.id] = true; });
              setMarcados(todos);
            }}
            onNenhum={() => setMarcados({})}
          />

          {visiveis.map((o) => (
            <Cartao
              key={o.id}
              o={o}
              familias={familias}
              marcado={!!marcados[o.id]}
              atrib={pegar(o.id)}
              onMarcar={(v) =>
                setMarcados((m) => {
                  const novo = { ...m };
                  if (v) novo[o.id] = true; else delete novo[o.id];
                  return novo;
                })
              }
              onMudar={(p) => mudar(o.id, p)}
              onFoto={setFoto}
            />
          ))}

          <div style={{
            ...painel.card, position: "sticky", bottom: 0, zIndex: 5,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 10, flexWrap: "wrap", boxShadow: "0 -4px 16px rgba(15,23,42,.10)",
          }}>
            <span style={{ color: cor.cinza, fontSize: 14 }}>
              {idsMarcados.length} marcado(s) · <strong>{prontos.length}</strong> com família definida
            </span>
            <button
              style={{ ...painel.botao, opacity: prontos.length && !salvando ? 1 : 0.5 }}
              disabled={!prontos.length || salvando}
              onClick={enviar}
            >
              {salvando ? "Vinculando…" : `Vincular ${prontos.length || ""}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Barra de ação em lote: marca tudo / desmarca / aplica a mesma família. */
function AplicarEmLote({
  familias, quantos, onAplicar, onTodos, onNenhum,
}: {
  familias: Familia[];
  quantos: number;
  onAplicar: (f: Familia) => void;
  onTodos: () => void;
  onNenhum: () => void;
}) {
  const [q, setQ] = useState("");
  const achados = useMemo(() => {
    const b = semAcento(q.trim());
    if (!b) return [];
    return familias.filter((f) => semAcento(f.nome).includes(b) || (f.telefone || "").includes(b)).slice(0, 6);
  }, [q, familias]);

  return (
    <div style={{ ...painel.card, background: "rgb(var(--zm-fundo))" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <button style={painel.botaoMiniSec} onClick={onTodos}>Marcar todos</button>
        <button style={painel.botaoMiniSec} onClick={onNenhum}>Limpar marcação</button>
        <span style={{ color: cor.cinza, fontSize: 14, alignSelf: "center" }}>{quantos} marcado(s)</span>
      </div>
      <label style={painel.rotulo}>Aplicar a mesma família aos marcados</label>
      <input
        style={painel.input}
        placeholder="Digite o nome da família"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        disabled={!quantos}
      />
      {!!achados.length && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {achados.map((f) => (
            <button
              key={f.id}
              style={painel.botaoMiniSec}
              onClick={() => { onAplicar(f); setQ(""); }}
            >
              {f.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Cartao({
  o, familias, marcado, atrib, onMarcar, onMudar, onFoto,
}: {
  o: Orfao;
  familias: Familia[];
  marcado: boolean;
  atrib: Atrib;
  onMarcar: (v: boolean) => void;
  onMudar: (p: Partial<Atrib>) => void;
  onFoto: (url: string) => void;
}) {
  const [q, setQ] = useState("");

  // sugestão honesta: quem já cuida de outro túmulo NESTA quadra é o primeiro
  // palpite — é assim que as famílias aparecem no cemitério, agrupadas.
  const sugeridas = useMemo(() => {
    if (!o.quadraId) return [];
    return familias.filter((f) => f.quadras.includes(o.quadraId as string)).slice(0, 5);
  }, [familias, o.quadraId]);

  const achados = useMemo(() => {
    const b = semAcento(q.trim());
    if (!b) return [];
    return familias.filter((f) => semAcento(f.nome).includes(b) || (f.telefone || "").includes(b)).slice(0, 6);
  }, [q, familias]);

  const capa = o.fotoEnquadramento || o.fotoReferencia;
  const gps = o.lat != null && o.lng != null;

  return (
    <div style={{ ...painel.card, border: `1px solid ${marcado ? cor.teal : cor.linha}` }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <input
          type="checkbox"
          checked={marcado}
          onChange={(e) => onMarcar(e.target.checked)}
          style={{ width: 22, height: 22, marginTop: 4, flexShrink: 0 }}
        />

        {capa ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={capa}
            alt="jazigo"
            onClick={() => onFoto(capa)}
            style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 10, cursor: "zoom-in", flexShrink: 0 }}
          />
        ) : (
          <div style={{
            width: 96, height: 96, borderRadius: 10, flexShrink: 0,
            background: "#f1f5f9", color: cor.cinza, fontSize: 12,
            display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
          }}>
            sem foto
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: cor.navy, fontSize: 16 }}>
            {o.identificacao}{o.quadra ? ` · quadra ${o.quadra}` : ""}
          </div>
          <div style={{ color: cor.cinza, fontSize: 14, marginTop: 2 }}>
            {o.falecido ? o.falecido : <em>falecido não informado</em>}
            {o.rua ? ` · rua ${o.rua}${o.numero ? " nº " + o.numero : ""}` : ""}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {gps ? (
              <a
                href={`https://www.google.com/maps?q=${o.lat},${o.lng}`}
                target="_blank" rel="noreferrer"
                style={{ ...painel.botaoMiniSec, padding: "4px 10px", minHeight: 0, fontSize: 12 }}
              >
                📍 GPS{o.gpsPrecisao != null ? ` ±${Math.round(o.gpsPrecisao)}m` : ""}
              </a>
            ) : (
              <span style={{ fontSize: 12, color: "rgb(var(--zm-aviso))", background: "rgb(var(--zm-aviso) / 0.08)", border: "1px solid #fde68a", borderRadius: 8, padding: "4px 10px" }}>
                sem GPS
              </span>
            )}
            {o.quadra === "S/Q" && (
              <span style={{ fontSize: 12, color: "rgb(var(--zm-aviso))", background: "rgb(var(--zm-aviso) / 0.08)", border: "1px solid #fde68a", borderRadius: 8, padding: "4px 10px" }}>
                sem quadra — confira antes
              </span>
            )}
            {o.fotoReferencia && o.fotoEnquadramento && (
              <button
                style={{ ...painel.botaoMiniSec, padding: "4px 10px", minHeight: 0, fontSize: 12 }}
                onClick={() => onFoto(o.fotoReferencia as string)}
              >
                ver lápide
              </button>
            )}
          </div>
          {o.observacoes && (
            <div style={{ color: cor.cinza, fontSize: 13, marginTop: 6 }}>{o.observacoes}</div>
          )}
        </div>
      </div>

      {/* --- de quem é --- */}
      <div style={{ marginTop: 12, borderTop: `1px solid ${cor.linha}`, paddingTop: 12 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button
            style={atrib.modo === "existente" ? painel.botaoMini : painel.botaoMiniSec}
            onClick={() => onMudar({ modo: "existente" })}
          >
            Família cadastrada
          </button>
          <button
            style={atrib.modo === "nova" ? painel.botaoMini : painel.botaoMiniSec}
            onClick={() => onMudar({ modo: "nova" })}
          >
            Família nova
          </button>
        </div>

        {atrib.modo === "existente" ? (
          <>
            {atrib.clienteId ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ color: cor.navy, fontWeight: 600 }}>👪 {atrib.clienteNome}</span>
                <button
                  style={{ ...painel.botaoMiniSec, padding: "4px 10px", minHeight: 0, fontSize: 12 }}
                  onClick={() => onMudar({ clienteId: "", clienteNome: "" })}
                >
                  trocar
                </button>
              </div>
            ) : (
              <>
                <input
                  style={painel.input}
                  placeholder="Buscar família por nome ou telefone"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                {!!achados.length && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {achados.map((f) => (
                      <button
                        key={f.id}
                        style={painel.botaoMiniSec}
                        onClick={() => { onMudar({ clienteId: f.id, clienteNome: f.nome }); setQ(""); }}
                      >
                        {f.nome}
                      </button>
                    ))}
                  </div>
                )}
                {!q && !!sugeridas.length && (
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 13, color: cor.cinza }}>
                      Já cuidam de túmulo nesta quadra:
                    </span>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      {sugeridas.map((f) => (
                        <button
                          key={f.id}
                          style={painel.botaoMiniSec}
                          onClick={() => onMudar({ clienteId: f.id, clienteNome: f.nome })}
                        >
                          {f.nome}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <input
                style={painel.input}
                placeholder="Nome da família"
                value={atrib.novoNome}
                onChange={(e) => onMudar({ novoNome: e.target.value })}
              />
              {/* O TELEFONE VIROU OPCIONAL (0091), e o rótulo diz isso.
                  Um campo que parece obrigatório é obrigatório na prática: quem
                  não tem o número desiste da linha inteira em vez de cadastrar
                  a família e voltar depois — que é exatamente o que trancou 81
                  jazigos. */}
              <input
                style={painel.input}
                placeholder="WhatsApp com DDD (se tiver)"
                inputMode="tel"
                value={atrib.novoTel}
                onChange={(e) => onMudar({ novoTel: e.target.value })}
              />
            </div>
            {!atrib.novoTel.trim() && !!atrib.novoNome.trim() && (
              <p style={{ fontSize: 13, color: cor.cinza, margin: "6px 2px 0", lineHeight: 1.45 }}>
                Sem telefone a família é criada assim mesmo, e o jazigo fica ligado a ela.
                As limpezas <b>viram cobrança normalmente</b> — o contato entra quando aparecer.
              </p>
            )}
          </div>
        )}

        {/* --- plano opcional --- */}
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 150px", marginTop: 10 }}>
          <select
            style={painel.input}
            value={atrib.freq}
            onChange={(e) => onMudar({ freq: Number(e.target.value) })}
          >
            <option value={-1}>Plano: definir depois</option>
            {ATALHOS_FREQUENCIA.map((a, i) => (
              <option key={a.rotulo} value={i}>{a.rotulo}</option>
            ))}
          </select>
          <input
            style={painel.input}
            placeholder="Valor mensal"
            inputMode="decimal"
            value={atrib.valor}
            onChange={(e) => onMudar({ valor: e.target.value })}
            disabled={atrib.freq < 0 || ATALHOS_FREQUENCIA[atrib.freq]?.cadencia === "avulso"}
          />
        </div>
        {atrib.freq >= 0 && ATALHOS_FREQUENCIA[atrib.freq]?.cadencia === "avulso" && (
          <div style={{ fontSize: 13, color: "rgb(var(--zm-aviso))", marginTop: 6 }}>
            &quot;Só quando pedirem&quot; não cria plano — não há periodicidade nem vencimento
            a agendar. O jazigo entra na família do mesmo jeito.
          </div>
        )}
      </div>
    </div>
  );
}
