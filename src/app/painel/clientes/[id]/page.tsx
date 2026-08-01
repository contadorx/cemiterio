"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PainelNav, painel, cor, numeroBR, dinheiroBR } from "../../ui";
import Extras from "./Extras";
import { ATALHOS_FREQUENCIA, descreverFrequencia, intervaloEmDias, lavagensPorAno } from "@/lib/frequencia";
import { normalizarMMDD } from "@/lib/memoria";
import { valorMensalDoPlano } from "@/lib/vencimento";
import { prepararFoto, motivoFalha } from "@/lib/foto";

/**
 * REGISTRO DE PENDÊNCIAS — o mecanismo de salvar da ficha.
 *
 * A ficha é grande e tem vários blocos editáveis (dados da família, cada jazigo,
 * régua de cobrança). Cada bloco que tem edição não salva se declara aqui,
 * entregando a PRÓPRIA função de gravar e um rótulo legível. A barra do rodapé
 * lê esse registro: sabe quantos e quais blocos estão pendentes e grava todos
 * chamando as funções — sem simular clique no DOM e sem esperar por timeout,
 * como fazia o mecanismo antigo.
 */
type Pendencia = { rotulo: string; salvar: () => Promise<boolean> };
type Registrar = (chave: string, pendencia: Pendencia | null) => void;

/**
 * Registra/desregistra a pendência do bloco conforme ele fica sujo ou limpo.
 * A função de gravar é lida de um ref, então a barra sempre chama a versão
 * mais recente (com os valores atuais do formulário) mesmo tendo registrado
 * uma vez só — o que mantém o pai re-renderizando só quando muda de estado.
 */
function usarPendencia(
  registrar: Registrar | undefined,
  chave: string,
  rotulo: string,
  sujo: boolean,
  gravar: () => Promise<boolean>,
) {
  const gravarRef = useRef(gravar);
  const rotuloRef = useRef(rotulo);
  // atualizado depois do commit (não durante o render) — em React 18 um render
  // descartado deixaria o ref apontando para um closure que nunca existiu
  useEffect(() => {
    gravarRef.current = gravar;
    rotuloRef.current = rotulo;
  });

  useEffect(() => {
    if (!registrar) return;
    if (sujo) registrar(chave, { rotulo, salvar: () => gravarRef.current() });
    else registrar(chave, null);
  }, [registrar, chave, sujo, rotulo]);

  // ao desmontar (jazigo excluído, ficha trocada) a pendência sai do registro
  useEffect(() => () => registrar?.(chave, null), [registrar, chave]);
}

