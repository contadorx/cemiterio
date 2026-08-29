"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { PainelNav, painel, cor } from "../../ui";
import { PedidosAdicionais, AnotarPedido } from "../../PedidosAdicionais";
import Compromissos from "../Compromissos";
import { useConfirmar, useRecado } from "@/components/Dialogos";

export default function Thread() {
  const recado = useRecado();
  const perguntar = useConfirmar();
  const params = useParams();
  const id = params?.id as string;
  const [d, setD] = useState<any>(null);
  const [texto, setTexto] = useState("");
  const [rascText, setRascText] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const [versaoPedidos, setVersaoPedidos] = useState(0);
  /** A sugestão da IA, e o que ela leu para escrever. */
  const [sugerindo, setSugerindo] = useState(false);
  const [leu, setLeu] = useState<number | null>(null);
  /** Quantas promessas desta conversa ainda estão em aberto (0142). */
  const [promessas, setPromessas] = useState(0);

  /**
   * SUGERIR RESPOSTA — a IA lê tudo e escreve uma proposta no campo.
   *
   * Não é o robô de volta. O robô respondia sozinho e foi desligado por um bom
   * motivo (D-12). Aqui a IA escreve NO CAMPO DE TEXTO e para por aí: quem lê,
   * corrige, apaga e envia é a pessoa.
   *
   * O que ela ganha com isso não é digitação, é MEMÓRIA: para responder bem é
   * preciso saber que esta família tem dois jazigos, que a última limpeza foi
   * há seis dias, que está R$ 80 adiantada e que a régua dela é "suave" — cinco
   * telas. A proposta chega com isso considerado.
   *
   * Substituir o que já está escrito exige confirmação: a frase que ela digitou
   * é dela, e uma sugestão que apaga o trabalho de alguém não é ajuda.
   */
  async function sugerir() {
    if (texto.trim() && !await perguntar({
      oQue: "Substituir o que você já escreveu pela sugestão da IA?",
      efeito: "O seu texto se perde. Se quiser guardar, copie antes.",
      confirmar: "Substituir", tom: "perigo",
    })) return;
    setSugerindo(true);
    setLeu(null);
    try {
      const r = await fetch(`/api/conversas/${id}/sugerir`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { recado.erro(r?.mensagem || "Não consegui sugerir agora. Escreva à mão."); return; }
      setTexto(r.texto);
      setLeu(Number(r.mensagensLidas) || 0);
    } finally { setSugerindo(false); }
  }

  async function carregar() {
    const r = await fetch(`/api/conversas/${id}`).then((x) => x.json());
    if (r.ok) {
      setD(r);
      setRascText(r.rascunho?.rascunho || "");
    }
    // As promessas em aberto vêm da MESMA rota que a caixa acima usa — uma
    // definição só de "em aberto", senão o aviso de finalizar discordaria da
    // caixa que está na tela dois centímetros acima.
    const p = await fetch(`/api/compromissos?conversa=${encodeURIComponent(id)}`)
      .then((x) => x.json()).catch(() => null);
    setPromessas(p?.ok ? (p.compromissos || []).length : 0);
  }
  useEffect(() => {
    if (id) carregar();
  }, [id]);
  useEffect(() => {
    fim.current?.scrollIntoView();
  }, [d]);

  async function enviar() {
    if (!texto.trim()) return;
    setOcupado(true);
    await fetch(`/api/conversas/${id}/enviar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
    setTexto("");
    setOcupado(false);
    carregar();
  }

  async function agirRascunho(acao: "aprovou" | "editou" | "descartou") {
    setOcupado(true);
    await fetch("/api/atendimento/aprovar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interacaoId: d.rascunho.id, acao, textoFinal: acao === "editou" ? rascText : undefined }),
    });
    setOcupado(false);
    carregar();
  }

  /**
   * FINALIZAR O ATENDIMENTO — de dentro da conversa.
   *
   * "Resolver" e "Arquivar" existiam só na LISTA. Mas o momento em que se sabe
   * que o assunto acabou é o momento em que se acabou de responder — e esse
   * momento acontece AQUI. Ter de voltar para a lista, achar a linha e agir de
   * fora é fricção no lugar exato onde ela custa mais: o que dá trabalho fica
   * para depois, e "depois" é como a fila de 164 mensagens nasceu.
   *
   * A CONVERSA VOLTA PARA A IA JUNTO. `resolver` já apaga `escalada_humano` no
   * banco; deixar a conversa resolvida E assumida seria dizer duas coisas
   * contrárias sobre a mesma linha.
   */
  async function finalizar() {
    // PROMESSA EM ABERTO É MOTIVO PARA PARAR E OLHAR.
    //
    // Fechar o atendimento com uma promessa pendente é exatamente o defeito que
    // a 0142 mediu: a família esperando um retorno que ninguém sabia que devia.
    // Não proíbe — às vezes a resposta acabou de sair pela fila —, mas não
    // deixa acontecer sem ver.
    const aviso = promessas > 0
      ? `Ainda há ${promessas === 1 ? "uma promessa em aberto" : `${promessas} promessas em aberto`} `
        + "nesta conversa. Se já respondeu, feche a promessa também — senão ela "
        + "continua cobrando você no “Precisa de você”."
      : "A conversa sai da fila de pendentes e volta para a IA. "
        + "Ela reabre sozinha se a família escrever de novo.";

    if (!await perguntar({
      oQue: "Finalizar o atendimento desta conversa?",
      efeito: aviso,
      confirmar: "Finalizar", tom: promessas > 0 ? "perigo" : "normal",
    })) return;

    setOcupado(true);
    try {
      const r = await fetch(`/api/conversas/${id}/acao`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "resolver" }),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { recado.erro(r?.erro || "Não consegui finalizar agora."); return; }
      carregar();
    } finally { setOcupado(false); }
  }

  async function reabrir() {
    setOcupado(true);
    try {
      await fetch(`/api/conversas/${id}/acao`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "reabrir" }),
      });
      carregar();
    } finally { setOcupado(false); }
  }

  async function alternarIa() {
    setOcupado(true);
    await fetch(`/api/conversas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ escalada_humano: !d.conversa.escalada }),
    });
    setOcupado(false);
    carregar();
  }

  if (!d) {
    return (
      <div style={painel.wrap}>
        <PainelNav atual="/painel/conversas" />
        <div style={painel.conteudo}><p style={{ color: cor.cinza }}>Carregando…</p></div>
      </div>
    );
  }

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/conversas" />
      <div style={painel.conteudo}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                      gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ ...painel.h1, marginRight: "auto" }}>{d.conversa.cliente}</h1>
          <button style={d.conversa.escalada ? painel.botao : painel.botaoSec} onClick={alternarIa} disabled={ocupado}>
            {d.conversa.escalada ? "Devolver para a IA" : "Assumir conversa"}
          </button>
          {/* FINALIZAR MORA AQUI, e não só na lista.
              O momento em que se sabe que o assunto acabou é o momento em que
              se acabou de responder — e esse momento acontece nesta tela. */}
          {d.conversa.resolvida
            ? <button style={painel.botaoSec} onClick={reabrir} disabled={ocupado}>
                Reabrir atendimento
              </button>
            : <button style={painel.botaoSec} onClick={finalizar} disabled={ocupado}>
                Finalizar atendimento
              </button>}
        </div>
        <p style={{ color: cor.cinza, marginTop: -10, fontSize: 14 }}>
          {d.conversa.resolvida
            ? "Atendimento finalizado — ela reabre sozinha se a família escrever de novo."
            : d.conversa.escalada ? "Você está atendendo — a IA não responde."
            : "A IA está atendendo (rascunhos aparecem aqui)."}
        </p>

        {/* O QUE VOCÊ PROMETEU E AINDA NÃO RESPONDEU (0142).
            Antes das mensagens, porque quem abre a conversa para responder
            precisa saber disso ANTES de escrever. */}
        <Compromissos key={`k${versaoPedidos}`} conversaId={id} />

        {/* pedido de servico adicional feito nesta conversa */}
        <PedidosAdicionais key={versaoPedidos} conversaId={id} />

        <div style={{ ...painel.card, maxHeight: 420, overflowY: "auto" }}>
          {d.mensagens.length === 0 && <p style={{ color: cor.cinza }}>Sem mensagens ainda.</p>}
          {(d.mensagens || []).map((m: any, i: number) => (
            <div key={i} style={{ margin: "8px 0", textAlign: m.autor === "cliente" ? "left" : "right" }}>
              <span style={{ display: "inline-block", maxWidth: "80%", padding: "8px 12px", borderRadius: 12, background: m.autor === "cliente" ? "#e2e8f0" : m.autor === "ia" ? "#0f766e" : "#1e293b", color: m.autor === "cliente" ? cor.navy : "#fff", fontSize: 14 }}>
                {m.transcrita && (
                <span style={{ display: "block", fontSize: 15, color: cor.cinza,
                               marginBottom: 4, fontStyle: "italic" }}>
                  🎤 áudio transcrito
                </span>
              )}
              {/* A IMAGEM QUE A FAMÍLIA MANDOU.
                  Ela era baixada, lida pelo leitor de comprovante e descartada
                  quando ele não a reconhecia — justamente quando alguém precisa
                  olhar. A Sureya lia "não parece um comprovante" e não tinha
                  como saber se era a foto do túmulo, um print de outro banco ou
                  uma dúvida escrita à mão. Tocar abre em tamanho cheio. */}
              {m.midia_url && (
                <a href={m.midia_url} target="_blank" rel="noreferrer"
                   style={{ display: "block", marginBottom: 6 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.midia_url} alt="imagem enviada pela família"
                       style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 10, display: "block" }} />
                </a>
              )}
              {/* NÃO CONSEGUI ABRIR ≠ NÃO TEM IMAGEM (0139).
                  O balde das conversas fechou, e a imagem passa a ser lida por
                  link que expira. Se ele não sair, calar faria a mensagem
                  parecer que a família nunca mandou foto — que é exatamente o
                  defeito que a 0134 consertou pela outra ponta. */}
              {m.midia_falhou && (
                <div style={{
                  marginBottom: 6, padding: "8px 10px", borderRadius: 10,
                  border: "1px solid rgb(var(--zm-aviso) / 0.4)",
                  background: "rgb(var(--zm-aviso) / 0.1)",
                  color: "rgb(var(--zm-aviso))", fontSize: 12.5, lineHeight: 1.45,
                }}>
                  A família mandou uma imagem aqui e eu não consegui abri-la agora.
                  Recarregue a conversa; se continuar, o arquivo pode ter sido removido.
                </div>
              )}
              {m.texto}
                <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
                  {m.pelo_celular ? "você · pelo celular" : m.autor}
                </div>
              </span>
            </div>
          ))}
          <div ref={fim} />
        </div>

        {d.rascunho && (
          <div style={{ ...painel.card, borderColor: "#fbbf24", background: "#fffbeb" }}>
            <div style={painel.rotulo}>Rascunho da IA — revise antes de enviar</div>
            {d.rascunho.motivo_retencao && (
              <p style={{ fontSize: 15, color: "#92400e", margin: "0 0 8px" }}>
                Não foi automático porque: {d.rascunho.motivo_retencao}
              </p>
            )}
            <textarea
              style={{ ...painel.input, minHeight: 160, resize: "vertical", fontFamily: "inherit" }}
              value={rascText}
              onChange={(e) => setRascText(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button style={painel.botao} disabled={ocupado} onClick={() => agirRascunho("aprovou")}>Aprovar e enviar</button>
              <button style={painel.botaoSec} disabled={ocupado} onClick={() => agirRascunho("editou")}>Enviar editado</button>
              <button style={painel.botaoPerigo} disabled={ocupado} onClick={() => agirRascunho("descartou")}>Descartar</button>
            </div>
          </div>
        )}

        <div>
          <textarea
            rows={5}
            style={{ ...painel.input, width: "100%", minHeight: 130, resize: "vertical",
                     fontFamily: "inherit", lineHeight: 1.5 }}
            placeholder="Escreva uma mensagem…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              // Enter quebra linha (mensagem longa é normal aqui).
              // Ctrl+Enter ou Cmd+Enter envia.
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar();
            }}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
            <button style={painel.botao} onClick={enviar} disabled={ocupado || !texto.trim()}>
              Enviar
            </button>
            {/* A IA ESCREVE, VOCÊ MANDA.
                Fica ao lado de Enviar e não dentro de um painel que precisa ser
                aberto: é para o caso comum — responder o que a família acabou
                de perguntar —, e um caso comum atrás de dois cliques não é
                usado. O "Me ajuda a escrever", logo abaixo, é para quando ela
                já sabe o que quer dizer e quer três jeitos de dizer. */}
            <button style={painel.botaoSec} onClick={sugerir} disabled={sugerindo || ocupado}>
              {sugerindo ? "A IA está lendo a conversa…" : "🤖 Sugerir resposta"}
            </button>
            <span style={{ fontSize: 14, color: cor.cinza }}>
              Enter quebra linha · Ctrl+Enter envia
            </span>
          </div>
          {/* Dizer QUANTO ela leu, em vez de pedir fé. Uma sugestão que ignorou
              o combinado de três semanas atrás é pior que sugestão nenhuma, e
              quem revisa precisa saber com o que está lidando. */}
          {leu !== null && (
            <p style={{ fontSize: 13, color: cor.cinza, margin: "6px 0 0" }}>
              A IA leu {leu === 0 ? "o cadastro da família (a conversa ainda não tem mensagens)"
                                  : `as ${leu} últimas mensagens desta conversa`}, os jazigos, o
              saldo e a régua de cobrança. <b>Revise antes de enviar</b> — o que estiver entre
              colchetes é coisa que ela não sabia.
            </p>
          )}
        </div>
        <div style={{ marginTop: 12 }}>
          <AnotarPedido
            conversaId={id}
            clienteId={d.conversa.clienteId || null}
            aoPronto={() => setVersaoPedidos((v) => v + 1)}
          />
        </div>

        <MeAjuda conversaId={id} onEscolher={(t) => setTexto(t)} />
      </div>
    </div>
  );
}


