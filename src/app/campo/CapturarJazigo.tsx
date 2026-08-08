"use client";

import { useEffect, useRef, useState } from "react";
import { capturarGps, qualidade } from "@/lib/gps";
import { prepararFoto, motivoFalha, type FotoPronta } from "@/lib/foto";

/**
 * CAPTURAR JAZIGO no campo — cadastro completo na hora da lavagem:
 * quadra + identificação + (falecido/obs) → cria o jazigo → GPS → 2 fotos.
 *
 * Pensado para a fase de captura das quadras: a pessoa está de pé no cemitério,
 * então é um passo de cada vez, botão grande e nada obrigatório além do essencial.
 */
export default function CapturarJazigo({ onFechar, onPronto }: {
  onFechar: () => void;
  onPronto: () => void;
}) {
  // dados
  const [cemiterios, setCemiterios] = useState<any[]>([]);
  const [cemId, setCemId] = useState<string>("");
  const [quadra, setQuadra] = useState("");
  const [identificacao, setIdentificacao] = useState("");
  // Rua/carreira: o campo que faltava. Sem ele, "12" da rua 1 e "12" da rua 3
  // eram o mesmo jazigo para o sistema — foi assim que dois tumulos viraram um
  // registro so, com a descricao de um e a foto do outro.
  const [rua, setRua] = useState("");
  const [falecido, setFalecido] = useState("");
  const [obs, setObs] = useState("");

  // A trava: quando o numero ja existe na quadra, o servidor NAO decide nada.
  // Ele devolve a ficha do que ja esta la e a captura para aqui ate voce olhar
  // a lapide e dizer se e o mesmo tumulo ou outro.
  const [duplicado, setDuplicado] = useState<any | null>(null);
  const [novoNumero, setNovoNumero] = useState("");

  // estado do jazigo já criado (a partir daqui anexamos GPS e fotos)
  const [tumuloId, setTumuloId] = useState<string | null>(null);
  const [jaExistia, setJaExistia] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // GPS
  const [gpsEstado, setGpsEstado] = useState<"idle" | "buscando" | "ok" | "erro">("idle");
  const [gpsMsg, setGpsMsg] = useState("");

  // fotos
  const [enq, setEnq] = useState<FotoPronta | null>(null);
  const [ref, setRef] = useState<FotoPronta | null>(null);
  const [enqOk, setEnqOk] = useState(false);
  const [refOk, setRefOk] = useState(false);
  const [enqMsg, setEnqMsg] = useState("");
  const [refMsg, setRefMsg] = useState("");
  const [enqIndo, setEnqIndo] = useState(false);
  const [refIndo, setRefIndo] = useState(false);
  const refEnq = useRef<HTMLInputElement>(null);
  const refRef = useRef<HTMLInputElement>(null);
  const refEnqGal = useRef<HTMLInputElement>(null);
  const refRefGal = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/tumulos").then((x) => x.json()).then((j) => {
      if (j?.ok) {
        setCemiterios(j.cemiterios || []);
        if ((j.cemiterios || []).length) setCemId(j.cemiterios[0].id);
      }
    }).catch(() => {});
  }, []);

  const cemAtual = cemiterios.find((c) => c.id === cemId);
  const quadrasExistentes: string[] = (cemAtual?.quadras || []).map((q: any) => q.codigo);

  /**
   * escolha:
   *   null       -> primeira tentativa; se o numero ja existir, o servidor trava
   *   "mesmo"    -> voce olhou a foto e confirmou: e o mesmo tumulo
   *   "outro"    -> e outro tumulo; vai com um numero novo que nao colide
   */
  async function criarJazigo(escolha?: "mesmo" | "outro") {
    setErro("");
    if (!quadra.trim()) return setErro("Diga a quadra (ex.: Q-12).");
    const numero = escolha === "outro" ? novoNumero.trim() : identificacao.trim();
    if (!numero) return setErro("Diga a identificação do jazigo (lote/número).");
    setSalvando(true);
    const r = await fetch("/api/tumulos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cemiterioId: cemId || undefined,
        quadraCodigo: quadra.trim(),
        identificacao: numero,
        rua: rua.trim() || undefined,
        falecidoNome: falecido.trim() || undefined,
        observacoes: obs.trim() || undefined,
        confirmarExistente: escolha === "mesmo" || undefined,
        forcarNovo: escolha === "outro" || undefined,
      }),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);

    if (r?.erro === "confirmar_existente" || r?.erro === "identificacao_em_uso") {
      setDuplicado(r.existente || duplicado);
      setNovoNumero(r.sugestao || `${numero}-B`);
      if (r?.erro === "identificacao_em_uso") setErro(r.mensagem || "");
      return;
    }
    if (r?.ok && r.tumuloId) {
      if (escolha === "outro") setIdentificacao(numero);
      setDuplicado(null);
      setTumuloId(r.tumuloId);
      setJaExistia(!!r.jaExistia);
    } else {
      setErro(r?.mensagem || "Não consegui criar: " + (r?.erro || "erro"));
    }
  }

  async function pegarGps() {
    if (!tumuloId) return;
    setGpsEstado("buscando");
    setGpsMsg("Procurando sinal…");
    const leitura = await capturarGps({
      alvoMetros: 8, timeoutMs: 15000,
      aoProgredir: (p) => setGpsMsg(`Sinal: ${p} m — aguarde…`),
    });
    if (!leitura) {
      setGpsEstado("erro");
      setGpsMsg("Não consegui o GPS. Veja se a localização está ligada.");
      return;
    }
    const q = qualidade(leitura.precisao);
    if (!q.serve) {
      setGpsEstado("erro");
      setGpsMsg(`Sinal ${q.rotulo} (${leitura.precisao} m). Chegue mais perto e tente de novo.`);
      return;
    }
    const r = await fetch(`/api/tumulos/${tumuloId}/gps`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...leitura, origem: "cadastro" }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      setGpsEstado("ok");
      setGpsMsg(`✓ Localização salva (precisão ~${r.precisao ?? leitura.precisao} m)`);
    } else {
      setGpsEstado("erro");
      setGpsMsg(r?.mensagem || "Não consegui salvar o GPS. Tente de novo.");
    }
  }

  /**
   * Sobe a foto e DEVOLVE O MOTIVO quando falha. A versao anterior devolvia so
   * true/false, entao a tela nunca soube dizer por que a foto nao subiu — e a
   * Nina ficava tocando de novo num botao que ia falhar igual.
   */
  async function enviarFoto(
    tipo: "enquadramento" | "referencia",
    foto: FotoPronta,
  ): Promise<{ ok: boolean; erro?: string }> {
    if (!tumuloId) return { ok: false, erro: "o jazigo ainda nao foi criado" };
    try {
      const resp = await fetch(`/api/tumulos/${tumuloId}/foto-referencia`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64: foto.b64, mimetype: foto.mt, tipo }),
      });
      const j = await resp.json().catch(() => null);
      if (resp.ok && j?.ok) return { ok: true };
      if (resp.status === 413) return { ok: false, erro: "a foto ficou pesada demais" };
      if (resp.status === 401 || resp.status === 403) return { ok: false, erro: "sua sessao caiu — entre de novo" };
      return { ok: false, erro: String(j?.erro || `o servidor respondeu ${resp.status}`) };
    } catch (e) {
      return { ok: false, erro: motivoFalha(e) };
    }
  }

  async function escolher(tipo: "enquadramento" | "referencia", f: File) {
    const ehEnq = tipo === "enquadramento";
    const setFoto = ehEnq ? setEnq : setRef;
    const setOk = ehEnq ? setEnqOk : setRefOk;
    const setMsg = ehEnq ? setEnqMsg : setRefMsg;
    const setIndo = ehEnq ? setEnqIndo : setRefIndo;

    setOk(false);
    setIndo(true);
    setMsg("Preparando a foto...");

    let foto: FotoPronta;
    try {
      // Reduz no aparelho antes de subir: 8 MB viram ~300 KB.
      foto = await prepararFoto(f);
    } catch (e) {
      setIndo(false);
      setMsg(motivoFalha(e));
      return;
    }

    setFoto(foto);
    setMsg(`Enviando ${foto.kb} KB...`);
    const r = await enviarFoto(tipo, foto);
    setIndo(false);
    setOk(r.ok);
    setMsg(r.ok ? "" : `Nao subiu: ${r.erro}`);
  }

  /** Tenta de novo a MESMA foto ja reduzida — nao pede para tirar outra. */
  async function reenviar(tipo: "enquadramento" | "referencia") {
    const ehEnq = tipo === "enquadramento";
    const foto = ehEnq ? enq : ref;
    if (!foto) return;
    const setOk = ehEnq ? setEnqOk : setRefOk;
    const setMsg = ehEnq ? setEnqMsg : setRefMsg;
    const setIndo = ehEnq ? setEnqIndo : setRefIndo;
    setIndo(true);
    setMsg("Tentando de novo...");
    const r = await enviarFoto(tipo, foto);
    setIndo(false);
    setOk(r.ok);
    setMsg(r.ok ? "" : `Nao subiu: ${r.erro}`);
  }

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.topo}>
          <strong style={{ fontSize: 20 }}>Capturar jazigo</strong>
          <button style={s.fechar} onClick={onFechar}>✕</button>
        </div>

        {/* ETAPA 1 — dados (só até criar) */}
        {!tumuloId && (
          <>
            {cemiterios.length > 1 && (
              <div>
                <div style={s.rotulo}>Cemitério</div>
                <select style={s.input} value={cemId} onChange={(e) => setCemId(e.target.value)}>
                  {cemiterios.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            )}

            <div>
              <div style={s.rotulo}>Quadra</div>
              <input style={s.input} value={quadra} onChange={(e) => setQuadra(e.target.value)}
                     list="quadras-existentes" placeholder="Ex.: Q-12 (escolha ou digite uma nova)" />
              <datalist id="quadras-existentes">
                {quadrasExistentes.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>

            <div>
              <div style={s.rotulo}>Identificação do jazigo (lote/número)</div>
              <input style={s.input} value={identificacao} onChange={(e) => setIdentificacao(e.target.value)}
                     placeholder="Ex.: 045 · lote 12" />
            </div>

            <div>
              <div style={s.rotulo}>Rua / carreira (opcional, mas ajuda muito)</div>
              <input style={s.input} value={rua} onChange={(e) => setRua(e.target.value)}
                     placeholder="Ex.: 3 · fileira do meio" />
              <p style={{ ...s.dica, marginTop: 4 }}>
                É a rua que separa dois túmulos com o mesmo número na mesma quadra.
              </p>
            </div>

            <div>
              <div style={s.rotulo}>Falecido (opcional)</div>
              <input style={s.input} value={falecido} onChange={(e) => setFalecido(e.target.value)}
                     placeholder="Nome no jazigo" />
            </div>

            <div>
              <div style={s.rotulo}>Observações (opcional)</div>
              <textarea style={{ ...s.input, minHeight: 70, fontFamily: "inherit" }} value={obs}
                        onChange={(e) => setObs(e.target.value)}
                        placeholder="Ex.: lápide de granito preto, ao lado do chafariz." />
            </div>

            {erro && <p style={s.erro}>{erro}</p>}

            {duplicado ? (
              <div style={s.trava}>
                <strong style={{ fontSize: 17, color: "#92400e" }}>
                  Já existe {quadra} · {identificacao}
                </strong>
                <p style={{ fontSize: 15, color: "#78350f", lineHeight: 1.5, margin: "6px 0 10px" }}>
                  Olhe a lápide na sua frente e a ficha abaixo. Se eu seguir sozinho e não for o
                  mesmo túmulo, a sua foto e o seu GPS entram no registro do vizinho.
                </p>

                <div style={{ display: "flex", gap: 10 }}>
                  {duplicado.fotoLapide || duplicado.fotoLonge ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={duplicado.fotoLapide || duplicado.fotoLonge} alt="jazigo já cadastrado"
                         style={{ width: 110, height: 110, objectFit: "cover", borderRadius: 8, border: "1px solid #fbbf24" }} />
                  ) : (
                    <div style={{ width: 110, height: 110, borderRadius: 8, background: "#fef3c7",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  color: "#92400e", fontSize: 14, textAlign: "center" }}>
                      sem foto<br />cadastrada
                    </div>
                  )}
                  <div style={{ fontSize: 15, color: "#78350f", lineHeight: 1.5 }}>
                    <div><b>{duplicado.falecido || "(sem nome do falecido)"}</b></div>
                    {duplicado.familia && <div>família: {duplicado.familia}</div>}
                    {duplicado.observacoes && <div>{duplicado.observacoes}</div>}
                    <div>{duplicado.temGps ? "já tem GPS marcado" : "sem GPS"}</div>
                  </div>
                </div>

                <button style={{ ...s.principal, marginTop: 12 }}
                        onClick={() => criarJazigo("mesmo")} disabled={salvando}>
                  ✓ É ESTE MESMO — atualizar este jazigo
                </button>

                <div style={{ marginTop: 14, borderTop: "1px solid #fbbf24", paddingTop: 12 }}>
                  <div style={s.rotulo}>É OUTRO túmulo — cadastrar com este número:</div>
                  <input style={s.input} value={novoNumero}
                         onChange={(e) => setNovoNumero(e.target.value)} />
                  <p style={{ ...s.dica, marginTop: 4 }}>
                    Dois jazigos não podem ter o mesmo número na mesma quadra — foi isso que
                    embaralhou os cadastros. Se preencheu a rua, sugeri o número com ela.
                  </p>
                  <button style={{ ...s.fotoBtn, width: "100%" }}
                          onClick={() => criarJazigo("outro")} disabled={salvando}>
                    É outro — criar {novoNumero || "novo"}
                  </button>
                </div>

                <button style={s.linkMini} onClick={() => { setDuplicado(null); setErro(""); }}>
                  voltar e corrigir os dados
                </button>
              </div>
            ) : (
              <button style={s.principal} onClick={() => criarJazigo()} disabled={salvando}>
                {salvando ? "Criando…" : "Criar jazigo e capturar"}
              </button>
            )}
          </>
        )}

        {/* ETAPA 2 — GPS + fotos (depois de criado) */}
        {tumuloId && (
          <>
            <div style={s.criado}>
              ✓ Jazigo {jaExistia ? "encontrado" : "criado"}: <b>{quadra} · {identificacao}</b>
              {jaExistia && <div style={{ fontSize: 15, marginTop: 4 }}>Você confirmou que é este — a localização e as fotos entram neste registro.</div>}
            </div>

            {/* GPS */}
            <div style={s.blocoGps}>
              {gpsMsg && <p style={{ ...s.gpsMsg, color: gpsEstado === "erro" ? "#b91c1c" : gpsEstado === "ok" ? "#059669" : "#334155" }}>{gpsMsg}</p>}
              <button style={{ ...s.fotoBtn, ...(gpsEstado === "ok" ? s.fotoOk : {}) }}
                      onClick={pegarGps} disabled={gpsEstado === "buscando"}>
                {gpsEstado === "ok" ? "✓ Localização salva — refazer" : gpsEstado === "buscando" ? "Procurando sinal…" : "📍 Marcar localização (GPS)"}
              </button>
            </div>

            {/* fotos: camera direto; galeria como saída quando a foto já foi tirada */}
            <input ref={refEnq} type="file" accept="image/*" capture="environment" hidden
                   onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) escolher("enquadramento", f); }} />
            <input ref={refEnqGal} type="file" accept="image/*" hidden
                   onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) escolher("enquadramento", f); }} />
            <input ref={refRef} type="file" accept="image/*" capture="environment" hidden
                   onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) escolher("referencia", f); }} />
            <input ref={refRefGal} type="file" accept="image/*" hidden
                   onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) escolher("referencia", f); }} />

            <BlocoFoto
              titulo={enqOk ? "✓ Foto de longe (onde fica)" : "📷 Foto de longe — mostra o jazigo entre os vizinhos"}
              foto={enq} ok={enqOk} indo={enqIndo} msg={enqMsg}
              onCamera={() => refEnq.current?.click()}
              onGaleria={() => refEnqGal.current?.click()}
              onTentarDeNovo={() => reenviar("enquadramento")}
            />
            <BlocoFoto
              titulo={refOk ? "✓ Foto da lápide (close)" : "📷 Foto da lápide — close que confirma"}
              foto={ref} ok={refOk} indo={refIndo} msg={refMsg}
              onCamera={() => refRef.current?.click()}
              onGaleria={() => refRefGal.current?.click()}
              onTentarDeNovo={() => reenviar("referencia")}
            />

            <button style={s.principal} onClick={onPronto}>Concluir</button>
            <p style={s.dica}>Pode concluir mesmo sem todas as fotos — dá para completar depois na ficha.</p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Um bloco de foto: botao grande de CAMERA, previa do que foi tirado, estado do
 * envio e — quando falha — o motivo em portugues com "tentar de novo" na mesma
 * foto (nao obriga a tirar outra).
 */