export default function FichaCliente() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [d, setD] = useState<any>(null);
  const [pendencias, setPendencias] = useState<Record<string, Pendencia>>({});
  const [salvandoTudo, setSalvandoTudo] = useState(false);

  // identidade estável: os blocos usam isto como dependência de efeito
  const registrar = useCallback<Registrar>((chave, pendencia) => {
    setPendencias((atual) => {
      if (!pendencia) {
        if (!(chave in atual)) return atual; // evita re-render à toa
        const novo = { ...atual };
        delete novo[chave];
        return novo;
      }
      return { ...atual, [chave]: pendencia };
    });
  }, []);

  // trava em ref: dois eventos no mesmo tick (clique + Enter) passariam por um
  // if() de estado, e o estado só volta a false depois do recarregamento
  const salvandoRef = useRef(false);

  async function salvarTudo() {
    const itens = Object.values(pendencias);
    if (!itens.length || salvandoRef.current) return;
    salvandoRef.current = true;
    setSalvandoTudo(true);
    const falhas: string[] = [];
    try {
      for (const p of itens) {
        const ok = await p.salvar().catch(() => false);
        if (!ok) falhas.push(p.rotulo);
      }
      if (falhas.length) {
        alert(
          `Não consegui salvar: ${falhas.join(", ")}.\n` +
          "O que salvou já está gravado. Confira esses campos e tente de novo.",
        );
      }
      await carregar().catch(() => {});
    } finally {
      salvandoRef.current = false;
      setSalvandoTudo(false);
    }
  }

  // aviso do navegador se tentar sair com edição pendente
  useEffect(() => {
    if (!Object.keys(pendencias).length) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [pendencias]);

  const [inst, setInst] = useState("");
  const [modo, setModo] = useState("copiloto");
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);
  const [erroIa, setErroIa] = useState("");
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

  // este bloco (Atendimento da IA) tem estado próprio no topo da página; o
  // recarregamento só pode sobrescrever o que o usuário digitou se ele NÃO
  // estiver com edição pendente — senão "Salvar tudo" apagaria o texto dele
  const iaSujoRef = useRef(false);

  async function carregar() {
    const r = await fetch(`/api/clientes/${id}`).then((x) => x.json());
    if (r.ok) {
      setD(r);
      if (!iaSujoRef.current) {
        setInst(r.cliente.instrucoes_ia || "");
        setModo(r.cliente.modo);
        setAtivo(r.cliente.ativo_ia);
      }
    }
  }
  useEffect(() => {
    if (id) carregar();
  }, [id]);

  async function gravarIa(): Promise<boolean> {
    setSalvando(true);
    setOk(false);
    setErroIa("");
    const r = await fetch(`/api/clientes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instrucoes_ia: inst, modo, ativo_ia: ativo }),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (r?.ok) { setOk(true); setTimeout(() => setOk(false), 2000); return true; }
    setErroIa(String(r?.erro || "não consegui salvar"));
    return false;
  }

  async function salvar() {
    const deu = await gravarIa();
    if (deu) carregar();
  }

  const cli = d?.cliente;
  const iaSujo = !!cli && (
    inst !== (cli.instrucoes_ia || "") || modo !== cli.modo || ativo !== cli.ativo_ia
  );
  iaSujoRef.current = iaSujo;
  usarPendencia(registrar, "ia", "atendimento da IA", iaSujo, gravarIa);

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
          <Identificacao c={c} onSalvo={carregar} registrar={registrar} />
          <button style={painel.botao} onClick={abrirConversa}>Abrir conversa</button>
        </div>

        <ChaveEnvio clienteId={id} ligado={c.envio_automatico !== false} onSalvo={carregar} />

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
                <a href={`/painel/recibo/${p.id}`} target="_blank" rel="noreferrer" style={painel.botaoMiniSec}>
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
            <button style={iaSujo ? painel.botao : painel.botaoSec} onClick={salvar}
                    disabled={salvando || !iaSujo}>
              {salvando ? "Salvando…" : iaSujo ? "Salvar" : "Sem alterações"}
            </button>
            {ok && <span style={{ color: cor.teal }}>✓ salvo</span>}
            {erroIa && <span style={{ color: "#dc2626", fontSize: 14 }}>{erroIa}</span>}
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
          {d.tumulos.length === 0 && (
            <p style={{ color: cor.cinza }}>
              Nenhum túmulo cadastrado ainda — inclua o primeiro abaixo.
            </p>
          )}
          {(d.tumulos || []).map((t: any) => {
            const pl = (d.planos || []).find((p: any) => p.tumulo_id === t.id) || null;
            // a key inclui o plano: quando um plano é criado agora, o bloco
            // remonta e lê os valores reais (antes o estado interno seguia com
            // os zeros do "sem plano" e a barra oferecia gravá-los)
            return (
              <TumuloEdit key={`${t.id}:${pl?.id ?? "novo"}`} t={t} plano={pl}
                          onSalvo={carregar} registrar={registrar} />
            );
          })}

          <AdicionarTumulo clienteId={id} vazio={d.tumulos.length === 0} onMudou={carregar} />
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

        <BarraSalvar pendencias={pendencias} salvando={salvandoTudo} onSalvarTudo={salvarTudo} />

        <Extras clienteId={id} tumulos={d.tumulos || []} onMudou={carregar} />

        <RegistrarPagamento clienteId={id} nome={c.nome} onSalvo={carregar} />

        <SaldoAbertura clienteId={id} saldoAtual={d.saldo} onSalvo={carregar} />

        <ReguaCobranca cliente={c} onSalvo={carregar} registrar={registrar} />

        <ExcluirCliente clienteId={id} nome={c.nome} />

        <PrivacidadeIndicacao clienteId={id} consentimentoEm={c.consentimento_em} codigo={c.codigo_indicacao} />
      </div>
    </div>
  );
}

/**
 * CHAVE DE ENVIO AUTOMATICO DA FAMILIA
 * -----------------------------------------------------------------------------
 * Freio pedido pelo Leandro (01/08): antes de a familia entrar "no ar", ele quer
 * conferir o cadastro. Com a chave DESLIGADA a Sureya nao dispara NADA sozinha
 * para esta familia — nem a foto do jazigo limpo, nem cobranca, nem convite, nem
 * pesquisa. Responder manualmente na conversa continua funcionando normalmente.
 * O padrao de toda familia e LIGADO; ele desliga as que ainda estao em revisao.
 */
function ChaveEnvio({ clienteId, ligado, onSalvo }: {
  clienteId: string;
  ligado: boolean;
  onSalvo: () => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function virar() {
    const novo = !ligado;
    if (!novo && !confirm("Colocar esta familia EM REVISAO?\n\nEnquanto estiver desligada a Sureya nao envia nada sozinha para ela (foto, cobranca, convite). Voce continua podendo responder pela conversa.")) return;
    setSalvando(true);
    setErro("");
    const r = await fetch(`/api/clientes/${clienteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ envio_automatico: novo }),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (r?.ok) onSalvo();
    else setErro(String(r?.erro || "nao consegui salvar"));
  }

  return (
    <div style={{ ...painel.card, borderLeft: `4px solid ${ligado ? "#166534" : "#b45309"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 700 }}>
            Envio automatico:{" "}
            <span style={{ color: ligado ? "#166534" : "#b45309" }}>{ligado ? "LIGADO" : "DESLIGADO (em revisao)"}</span>
          </div>
          <div style={{ color: cor.cinza, fontSize: 14, marginTop: 4, maxWidth: 620 }}>
            {ligado
              ? "A Sureya pode enviar sozinha para esta familia: foto do jazigo ao concluir o servico, lembrete de pagamento, convite e pesquisa."
              : "A Sureya NAO envia nada sozinha para esta familia. Confira o cadastro (telefone, jazigos, plano) e ligue quando estiver certo. Responder pela conversa continua funcionando."}
          </div>
        </div>
        <button
          style={ligado ? painel.botaoSec : painel.botao}
          onClick={virar}
          disabled={salvando}
        >
          {salvando ? "salvando..." : ligado ? "Desligar (revisar)" : "Ligar envios"}
        </button>
      </div>
      {erro && <div style={{ color: "#b91c1c", marginTop: 8, fontSize: 14 }}>{erro}</div>}
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

function TumuloEdit({ t, plano, onSalvo, registrar }: {
  t: any; plano: any; onSalvo: () => void; registrar?: Registrar;
}) {
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
  const [p, setP] = useState<Record<string, any>>({
    cadencia: plano?.cadencia || "mensal",
    lavagens_por_ciclo: plano?.lavagens_por_ciclo ?? plano?.qtd_por_passagem ?? 1,
    valor_mensal: dinheiroBR(valorMensalDoPlano(plano?.cadencia, plano?.valor_mensal, plano?.valor_vigente)),
    ativo: plano?.ativo !== false,
    pago_ate: (plano?.pago_ate || "").slice(0, 10),
    proximo_servico: (plano?.proximo_servico || "").slice(0, 10),
    proxima_cobranca: (plano?.proxima_cobranca || "").slice(0, 10),
    momento_cobranca: plano?.momento_cobranca || "depois",
  });
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);
  const [erro, setErro] = useState("");
  const [token, setToken] = useState<string | null>(t.qr_token || null);
  // O FORMULARIO ATUAL, LEGIVEL DEPOIS DO AWAIT. gravar() fecha em cima do `p`
  // do render em que foi criado; o PATCH demora e o usuario continua digitando.
  // Sem este ref, o pos-salvamento julgava o campo pelo valor VELHO e apagava a
  // marca da digitacao nova (ver "DIGITACAO DURANTE O SALVAMENTO").
  const pRef = useRef<Record<string, any>>(p);
  pRef.current = p;
  const [copiado, setCopiado] = useState(false);
  const [gpsMsg, setGpsMsg] = useState("");
  const refEnq = useRef<HTMLInputElement>(null);
  const refRef = useRef<HTMLInputElement>(null);
  // Dois inputs por foto: um abre a CAMERA (capture), outro a galeria. Sem o
  // capture, o Android/iOS so oferece a galeria — era por isso que no painel
  // "so dava para recuperar foto ja tirada".
  const refEnqCam = useRef<HTMLInputElement>(null);
  const refRefCam = useRef<HTMLInputElement>(null);
  const [fotoMsg, setFotoMsg] = useState("");
  const [fotoIndo, setFotoIndo] = useState(false);

  // CAMPOS TOCADOS DO PLANO — a ficha mandava o objeto inteiro em todo Salvar.
  // Consequencias reais: (a) corrigir SO a data de "pago ate" reenviava cadencia
  // e valor, e o servidor recalculava valor_vigente = mensal x meses em cima de
  // um plano antigo importado, dobrando o valor debitado em cada lavagem;
  // (b) o que o servidor mudou sozinho no meio (proxima lavagem depois de uma
  // conclusao no campo, por exemplo) voltava com o valor velho por cima.
  // Agora o PATCH leva apenas o que o usuario mexeu — mesma solucao da tela de
  // Planos. Todo input do plano passa por mudarP().
  const tocadoP = useRef<Record<string, true>>({});
  function mudarP(campos: Record<string, any>) {
    for (const k of Object.keys(campos)) tocadoP.current[k] = true;
    setP((v) => ({ ...v, ...campos }));
  }

  const MESES: Record<string, number> = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12, avulso: 0 };
  // (o valor do ciclo e calculado depois de pBase/dinheiro — ver "CICLO NA TELA")

  // Este jazigo tem edição não salva? (comparado com o que veio do banco)
  // Serve para a barra "Salvar tudo" só tocar os que mudaram — antes ela clicava
  // em todos e marcava jazigo intocado como "conferido", re-salvando à toa.
  //
  // A comparação usa o valor JÁ NORMALIZADO (data em MM-DD, dinheiro com 2 casas):
  // é isso que o banco vai guardar, então é isso que tem de bater na volta —
  // senão o bloco fica "sujo" para sempre depois de salvar.
  const fCmp = (o: typeof f) => JSON.stringify({
    ...o,
    data_falecimento: normalizarMMDD(o.data_falecimento) ?? o.data_falecimento,
    data_nascimento: normalizarMMDD(o.data_nascimento) ?? o.data_nascimento,
  });
  // normaliza para comparar e para mandar ao servidor: "40,50" e 40.5 viram
  // "40.50". Texto invalido devolve "" (e o gravar() recusa antes de mandar).
  // O ARREDONDAMENTO TEM DE SER O DO SERVIDOR. toFixed(2) e Math.round(x*100)/100
  // discordam em numeros de 3 casas que caem no meio: "40,025" da "40.02" aqui e
  // 40.03 na rota (/api/planos/[id] usa Math.round). O bloco ficava eternamente
  // "diferente" do banco: barra de pendencia acesa, aviso de sair da pagina e
  // "✓ salvo" na mesma tela, sem nada mais para salvar, ate apertar F5.
  const dinheiro = (v: any) => {
    const n = numeroBR(v);
    return isFinite(n) ? (Math.round(n * 100) / 100).toFixed(2) : "";
  };
  const pCmp = (o: Record<string, any>) => JSON.stringify({
    ...o, valor_mensal: dinheiro(o.valor_mensal), lavagens_por_ciclo: Number(o.lavagens_por_ciclo),
  });

  const fBase: typeof f = {
    identificacao: t.identificacao || "", numero: t.numero || "", quadra_id: t.quadra_id || "",
    rua: t.rua || "", falecido_nome: t.falecido_nome || "", data_falecimento: dFal, data_nascimento: dNas,
  };
  const pBase = {
    cadencia: plano?.cadencia || "mensal",
    lavagens_por_ciclo: plano?.lavagens_por_ciclo ?? plano?.qtd_por_passagem ?? 1,
    valor_mensal: dinheiroBR(valorMensalDoPlano(plano?.cadencia, plano?.valor_mensal, plano?.valor_vigente)),
    ativo: plano?.ativo !== false,
    pago_ate: (plano?.pago_ate || "").slice(0, 10),
    proximo_servico: (plano?.proximo_servico || "").slice(0, 10),
    proxima_cobranca: (plano?.proxima_cobranca || "").slice(0, 10),
    momento_cobranca: plano?.momento_cobranca || "depois",
  };
  // DADO NOVO DO SERVIDOR: a ficha recarrega sozinha (foto, GPS, "Salvar tudo"
  // de outro jazigo) e o formulario ficava congelado no dado velho — o bloco
  // seguia "alterado" para sempre e a barra oferecia salvar uma diferenca que
  // nao existia mais. Aqui a base nova e adotada, mas SO quando o formulario
  // ainda esta igual a base anterior: se o usuario digitou algo, a digitacao
  // dele vence e nada e sobrescrito no meio da edicao.
  const fBaseSig = fCmp(fBase);
  const pBaseSig = pCmp(pBase);
  const baseAnterior = useRef({ f: fBaseSig, p: pBaseSig });
  useEffect(() => {
    if (fBaseSig !== baseAnterior.current.f && fCmp(f) === baseAnterior.current.f) setF(fBase);
    if (pBaseSig !== baseAnterior.current.p && pCmp(p) === baseAnterior.current.p) {
      setP(pBase);
      tocadoP.current = {};
    }
    baseAnterior.current = { f: fBaseSig, p: pBaseSig };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fBaseSig, pBaseSig]);

  const alterado = fBaseSig !== fCmp(f) || (!!plano && pBaseSig !== pCmp(p));

  // data de memoria que veio TORTA do banco (e nao foi o usuario que digitou):
  // o Salvar nao trava mais por causa dela, mas a tela nao finge que esta certa.
  const dataTorta = (normalizarMMDD(f.data_falecimento) === null && f.data_falecimento === fBase.data_falecimento)
    || (normalizarMMDD(f.data_nascimento) === null && f.data_nascimento === fBase.data_nascimento);

  // TOCADO **E** DIFERENTE. So "tocado" nao basta: digitar "45,0" e voltar para
  // "45,00" deixa a flag armada para sempre. A barra amarela desaparece (a
  // comparacao com a base diz "igual", e esta certa), mas o proximo Salvar
  // — de uma data, por exemplo — ainda mandava valor_mensal. Em plano antigo o
  // servidor entao grava valor_vigente = mensal x meses e cada lavagem passa a
  // debitar o ciclo inteiro (R$ 540 em vez de R$ 45), sem aviso nenhum na tela.
  // Agora o corpo do PATCH leva so o que ficou de fato diferente da base.
  const camposMudados = () => Object.keys(tocadoP.current).filter((k) => {
    if (k === "valor_mensal") {
      // PLANO ANTIGO (coluna valor_mensal NULL): a base deste campo nao e a
      // coluna, e um valor DERIVADO — valorMensalDoPlano le valor_vigente
      // justamente porque a coluna esta vazia. Comparar contra ele filtrava
      // fora o unico caminho de migracao que a tela oferece: o usuario
      // confirmava os R$ 45 que o paragrafo pede para confirmar, o corpo saia
      // sem valor_mensal, a coluna continuava NULL para sempre e a tela
      // respondia "✓ salvo · ✓ conferido". Em plano antigo, mexer no campo de
      // dinheiro JA E a declaracao do preco mensal — vai para o servidor.
      // (mexeu e apagou? entra como mudanca e a validacao abaixo recusa com
      // mensagem — melhor que sumir em silencio.)
      if (legadoRef.current) return true;
      return dinheiro(p.valor_mensal) !== dinheiro(pBase.valor_mensal);
    }
    if (k === "lavagens_por_ciclo") return Number(p[k]) !== Number((pBase as any)[k]);
    return p[k] !== (pBase as any)[k];
  });

  // CICLO NA TELA — o que o campo "Cobranca do ciclo" pode afirmar sem mentir.
  //
  // Em plano ANTIGO (valor_mensal NULL no banco) o unico numero confiavel e o
  // valor_vigente gravado, e nem se sabe se ele e mensal ou do ciclo (decisao
  // pendente em migrations/0027_DECISAO_valor_vigente_diagnostico.sql). Trocar
  // so o periodo de mensal para anual fazia a tela anunciar "R$ 540,00" de
  // ciclo enquanto o cabecalho da linha e a Gestao continuavam em R$ 45 — e o
  // servidor, corretamente, nao muda dinheiro nenhum nesse caso. Enquanto o
  // valor nao for editado, um plano antigo mostra o valor GRAVADO, como esta.
  const mensalNum = numeroBR(p.valor_mensal);
  const meses = (MESES[p.cadencia] || 0) > 0 ? MESES[p.cadencia] : 1;
  const legado = !!plano && plano.valor_mensal == null;
  const legadoRef = useRef(legado);
  legadoRef.current = legado;
  const dinheiroIntacto = dinheiro(p.valor_mensal) === dinheiro(pBase.valor_mensal);
  // O PRODUTO TAMBEM PRECISA DO ARREDONDAMENTO DO SERVIDOR. Faltava aqui: com
  // mensal "57,205" a rota grava 57,21 (Math.round) e a tela anunciava
  // R$ 57.20 (toFixed corta) — um centavo de diferenca entre o que a tela
  // promete e o que o banco cobra, na linha em negrito.
  const valorCiclo: number | null = legado && dinheiroIntacto
    ? (plano?.valor_vigente == null ? null : Math.round(Number(plano.valor_vigente) * 100) / 100)
    : (isFinite(mensalNum) ? Math.round(mensalNum * meses * 100) / 100 : null);

  useEffect(() => {
    if (!aberto || quadras.length) return;
    fetch("/api/quadras").then((x) => x.json()).then((r) => r.ok && setQuadras(r.quadras)).catch(() => {});
  }, [aberto, quadras.length]);

  const linkPortal = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/t/${token}`
    : "";

  // gravar() é o que a barra "Salvar tudo" chama: grava e devolve se deu certo,
  // sem alert nem recarregar (a barra cuida disso uma vez, no fim).
  async function gravar(): Promise<boolean> {
    // valida antes de mandar: campo numérico apagado não pode virar 0 no banco,
    // e data de memória sem sentido não pode ser gravada pela metade
    // DATA TORTA QUE JA ESTAVA NO BANCO NAO TRAVA O SALVAR DO RESTO. A rota
    // antiga gravava "-1998" com um slice cego; a validacao nova cobrava o
    // campo inteiro, tocado ou nao, entao um jazigo com essa heranca ficava
    // impossivel de salvar — mexer no valor mensal devolvia "data de memoria:
    // use MM-DD" para um campo que o usuario nao abriu. Agora so o que ELE
    // digitou e cobrado; o lixo herdado sai do corpo (a rota o rejeitaria com
    // 400) e a tela avisa que ele sera limpo, em vez de bloquear tudo.
    const dataFal = normalizarMMDD(f.data_falecimento);
    const dataNas = normalizarMMDD(f.data_nascimento);
    if ((dataFal === null && f.data_falecimento !== fBase.data_falecimento)
        || (dataNas === null && f.data_nascimento !== fBase.data_nascimento)) {
      setErro("data de memória: use MM-DD (ex.: 07-23)");
      return false;
    }
    const mudados = plano ? camposMudados() : [];
    if (mudados.includes("valor_mensal") && !isFinite(numeroBR(p.valor_mensal))) {
      setErro("valor mensal: use numeros, ex. 40,50");
      return false;
    }
    // o formulário passa a mostrar o que o banco vai guardar
    const fn = { ...f, data_falecimento: dataFal ?? "", data_nascimento: dataNas ?? "" };
    if (fCmp(fn) !== fCmp(f)) setF(fn);

    setSalvando(true);
    setErro("");
    const a = await fetch(`/api/tumulos/${t.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fn),
    }).then((x) => x.json()).catch(() => null);
    // so os campos tocados; "migrado" so na PRIMEIRA conferencia (o servidor
    // tambem protege, mas nao ha por que mandar o que nao muda nada)
    const corpo: Record<string, any> = {};
    for (const k of mudados) {
      corpo[k] = k === "valor_mensal" ? numeroBR(p.valor_mensal) : p[k];
    }
    if (!plano?.migrado_em) corpo.migrado = true;
    // o que foi realmente enviado, para comparar na volta
    const enviado: Record<string, any> = { ...p };
    const b = plano && Object.keys(corpo).length
      ? await fetch(`/api/planos/${plano.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        }).then((x) => x.json()).catch(() => null)
      : { ok: true };
    if (b?.ok) {
      // DIGITACAO DURANTE O SALVAMENTO. O PATCH leva tempo — e "Salvar tudo"
      // grava um jazigo por vez, segundos — enquanto os campos continuam
      // editaveis. Zerar tocadoP inteiro apagava a marca do que foi digitado no
      // meio do voo: o Salvar seguinte montava corpo vazio, nem chamava o PATCH
      // e devolvia "✓ salvo" em verde para sempre, com a tela mostrando R$ 500
      // e o banco em R$ 45 — so um F5 revelava. Agora e desmarcado apenas o
      // campo que ainda esta igual ao que acabou de ser enviado; o que mudou
      // depois continua pendente e vai no proximo Salvar.
      const atual = pRef.current;
      const igualAoEnviado = (k: string) => k === "valor_mensal"
        ? dinheiro(atual.valor_mensal) === dinheiro(enviado.valor_mensal)
        : atual[k] === enviado[k];
      for (const k of mudados) if (igualAoEnviado(k)) delete tocadoP.current[k];
      // o campo passa a mostrar o que o banco guardou (2 casas, arredondadas do
      // mesmo jeito) — igual ao que ja e feito com as datas logo acima. So se o
      // texto ainda for o que foi enviado: normalizar por cima de "500" digitado
      // no meio do voo trocava o numero do usuario por "45,00".
      const n = numeroBR(atual.valor_mensal);
      const norm = isFinite(n) ? dinheiroBR(Math.round(n * 100) / 100) : "";
      if (isFinite(n) && norm !== atual.valor_mensal && igualAoEnviado("valor_mensal")) {
        setP((v) => ({ ...v, valor_mensal: norm }));
      }
    }
    setSalvando(false);
    if (a?.ok && b?.ok) { setOk(true); setTimeout(() => setOk(false), 2000); return true; }
    setErro(String(a?.erro || b?.erro || "não consegui salvar"));
    return false;
  }

  async function salvar() {
    const deu = await gravar();
    if (deu) onSalvo();
  }

  // ABRIR/FECHAR NAO ERA CANCELAR. "Fechar" so escondia o formulario: f, p e as
  // flags de tocado continuavam vivos, entao uma edicao ABANDONADA aqui era
  // gravada depois pela barra "Salvar tudo" — inclusive dinheiro — e o erro de
  // validacao, que so renderiza dentro do bloco aberto, ficava invisivel.
  // Agora abrir zera o formulario com o dado do banco e fechar sujo pergunta.
  function alternarAberto() {
    // "DESCARTAR" NO MEIO DO SALVAMENTO ERA MENTIRA: o corpo do PATCH ja tinha
    // sido montado e a requisicao estava no ar, entao o valor "descartado" era
    // gravado alguns instantes depois. Enquanto grava, nao ha o que descartar.
    if (salvando) return;
    if (aberto && alterado && !confirm("Você tem alterações não salvas neste jazigo. Descartar?")) return;
    setF(fBase);
    setP(pBase);
    tocadoP.current = {};
    setErro("");
    setAberto(!aberto);
  }

  usarPendencia(
    registrar, `tumulo:${t.id}`,
    `jazigo ${f.identificacao || t.identificacao || "sem identificação"}`,
    alterado, gravar,
  );

  async function subirFoto(tipo: "enquadramento" | "referencia", arq: File) {
    setFotoIndo(true);
    setFotoMsg("Preparando a foto...");
    try {
      // Reduz no navegador antes de subir — foto de celular estourava o limite
      // de tamanho do servidor e falhava sem dizer por que.
      const foto = await prepararFoto(arq);
      setFotoMsg(`Enviando ${foto.kb} KB...`);
      const resp = await fetch(`/api/tumulos/${t.id}/foto-referencia`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64: foto.b64, mimetype: foto.mt, tipo }),
      });
      const j = await resp.json().catch(() => null);
      if (resp.ok && j?.ok) { setFotoMsg(""); setFotoIndo(false); onSalvo(); return; }
      setFotoMsg(`Não subiu: ${j?.erro || `o servidor respondeu ${resp.status}`}`);
    } catch (e) {
      setFotoMsg(`Não subiu: ${motivoFalha(e)}`);
    }
    setFotoIndo(false);
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
        <button style={painel.botaoMiniSec} onClick={() => alternarAberto()} disabled={salvando}>
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
                   onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) subirFoto("enquadramento", f); }} />
            <input ref={refRef} type="file" accept="image/*" hidden
                   onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) subirFoto("referencia", f); }} />
            <input ref={refEnqCam} type="file" accept="image/*" capture="environment" hidden
                   onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) subirFoto("enquadramento", f); }} />
            <input ref={refRefCam} type="file" accept="image/*" capture="environment" hidden
                   onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) subirFoto("referencia", f); }} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ textAlign: "center" }}>
                {t.foto_enquadramento_url
                  ? <img src={t.foto_enquadramento_url} alt="de longe" style={miniFoto} />
                  : <div style={{ ...miniFoto, ...semFoto }}>sem foto</div>}
                <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6 }}>
                  <button style={painel.botaoMini} disabled={fotoIndo}
                          onClick={() => refEnqCam.current?.click()}>📷 Tirar foto</button>
                  <button style={painel.botaoMiniSec} disabled={fotoIndo}
                          onClick={() => refEnq.current?.click()}>Galeria</button>
                </div>
                <div style={{ fontSize: 13, color: cor.cinza }}>foto de longe</div>
              </div>
              <div style={{ textAlign: "center" }}>
                {t.foto_referencia_url
                  ? <img src={t.foto_referencia_url} alt="lápide" style={miniFoto} />
                  : <div style={{ ...miniFoto, ...semFoto }}>sem foto</div>}
                <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 6 }}>
                  <button style={painel.botaoMini} disabled={fotoIndo}
                          onClick={() => refRefCam.current?.click()}>📷 Tirar foto</button>
                  <button style={painel.botaoMiniSec} disabled={fotoIndo}
                          onClick={() => refRef.current?.click()}>Galeria</button>
                </div>
                <div style={{ fontSize: 13, color: cor.cinza }}>close da lápide</div>
              </div>
            </div>
            {fotoMsg && (
              <p style={{ fontSize: 15, margin: "8px 0 0",
                          color: fotoIndo ? cor.cinza : "#b91c1c" }}>{fotoMsg}</p>
            )}
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
            {dataTorta && (
              <p style={{ color: "#b45309", fontSize: 14, margin: "8px 0 0" }}>
                Uma data acima está gravada em formato que o sistema não entende (herança da
                importação antiga). Ela <b>não</b> dispara mensagem nenhuma e vai ser limpa no
                próximo Salvar — corrija para MM-DD se souber o dia.
              </p>
            )}
          </div>

          {/* ---------------- PLANO E MIGRAÇÃO ---------------- */}
          {!plano && <CriarPlano tumuloId={t.id} onSalvo={onSalvo} />}
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
                      onClick={() => mudarP({ cadencia: a.cadencia, lavagens_por_ciclo: a.lavagens })}>
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
                          onChange={(e) => mudarP({ cadencia: e.target.value })}>
                    {["mensal","bimestral","trimestral","semestral","anual","avulso"].map((c) =>
                      <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {p.cadencia !== "avulso" && (
                  <div>
                    <label style={painel.rotulo}>Lavagens no período</label>
                    <select style={{ ...painel.input, width: 110 }} value={p.lavagens_por_ciclo}
                            onChange={(e) => mudarP({ lavagens_por_ciclo: Number(e.target.value) })}>
                      {[1,2,3,4,6,8,12].map((n) => <option key={n} value={n}>{n}x</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label style={painel.rotulo}>Valor mensal (R$)</label>
                  <input type="text" inputMode="decimal" placeholder="0,00"
                         style={{ ...painel.input, width: 110 }} value={p.valor_mensal}
                         onChange={(e) => mudarP({ valor_mensal: e.target.value.replace(/[^\d.,]/g, "") })} />
                </div>
                <div>
                  <label style={painel.rotulo}>{legado && dinheiroIntacto ? "Valor gravado" : "Cobrança do ciclo"}</label>
                  <div style={{ ...painel.input, width: 120, background: "#f8fafc", fontWeight: 700 }}>
                    {valorCiclo == null ? "—" : `R$ ${valorCiclo.toFixed(2)}`}
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 12 }}>
                  <input type="checkbox" checked={p.ativo}
                         onChange={(e) => mudarP({ ativo: e.target.checked })} />
                  Ativo
                </label>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <div>
                  <label style={painel.rotulo}>Pago até</label>
                  <input type="date" style={{ ...painel.input, width: 160 }} value={p.pago_ate}
                         onChange={(e) => mudarP({ pago_ate: e.target.value })} />
                </div>
                <div>
                  <label style={painel.rotulo}>Próxima lavagem</label>
                  <input type="date" style={{ ...painel.input, width: 160 }} value={p.proximo_servico}
                         onChange={(e) => mudarP({ proximo_servico: e.target.value })} />
                </div>
                <div>
                  <label style={painel.rotulo}>Quando cobrar</label>
                  <select style={{ ...painel.input, width: 210 }} value={p.momento_cobranca}
                          onChange={(e) => mudarP({ momento_cobranca: e.target.value })}>
                    <option value="depois">Depois da lavagem (padrão)</option>
                    <option value="antes">Antes — paga para a gente ir</option>
                    <option value="contra_foto">Contra a foto — cobra ao entregar</option>
                  </select>
                </div>
                <div>
                  <label style={painel.rotulo}>Próxima cobrança</label>
                  <input type="date" style={{ ...painel.input, width: 160 }} value={p.proxima_cobranca}
                         onChange={(e) => mudarP({ proxima_cobranca: e.target.value })} />
                </div>
              </div>
              {legado && dinheiroIntacto && (
                <p style={{ color: cor.cinza, fontSize: 14, margin: "8px 0 0" }}>
                  Este plano veio da importação sem valor mensal separado: o que está gravado é
                  R$ {plano?.valor_vigente == null ? "—" : (Math.round(Number(plano.valor_vigente) * 100) / 100).toFixed(2)}.
                  Mudar só o período <b>não</b> muda esse valor. Para o sistema passar a calcular
                  o ciclo, digite o valor mensal no campo acima e salve
                  {meses > 1 && <> — atenção: a cobrança do ciclo passa a ser
                  o mensal × {meses} meses, e é esse número que vai ser cobrado</>}.
                </p>
              )}
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
            <button style={alterado ? painel.botao : painel.botaoSec} onClick={salvar}
                    disabled={salvando || !alterado}>
              {salvando ? "Salvando…" : alterado ? "Salvar jazigo" : "Sem alterações"}
            </button>
            {ok && <span style={{ color: cor.teal }}>✓ salvo</span>}
            {erro && <span style={{ color: "#dc2626", fontSize: 14 }}>{erro}</span>}
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
  cliente: any; onSalvo: () => void; registrar?: Registrar;
}) {
  const [f, setF] = useState<Record<string, any>>({
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
  const [erro, setErro] = useState("");

  // o que está no banco agora (vem por prop e é recarregado depois de salvar) —
  // é a única referência de "sujo", para o aviso não ficar preso depois de gravar
  const original = JSON.stringify({
    tratamento: cliente.tratamento || "", regua_cobranca: cliente.regua_cobranca || "padrao",
    dias_entre_cobrancas: cliente.dias_entre_cobrancas ?? 7, max_lembretes: cliente.max_lembretes ?? 3,
    orientacao_cobranca: cliente.orientacao_cobranca || "", ativacao_ativa: !!cliente.ativacao_ativa,
    ativacao_meses: cliente.ativacao_meses ?? 6, cobranca_antecipada: !!cliente.cobranca_antecipada,
  });

  const alterado = JSON.stringify(f) !== original;

  async function gravar(): Promise<boolean> {
    // campo numérico apagado ("") não pode virar 0 — 0 dia entre lembretes ou
    // 0 lembrete muda o comportamento da IA sem o usuário ter pedido
    const numericos: [string, string][] = [
      ["dias_entre_cobrancas", "dias entre lembretes"],
      ["max_lembretes", "máximo de lembretes"],
      ["ativacao_meses", "meses entre convites"],
    ];
    for (const [campo, nome] of numericos) {
      if (f[campo] === "" || !isFinite(Number(f[campo]))) { setErro(`preencha ${nome}`); return false; }
    }
    setSalvando(true);
    setErro("");
    const r = await fetch(`/api/clientes/${cliente.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (r?.ok) { setOk(true); setTimeout(() => setOk(false), 2000); return true; }
    setErro(String(r?.erro || "não consegui salvar"));
    return false;
  }

  usarPendencia(registrar, "regua", "como a IA trata esta família", alterado, gravar);

  async function salvar() {
    const deu = await gravar();
    if (deu) onSalvo();
  }

  const explica: Record<string, string> = {
    suave: "Um único lembrete, bem gentil. Se não responder, a IA para e avisa você.",
    padrao: "Até três lembretes espaçados e acolhedores.",
    firme: "Até três lembretes mais objetivos, ainda respeitosos.",
    nao_cobrar: "A IA NUNCA cobra esta família. Se falarem de valores, encaminha para você.",
  };

  return (
    <div style={painel.card}>
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
                     onChange={(e) => setF({ ...f, dias_entre_cobrancas: e.target.value === "" ? "" : Number(e.target.value) })} />
            </div>
            {f.regua_cobranca !== "suave" && (
              <div>
                <label style={painel.rotulo}>Máx. de lembretes</label>
                <input type="number" style={{ ...painel.input, width: 100 }} value={f.max_lembretes}
                       onChange={(e) => setF({ ...f, max_lembretes: e.target.value === "" ? "" : Number(e.target.value) })} />
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
                   onChange={(e) => setF({ ...f, ativacao_meses: e.target.value === "" ? "" : Number(e.target.value) })} />
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

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
        <button style={alterado ? painel.botao : painel.botaoSec} onClick={salvar}
                disabled={salvando || !alterado}>
          {salvando ? "Salvando…" : alterado ? "Salvar" : "Sem alterações"}
        </button>
        {ok && <span style={{ color: cor.teal }}>✓ salvo</span>}
        {erro && <span style={{ color: "#dc2626", fontSize: 14 }}>{erro}</span>}
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
  c: any; onSalvo: () => void; registrar?: Registrar;
}) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ nome: c.nome || "", apelido: c.apelido || "", telefone: c.telefone || "" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [fotoErro, setFotoErro] = useState("");
  const refFoto = useRef<HTMLInputElement>(null);
  const refFotoCam = useRef<HTMLInputElement>(null);

  const mudou = f.nome !== (c.nome || "") || f.apelido !== (c.apelido || "")
    || f.telefone !== (c.telefone || "");

  async function gravar(): Promise<boolean> {
    if (!f.nome.trim()) { setErro("o nome não pode ficar em branco"); return false; }
    setSalvando(true);
    setErro("");
    const r = await fetch(`/api/clientes/${c.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (r?.ok) { setEditando(false); return true; }
    setErro(String(r?.erro || "não consegui salvar"));
    return false;
  }

  usarPendencia(registrar, "identificacao", "dados da família", mudou && editando, gravar);

  async function salvar() {
    const deu = await gravar();
    if (deu) onSalvo();
  }

  async function enviarFoto(arq: File) {
    setEnviandoFoto(true);
    setFotoErro("");
    try {
      // Reduz antes de subir: retrato de celular passava do limite do servidor.
      const foto = await prepararFoto(arq, 900);
      const resp = await fetch(`/api/clientes/${c.id}/foto`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64: foto.b64, mimetype: foto.mt }),
      });
      const j = await resp.json().catch(() => null);
      setEnviandoFoto(false);
      if (resp.ok && j?.ok) { onSalvo(); return; }
      setFotoErro(String(j?.erro || `o servidor respondeu ${resp.status}`));
    } catch (e) {
      setEnviandoFoto(false);
      setFotoErro(motivoFalha(e));
    }
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
             onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) enviarFoto(f); }} />
      <input ref={refFotoCam} type="file" accept="image/*" capture="environment" hidden
             onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) enviarFoto(f); }} />

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
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 6 }}>
          <button style={{ background: "none", border: "none", color: cor.teal, fontSize: 14,
                           cursor: "pointer", textDecoration: "underline" }}
                  onClick={() => refFotoCam.current?.click()} disabled={enviandoFoto}>
            📷 tirar
          </button>
          <button style={{ background: "none", border: "none", color: cor.cinza, fontSize: 14,
                           cursor: "pointer", textDecoration: "underline" }}
                  onClick={() => (c.foto_url ? tirarFoto() : refFoto.current?.click())}
                  disabled={enviandoFoto}>
            {enviandoFoto ? "enviando…" : c.foto_url ? "remover" : "galeria"}
          </button>
        </div>
        {fotoErro && (
          <p style={{ color: "#b91c1c", fontSize: 13, margin: "4px 0 0", maxWidth: 140 }}>{fotoErro}</p>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 240 }}>
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
            <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button style={painel.botao} onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar"}
              </button>
              <button style={painel.botaoSec} onClick={() => {
                setF({ nome: c.nome || "", apelido: c.apelido || "", telefone: c.telefone || "" });
                setErro("");
                setEditando(false);
              }}>Cancelar</button>
              {erro && <span style={{ color: "#dc2626", fontSize: 14 }}>{erro}</span>}
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
            <button style={{ ...painel.botaoMiniSec, marginTop: 10 }}
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
 * BARRA DE SALVAR — a ficha tem vários blocos e cada um tem o próprio botão.
 * Isso obrigaria a pessoa a lembrar de salvar em três lugares, e uma edição
 * esquecida se perderia. A barra avisa quando há mudança pendente, DIZ QUAL é
 * e salva todas de uma vez.
 *
 * Ela apenas exibe: quem sabe o que está pendente é o registro de pendências da
 * ficha (ver `usarPendencia` no topo). Antes isso era descoberto varrendo o DOM
 * a cada 800 ms e salvo com clique simulado + espera de 400 ms por bloco — o que
 * podia salvar fora de ordem, perder erro e mentir na contagem.
 */