/**
 * "Me ajuda a escrever" — você dá o contexto e o tom; a IA devolve três
 * caminhos diferentes. Escolhe um, ajusta e manda. Nada sai sozinho.
 */
function MeAjuda({ conversaId, onEscolher }: { conversaId: string; onEscolher: (t: string) => void }) {
  const recado = useRecado();
  const [aberto, setAberto] = useState(false);
  const [contexto, setContexto] = useState("");
  const [tom, setTom] = useState("acolhedor");
  const [opcoes, setOpcoes] = useState<any[]>([]);
  const [pensando, setPensando] = useState(false);
  const [copiado, setCopiado] = useState<number | null>(null);

  /** Edita uma sugestão no lugar, guardando o texto original para poder desfazer. */
  function trocarTexto(i: number, texto: string) {
    setOpcoes((atual) =>
      atual.map((o, idx) => (idx === i ? { ...o, texto } : o))
    );
  }

  async function pedir() {
    setPensando(true);
    setOpcoes([]);
    const r = await fetch(`/api/conversas/${conversaId}/ajuda`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contexto, tom }),
    }).then((x) => x.json()).catch(() => null);
    setPensando(false);
    if (r?.ok) {
      // guarda o texto como veio, para o "desfazer edição"
      setOpcoes((r.opcoes || []).map((o: any) => ({ ...o, original: o.texto })));
    }
    else recado.erro(r?.erro === "teto_ia_atingido" ? "Teto de IA do dia atingido." : "Não consegui sugerir agora.");
  }

  if (!aberto) {
    return (
      <button style={{ ...painel.botaoSec, marginBottom: 12 }} onClick={() => setAberto(true)}>
        ✍️ Me ajuda a escrever
      </button>
    );
  }

  return (
    <div style={{ ...painel.card, borderLeft: `4px solid ${cor.teal}`, background: "#f0fdfa" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ color: cor.navy }}>Me ajuda a escrever</strong>
        <button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer",
                         color: cor.cinza }} onClick={() => setAberto(false)}>✕</button>
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={painel.rotulo}>
          O que você quer dizer? (quanto mais contexto, melhor a sugestão)
        </label>
        <textarea
          style={{ ...painel.input, minHeight: 160, fontFamily: "inherit" }}
          value={contexto}
          onChange={(e) => setContexto(e.target.value)}
          placeholder="Ex.: ela perguntou se dá para adiar a limpeza de novembro. Dá sim, mas quero aproveitar para combinar o Finados. Ela é antiga de casa e sempre paga certinho."
        />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 10 }}>
        <div>
          <label style={painel.rotulo}>Tom</label>
          <select style={{ ...painel.input, width: 150 }} value={tom} onChange={(e) => setTom(e.target.value)}>
            <option value="acolhedor">Acolhedor</option>
            <option value="objetivo">Objetivo</option>
            <option value="firme">Firme</option>
          </select>
        </div>
        <button style={painel.botao} onClick={pedir} disabled={pensando}>
          {pensando ? "Pensando…" : opcoes.length ? "Sugerir de novo" : "Sugerir 3 caminhos"}
        </button>
      </div>

      {opcoes.map((o, i) => (
        <div key={i} style={{ background: "#fff", border: `1px solid ${cor.linha}`,
                              borderRadius: 10, padding: 12, marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                        gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, color: cor.teal, textTransform: "uppercase",
                          letterSpacing: 0.5, fontWeight: 700 }}>
              {o.titulo || `Opção ${i + 1}`}
            </div>
            {o.texto !== (o.original ?? o.texto) && (
              <button
                style={{ background: "none", border: "none", color: cor.cinza, fontSize: 13,
                         cursor: "pointer", textDecoration: "underline" }}
                onClick={() => trocarTexto(i, o.original)}
              >
                desfazer edição
              </button>
            )}
          </div>

          {/* editável aqui mesmo: dá para ajustar antes de escolher */}
          <textarea
            style={{ ...painel.input, minHeight: 130, marginTop: 8, fontFamily: "inherit",
                     lineHeight: 1.5, resize: "vertical" }}
            value={o.texto}
            onChange={(e) => trocarTexto(i, e.target.value)}
          />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
            <button style={painel.botao}
                    onClick={() => { onEscolher(o.texto); setAberto(false); }}>
              Usar esta
            </button>
            <button style={painel.botaoSec}
                    onClick={() => { navigator.clipboard?.writeText(o.texto); setCopiado(i);
                                     setTimeout(() => setCopiado(null), 1500); }}>
              {copiado === i ? "✓ copiado" : "Copiar"}
            </button>
            <span style={{ fontSize: 13, color: cor.cinza }}>
              {o.texto.trim().split(/\s+/).filter(Boolean).length} palavras
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