function BlocoFoto({ titulo, foto, ok, indo, msg, onCamera, onGaleria, onTentarDeNovo }: {
  titulo: string;
  foto: FotoPronta | null;
  ok: boolean;
  indo: boolean;
  msg: string;
  onCamera: () => void;
  onGaleria: () => void;
  onTentarDeNovo: () => void;
}) {
  return (
    <div>
      <button style={{ ...s.fotoBtn, width: "100%", ...(ok ? s.fotoOk : {}) }}
              onClick={onCamera} disabled={indo}>
        {indo ? "Aguarde..." : titulo}
      </button>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
        {foto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto.previa} alt="prévia" style={s.previa} />
        )}
        <button style={s.linkMini} onClick={onGaleria} disabled={indo}>
          escolher da galeria
        </button>
      </div>

      {indo && <p style={s.aguarde}>{msg || "Enviando..."}</p>}
      {!indo && !ok && msg && (
        <div style={s.caixaErro}>
          <p style={{ ...s.erro, marginBottom: 8 }}>{msg}</p>
          {foto && (
            <button style={s.tentar} onClick={onTentarDeNovo}>Tentar de novo</button>
          )}
        </div>
      )}
      {!indo && ok && foto && (
        <p style={s.subiu}>Subiu ({foto.kb} KB).</p>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  trava: {
    background: "#fffbeb", border: "2px solid #f59e0b",
    borderRadius: 10, padding: 14, marginTop: 4,
  },
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.6)", display: "grid", placeItems: "end center", zIndex: 60 },
  modal: { width: "100%", maxWidth: 520, background: "#fff", borderRadius: "20px 20px 0 0", padding: 20, display: "flex", flexDirection: "column", gap: 12, maxHeight: "94vh", overflowY: "auto" },
  topo: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  fechar: { background: "none", border: "none", fontSize: 22, color: "#475569" },
  rotulo: { fontSize: 18, color: "#475569", marginBottom: 6 },
  input: { width: "100%", padding: 14, fontSize: 17, borderRadius: 12, border: "1px solid #cbd5e1", boxSizing: "border-box" },
  principal: { padding: 20, fontSize: 20, fontWeight: 800, borderRadius: 14, border: "none", background: "#0f766e", color: "#fff", marginTop: 4 },
  fotoBtn: { padding: 18, fontSize: 17, fontWeight: 600, borderRadius: 12, border: "2px dashed #cbd5e1", background: "#f8fafc", color: "#334155", textAlign: "center" },
  fotoOk: { borderStyle: "solid", borderColor: "#6ee7b7", background: "#ecfdf5", color: "#059669" },
  criado: { background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 12, padding: 12, fontSize: 17, color: "#0f766e" },
  blocoGps: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 },
  gpsMsg: { fontSize: 17, margin: "0 0 8px", textAlign: "center" },
  dica: { fontSize: 15, color: "#475569", margin: "2px 0 0", textAlign: "center" },
  erro: { color: "#dc2626", margin: 0, fontSize: 16 },
  previa: { width: 68, height: 68, objectFit: "cover", borderRadius: 10, border: "1px solid #e2e8f0" },
  linkMini: { background: "none", border: "none", color: "#0f766e", fontSize: 16, textDecoration: "underline", padding: 0 },
  aguarde: { color: "#475569", margin: "6px 0 0", fontSize: 16 },
  subiu: { color: "#059669", margin: "6px 0 0", fontSize: 16 },
  caixaErro: { marginTop: 6, padding: 10, borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca" },
  tentar: { padding: "10px 14px", fontSize: 16, fontWeight: 700, borderRadius: 10, border: "none", background: "#b91c1c", color: "#fff" },
};