function BarraSalvar({ pendencias, salvando, onSalvarTudo }: {
  pendencias: Record<string, Pendencia>;
  salvando: boolean;
  onSalvarTudo: () => void;
}) {
  const rotulos = Object.values(pendencias).map((p) => p.rotulo);
  if (!rotulos.length) return null;

  return (
    <div style={{
      position: "sticky", bottom: 0, zIndex: 20, marginTop: 8,
      background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12,
      padding: 14, display: "flex", gap: 12, alignItems: "center",
      justifyContent: "space-between", flexWrap: "wrap",
      boxShadow: "0 -4px 16px rgba(0,0,0,.06)",
    }}>
      <span style={{ color: "#92400e", fontSize: 15 }}>
        {rotulos.length === 1 ? "Alteração não salva em " : `${rotulos.length} alterações não salvas: `}
        <b>{rotulos.join(", ")}</b>
      </span>
      <button style={painel.botao} onClick={onSalvarTudo} disabled={salvando}>
        {salvando ? "Salvando…" : rotulos.length === 1 ? "Salvar" : "Salvar tudo"}
      </button>
    </div>
  );
}

/**
 * Criar plano para um jazigo que ainda não tem (ex.: capturado no campo).
 * Autocontido: faz o próprio POST e chama onSalvo — não passa pela BarraSalvar.
 */
function CriarPlano({ tumuloId, onSalvo }: { tumuloId: string; onSalvo: () => void }) {
  const [atalho, setAtalho] = useState(2); // "Uma vez por mes"
  // dinheiro como TEXTO: em pt-BR o campo number recusa virgula em parte dos
  // teclados e "40,50" chegava vazio. numeroBR devolve NaN quando nao entende,
  // e NaN vira recusa na tela em vez de um valor errado gravado.
  const [valor, setValor] = useState("");
  const [inicio, setInicio] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function criar() {
    const a = ATALHOS_FREQUENCIA[atalho];
    const n = numeroBR(valor);
    // vale para TODA cadencia, inclusive "avulso": o valor ilegivel virava NaN,
    // NaN virava null no JSON e a API antiga gravava 40 sem avisar ninguem.
    if (!isFinite(n) || n <= 0) {
      setErro("Digite o valor mensal como 40 ou 40,50 (sem R$ e sem separador de milhar).");
      return;
    }
    setErro(null);
    setSalvando(true);
    const r = await fetch("/api/planos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tumuloId, cadencia: a.cadencia, lavagensPorCiclo: a.lavagens,
        valorMensal: Math.round(n * 100) / 100, inicio: inicio || undefined,
      }),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (!r?.ok) { setErro("Nao consegui criar o plano: " + (r?.erro || "erro")); return; }
    if (r.jaExistia) {
      // ok:true com jaExistia NAO e plano criado. Como a ficha lista planos por
      // familia e a checagem da API e por jazigo, um plano preso a outra familia
      // some da tela: sem este aviso o operador clicava para sempre.
      setErro("Este jazigo ja tem um plano no sistema, ligado a outra familia. Abra Planos para corrigir o vinculo — nada foi criado agora.");
      return;
    }
    onSalvo();
  }

  return (
    <div style={{ ...bloco, background: "#eff6ff", borderColor: "#bfdbfe" }}>
      <div style={blocoTitulo}>Este jazigo ainda não tem plano</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={painel.rotulo}>Frequência</label>
          <select style={painel.input} value={atalho} onChange={(e) => setAtalho(Number(e.target.value))}>
            {ATALHOS_FREQUENCIA.map((a, i) => <option key={i} value={i}>{a.rotulo}</option>)}
          </select>
        </div>
        <div>
          <label style={painel.rotulo}>Valor mensal</label>
          <input type="text" inputMode="decimal" placeholder="40,00"
                 style={{ ...painel.input, width: 110 }} value={valor}
                 onChange={(e) => setValor(e.target.value)} />
        </div>
        <div>
          <label style={painel.rotulo}>1ª lavagem</label>
          <input type="date" style={{ ...painel.input, width: 160 }} value={inicio}
                 onChange={(e) => setInicio(e.target.value)} />
        </div>
        <button style={painel.botao} onClick={criar} disabled={salvando}>
          {salvando ? "Criando…" : "Criar plano"}
        </button>
      </div>
      {erro && <p style={{ color: "#b91c1c", fontSize: 14, margin: "10px 0 0" }}>{erro}</p>}
      <p style={{ fontSize: 13, color: cor.cinza, margin: "8px 0 0" }}>
        A proxima lavagem e a proxima cobranca ja entram na data escolhida (ou hoje).
      </p>
    </div>
  );
}

/**
 * ADICIONAR TÚMULO a uma família já cadastrada.
 *
 * O bloco que faltava. Antes existia só "Vincular jazigo do campo", e ele
 * começava com `if (!orfaos.length) return null` — ou seja: quem não tinha
 * jazigo órfão capturado no campo não via NADA na ficha e não tinha como
 * incluir um túmulo numa família já cadastrada. Só dava para cadastrar jazigo
 * no momento de criar a família, uma vez, e nunca mais.
 *
 * Agora o botão está SEMPRE na tela, com dois caminhos:
 *   · Novo jazigo   — digita identificação/quadra/rua (cria a quadra se faltar);
 *   · Do campo      — escolhe um dos capturados sem dono (só se houver).
 * O plano é opcional no mesmo formulário: quem já sabe a periodicidade e o
 * valor resolve tudo numa tela; quem não sabe deixa "Definir depois" e o
 * jazigo entra sem plano (o bloco "Criar plano" continua aparecendo nele).
 *
 * Autocontido: faz o próprio POST e chama onMudou — não passa pela barra de
 * salvar (é criação, não edição pendente).
 */
function AdicionarTumulo({
  clienteId, vazio, onMudou,
}: { clienteId: string; vazio: boolean; onMudou: () => void }) {
  const [aberto, setAberto] = useState(vazio);
  const [modo, setModo] = useState<"novo" | "campo">("novo");
  const [orfaos, setOrfaos] = useState<any[]>([]);
  const [cemiterios, setCemiterios] = useState<any[]>([]);
  const [cemId, setCemId] = useState("");

  const [identificacao, setIdentificacao] = useState("");
  const [quadra, setQuadra] = useState("");
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [falecido, setFalecido] = useState("");
  const [escolha, setEscolha] = useState("");

  const [atalho, setAtalho] = useState<string>(""); // "" = definir depois
  const [valor, setValor] = useState("");
  const [inicio, setInicio] = useState("");

  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // aviso NAO e erro: o jazigo entrou, so tem uma ressalva a contar. Pintar isso
  // de vermelho fazia o operador achar que a inclusao falhou e tentar de novo.
  const [aviso, setAviso] = useState<string | null>(null);

  async function carregarOpcoes() {
    const r = await fetch("/api/tumulos").then((x) => x.json()).catch(() => null);
    if (!r?.ok) return;
    setOrfaos(r.semDono || []);
    setCemiterios(r.cemiterios || []);
    if (!cemId && (r.cemiterios || []).length) setCemId(r.cemiterios[0].id);
  }
  useEffect(() => { carregarOpcoes(); }, []);

  // códigos de quadra para o autocompletar (do cemitério escolhido, ou de todos)
  const quadrasSugeridas: string[] = [];
  for (const c of cemiterios) {
    if (cemId && c.id !== cemId) continue;
    for (const q of c.quadras || []) if (!quadrasSugeridas.includes(q.codigo)) quadrasSugeridas.push(q.codigo);
  }

  // So os campos. `erro` e `aviso` sao limpos por quem chama, no momento certo:
  // depois de uma inclusao com ressalva, o formulario limpa E a caixa ambar fica.
  function limpar() {
    setIdentificacao(""); setQuadra(""); setRua(""); setNumero("");
    setFalecido(""); setEscolha(""); setAtalho(""); setValor(""); setInicio("");
  }

  async function salvar() {
    setErro(null);
    setAviso(null);

    const corpo: Record<string, any> = {};
    if (modo === "campo") {
      if (!escolha) { setErro("Escolha um jazigo da lista."); return; }
      corpo.vincularTumuloId = escolha;
    } else {
      if (!identificacao.trim()) { setErro("Falta a identificação do jazigo (lote/número)."); return; }
      corpo.identificacao = identificacao.trim();
      corpo.quadraCodigo = quadra.trim() || null;
      corpo.cemiterioId = cemId || null;
    }
    if (rua.trim()) corpo.rua = rua.trim();
    if (numero.trim()) corpo.numero = numero.trim();
    if (falecido.trim()) corpo.falecidoNome = falecido.trim();

    if (atalho !== "") {
      const a = ATALHOS_FREQUENCIA[Number(atalho)];
      if (a.cadencia !== "avulso") {
        // dinheiro em pt-BR: numeroBR devolve NaN em vez de 0 quando não entende,
        // então valor ilegível vira recusa na tela e não honorário errado no banco.
        const n = numeroBR(valor);
        if (!isFinite(n) || n <= 0) {
          setErro("Digite o valor mensal como 40 ou 40,50 (sem R$ e sem separador de milhar).");
          return;
        }
        corpo.plano = {
          cadencia: a.cadencia,
          lavagensPorCiclo: a.lavagens,
          valorMensal: Math.round(n * 100) / 100,
          inicio: inicio || null,
        };
      }
    }

    setOcupado(true);
    const r = await fetch(`/api/clientes/${clienteId}/tumulos`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);

    if (!r?.ok) { setErro(r?.mensagem || r?.erro || "Não consegui salvar. Tente de novo."); return; }

    // O que a API fez de fato — a tela nunca diz "pronto" para algo que não
    // aconteceu. Reaproveitado = esse jazigo JÁ era desta família (digitação
    // repetida); planoCriado false com plano pedido = o jazigo já tinha plano.
    const avisos: string[] = [];
    if (r.reaproveitado) avisos.push("Esse jazigo já era desta família — nada de novo foi criado, só atualizei os dados que você preencheu.");
    if (r.avisoPlano) avisos.push("O plano não foi criado: " + r.avisoPlano);
    else if (corpo.plano && !r.planoCriado) avisos.push("Esse jazigo já tinha um plano — mantive o que existe. Se ele não aparecer aqui embaixo, o plano está ligado a outra família: veja em Planos.");

    limpar();
    setAviso(avisos.length ? avisos.join(" ") : null);
    setAberto(false);
    carregarOpcoes();
    onMudou();
  }

  const caixaAviso = aviso ? (
    <p style={{
      background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e",
      fontSize: 14, borderRadius: 8, padding: "8px 10px", margin: "10px 0 0",
    }}>{aviso}</p>
  ) : null;

  if (!aberto) {
    // Botão PRIMÁRIO e de largura cheia de propósito: ele já existia como
    // botão secundário e passou despercebido duas vezes. É a única porta para
    // incluir jazigo numa família já cadastrada — não pode parecer detalhe.
    return (
      <div style={{ marginTop: 14, borderTop: `1px solid ${cor.linha}`, paddingTop: 14 }}>
        <button style={{ ...painel.botao, width: "100%" }}
                onClick={() => { setErro(null); setAviso(null); setAberto(true); }}>
          + Adicionar túmulo / jazigo
        </button>
        <p style={{ color: cor.cinza, fontSize: 13, margin: "6px 0 0" }}>
          Cadastre um jazigo novo ou puxe um que a equipe capturou no campo.
        </p>
        {caixaAviso}
      </div>
    );
  }

  const cadenciaEscolhida = atalho !== "" ? ATALHOS_FREQUENCIA[Number(atalho)]?.cadencia : null;
  const rotuloValor = !!cadenciaEscolhida && cadenciaEscolhida !== "avulso";
  // "So quando pedirem" (avulso) nao tem periodicidade nem vencimento: aqui ele
  // nao cria plano nenhum. Antes a opcao existia e nao fazia nada, calada.
  const avulsoEscolhido = cadenciaEscolhida === "avulso";

  return (
    <div style={{ ...bloco, marginTop: 12, background: "#f0fdfa", borderColor: "#99f6e4" }}>
      <div style={blocoTitulo}>Adicionar túmulo a esta família</div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <button style={modo === "novo" ? painel.botaoMini : painel.botaoMiniSec}
                onClick={() => { setModo("novo"); setErro(null); setEscolha(""); }}>
          Novo jazigo
        </button>
        <button style={modo === "campo" ? painel.botaoMini : painel.botaoMiniSec}
                onClick={() => {
                  // rua/nº saem da tela ao trocar de modo — se ficassem no
                  // estado, sobrescreveriam a rua conferida no local pelo que
                  // foi digitado por engano no outro modo.
                  setModo("campo"); setErro(null);
                  setIdentificacao(""); setQuadra(""); setRua(""); setNumero("");
                }}
                disabled={!orfaos.length}
                title={orfaos.length ? "" : "Nenhum jazigo capturado no campo está sem família"}>
          Do campo ({orfaos.length})
        </button>
      </div>

      {modo === "campo" ? (
        <div style={{ marginBottom: 10 }}>
          <label style={painel.rotulo}>Jazigo sem família</label>
          <select style={painel.input} value={escolha} onChange={(e) => setEscolha(e.target.value)}>
            <option value="">— escolha —</option>
            {orfaos.map((t) => (
              <option key={t.id} value={t.id}>
                {[t.quadra, t.identificacao, t.rua].filter(Boolean).join(" · ")}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {cemiterios.length > 1 && (
            <div style={{ minWidth: 160 }}>
              <label style={painel.rotulo}>Cemitério</label>
              <select style={painel.input} value={cemId} onChange={(e) => setCemId(e.target.value)}>
                {cemiterios.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={painel.rotulo}>Identificação (lote/nº)</label>
            <input style={painel.input} value={identificacao} placeholder="ex.: 128"
                   onChange={(e) => setIdentificacao(e.target.value)} />
          </div>
          <div style={{ width: 130 }}>
            <label style={painel.rotulo}>Quadra</label>
            <input style={painel.input} value={quadra} list="quadras-ficha" placeholder="S/Q"
                   onChange={(e) => setQuadra(e.target.value)} />
            <datalist id="quadras-ficha">
              {quadrasSugeridas.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div style={{ width: 140 }}>
            <label style={painel.rotulo}>Rua</label>
            <input style={painel.input} value={rua} onChange={(e) => setRua(e.target.value)} />
          </div>
          <div style={{ width: 90 }}>
            <label style={painel.rotulo}>Nº</label>
            <input style={painel.input} value={numero} onChange={(e) => setNumero(e.target.value)} />
          </div>
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        <label style={painel.rotulo}>Falecido (opcional)</label>
        <input style={painel.input} value={falecido} onChange={(e) => setFalecido(e.target.value)} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 190 }}>
          <label style={painel.rotulo}>Plano (frequência)</label>
          <select style={painel.input} value={atalho} onChange={(e) => setAtalho(e.target.value)}>
            <option value="">Definir depois</option>
            {ATALHOS_FREQUENCIA.map((a, i) => <option key={i} value={String(i)}>{a.rotulo}</option>)}
          </select>
        </div>
        {rotuloValor && (
          <>
            <div>
              <label style={painel.rotulo}>Valor mensal</label>
              <input type="text" inputMode="decimal" placeholder="40,00"
                     style={{ ...painel.input, width: 110 }} value={valor}
                     onChange={(e) => setValor(e.target.value)} />
            </div>
            <div>
              <label style={painel.rotulo}>1ª lavagem</label>
              <input type="date" style={{ ...painel.input, width: 160 }} value={inicio}
                     onChange={(e) => setInicio(e.target.value)} />
            </div>
          </>
        )}
        <button style={painel.botao} onClick={salvar} disabled={ocupado}>
          {ocupado ? "Salvando…" : "Adicionar"}
        </button>
        <button style={painel.botaoSec}
                onClick={() => { limpar(); setErro(null); setAviso(null); setAberto(false); }}>Cancelar</button>
      </div>

      {erro && (
        <p style={{ color: "#b91c1c", fontSize: 14, margin: "10px 0 0" }}>{erro}</p>
      )}
      {caixaAviso}
      {avulsoEscolhido && (
        <p style={{ fontSize: 13, color: cor.cinza, margin: "8px 0 0" }}>
          “Só quando pedirem” não cria plano: o túmulo entra sem periodicidade e sem
          vencimento. Para registrar o preço por limpeza, use “Criar plano” no próprio
          jazigo depois de incluí-lo.
        </p>
      )}
      <p style={{ fontSize: 13, color: cor.cinza, margin: "8px 0 0" }}>
        Sem quadra? Deixe em branco e o jazigo entra em “S/Q”. Só use isso se a quadra
        for mesmo desconhecida: o sistema só reconhece dois registros como o mesmo túmulo
        quando estão na mesma quadra — o que está em “S/Q” pode virar cópia do que a
        equipe capturou no campo. Sem plano agora? Deixe “Definir depois”.
      </p>
    </div>
  );
}
