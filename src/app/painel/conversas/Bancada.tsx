"use client";

import { useEffect, useState } from "react";
import { painel, cor } from "../ui";

/**
 * A BANCADA DE CALIBRAÇÃO — a mesma pergunta, com dois ajustes, lado a lado.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O SIMULADOR ANTIGO NÃO RESPONDIA A PERGUNTA
 * ---------------------------------------------------------------------------
 * Ele conversava com uma família inventada — "Maria (teste)", "Família
 * Exemplo", saldo "em dia" — e montava o prompt de um jeito diferente do que a
 * produção monta. Nenhum dos blocos que causaram as promessas (a tabela de
 * extras da casa, os pedidos em aberto, os comprovantes a conferir) chegava
 * ali, porque aquele contexto não passava por `montarContexto`.
 *
 * Quem afinava o tom lá afinava contra algo que nunca rodou.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTA BANCADA FAZ
 * ---------------------------------------------------------------------------
 * Você escolhe uma CONVERSA DE VERDADE. Ela responde a última mensagem daquela
 * família DUAS VEZES — com o que está salvo, e com o que você acabou de
 * escrever aqui em cima — pelo MESMO caminho da produção. As duas respostas
 * ficam lado a lado.
 *
 * NADA É SALVO E NADA É ENVIADO. Salvar continua sendo o botão "Salvar treino";
 * mandar mensagem continua sendo manual, pela fila das conversas.
 */

type Conversa = { conversaId: string; cliente: string; ultima: string; em: string };

type Lado = {
  resposta: string; assunto: string | null; confianca: string | null;
  precisaHumano: boolean; prometeuVoltar: boolean; promessaSobre: string | null;
  motivo: string | null;
};

type Resultado = {
  familia: string;
  recebeu: {
    saldo: string | null; jazigos: number; extras: string[];
    pedidosAbertos: string[]; comprovantesPendentes: number; mensagensLidas: number;
  };
  antes: Lado; depois: Lado | null; mudou: boolean;
  modelo: string; porQueSemDepois: string | null;
};

function Coluna({ titulo, sub, lado, destaque }: {
  titulo: string; sub: string; lado: Lado; destaque: boolean;
}) {
  return (
    <div style={{
      flex: "1 1 300px", minWidth: 0, padding: 14, borderRadius: 12,
      border: `1px solid ${destaque ? "rgb(var(--zm-teal) / 0.5)" : cor.linha}`,
      background: destaque ? "rgb(var(--zm-teal) / 0.06)" : cor.card,
    }}>
      <div style={painel.rotulo}>{titulo}</div>
      <p style={{ fontSize: 12.5, color: cor.cinza, margin: "0 0 10px" }}>{sub}</p>
      <p style={{ whiteSpace: "pre-wrap", fontSize: 15, lineHeight: 1.5, margin: 0,
                  color: "rgb(var(--zm-ink))" }}>
        {lado.resposta || <i style={{ color: cor.cinza }}>(o modelo não devolveu texto)</i>}
      </p>

      {/* A PROMESSA É O QUE ESTAMOS MEDINDO. Em 29/08, 44% das respostas
          prometiam voltar e nenhuma deixava marca. Aqui ela aparece antes de
          sair, e é o sinal mais útil da tela: se o seu ajuste derrubou a
          promessa, você vê na hora. */}
      <div style={{
        marginTop: 10, paddingTop: 10, borderTop: `1px solid ${cor.linha}`,
        fontSize: 13, color: cor.cinza, lineHeight: 1.5,
      }}>
        {lado.prometeuVoltar ? (
          <div style={{ color: "rgb(var(--zm-aviso))" }}>
            <b>Prometeu voltar</b>{lado.promessaSobre ? `: ${lado.promessaSobre}` : " (sem dizer sobre o quê)"}
          </div>
        ) : (
          <div style={{ color: "rgb(var(--zm-teal))" }}><b>Resolveu na hora</b> — não prometeu voltar</div>
        )}
        <div style={{ marginTop: 4 }}>
          assunto: {lado.assunto || "—"} · confiança: {lado.confianca || "—"}
          {lado.precisaHumano ? " · marcou que precisa de você" : ""}
        </div>
        {lado.motivo && <div style={{ marginTop: 4 }}>{lado.motivo}</div>}
      </div>
    </div>
  );
}

export default function Bancada({ tom, conhecimento }: {
  /** O rascunho que está nos campos acima — ainda NÃO salvo. */
  tom: string; conhecimento: string;
}) {
  const [conversas, setConversas] = useState<Conversa[] | null>(null);
  const [escolhida, setEscolhida] = useState<string>("");
  const [extra, setExtra] = useState("");
  const [rodando, setRodando] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/calibragem")
      .then((x) => x.json())
      .then((r) => setConversas(r?.ok ? r.conversas : null))
      .catch(() => setConversas(null));
  }, []);

  async function rodar() {
    if (!escolhida || rodando) return;
    setRodando(true); setErro(null); setRes(null);
    try {
      const r = await fetch("/api/calibragem", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversaId: escolhida, tom, conhecimento, mensagem: extra }),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { setErro(r?.mensagem || "Não consegui rodar agora."); return; }
      setRes(r as Resultado);
    } finally { setRodando(false); }
  }

  const atual = (conversas || []).find((c) => c.conversaId === escolhida);

  return (
    <div style={painel.card}>
      <strong style={{ color: cor.navy }}>Bancada de calibração</strong>
      <p style={{ color: cor.cinza, fontSize: 15, margin: "6px 0 14px", lineHeight: 1.5 }}>
        Escolha uma conversa de verdade. A IA responde a última mensagem daquela família
        duas vezes — <b>com o que está salvo</b> e <b>com o que você escreveu aí em cima</b> —
        pelo mesmo caminho do atendimento real. <b>Nada é salvo e nada é enviado.</b>
      </p>

      {conversas === null && (
        <p style={{ color: cor.cinza, fontSize: 14 }}>Carregando as conversas…</p>
      )}
      {conversas !== null && conversas.length === 0 && (
        <p style={{ color: cor.cinza, fontSize: 14 }}>
          Ainda não há nenhuma conversa em que uma família tenha escrito. Não há o que calibrar
          contra uma conversa em que ninguém perguntou nada.
        </p>
      )}

      {conversas !== null && conversas.length > 0 && (<>
        <label style={painel.rotulo}>
          Conversa ({conversas.length} {conversas.length === 1 ? "família escreveu" : "famílias escreveram"})
        </label>
        <select style={painel.input} value={escolhida} onChange={(e) => { setEscolhida(e.target.value); setRes(null); }}>
          <option value="">Escolha uma conversa…</option>
          {conversas.map((c) => (
            <option key={c.conversaId} value={c.conversaId}>
              {c.cliente} — {c.ultima.slice(0, 70)}
            </option>
          ))}
        </select>

        {atual && (
          <p style={{ fontSize: 14, color: cor.cinza, margin: "8px 0 0", lineHeight: 1.5 }}>
            Última mensagem da família: <i>“{atual.ultima}”</i>
          </p>
        )}

        <div style={{ marginTop: 12 }}>
          <label style={painel.rotulo}>
            E se ela perguntasse isto agora? (opcional — entra <b>depois</b> da conversa real,
            não no lugar dela)
          </label>
          <input style={painel.input} value={extra} onChange={(e) => setExtra(e.target.value)}
                 placeholder="Ex.: Qual o valor da troca de vaso?" />
        </div>

        <button style={{ ...painel.botao, marginTop: 12 }} onClick={rodar}
                disabled={rodando || !escolhida}>
          {rodando ? "Perguntando à IA…" : "Ver antes e depois"}
        </button>
      </>)}

      {erro && (
        <p style={{ marginTop: 12, fontSize: 14, color: "rgb(var(--zm-perigo))" }}>{erro}</p>
      )}

      {res && (<div style={{ marginTop: 16 }}>
        {/* O QUE ELA RECEBEU — o coração da bancada.
            Em 29/08 a IA prometeu conferir o preço de um vaso que estava
            cadastrado em Serviços Extras: "Troca de vaso: R$ 60,00". O catálogo
            simplesmente não chegava até ela. Ver o que chegou é o que permite
            descobrir isso sem ler 25 conversas à mão. */}
        <div style={{
          padding: 12, borderRadius: 12, border: `1px solid ${cor.linha}`,
          background: "rgb(var(--zm-ink) / 0.03)", marginBottom: 14,
        }}>
          <div style={painel.rotulo}>O que a IA recebeu sobre {res.familia}</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: cor.cinza, lineHeight: 1.6 }}>
            <li>{res.recebeu.mensagensLidas} mensagens desta conversa</li>
            <li>{res.recebeu.jazigos} {res.recebeu.jazigos === 1 ? "jazigo" : "jazigos"}
                {res.recebeu.saldo ? ` · saldo: ${res.recebeu.saldo}` : ""}</li>
            <li>
              {res.recebeu.extras.length
                ? <>tabela de extras da casa: {res.recebeu.extras.join(" · ")}</>
                : <b style={{ color: "rgb(var(--zm-aviso))" }}>
                    nenhum extra cadastrado — se ela perguntar preço de vaso, a IA não tem o que responder
                  </b>}
            </li>
            {res.recebeu.pedidosAbertos.length > 0 && (
              <li>pedidos em aberto: {res.recebeu.pedidosAbertos.join(" · ")}</li>
            )}
            {res.recebeu.comprovantesPendentes > 0 && (
              <li>{res.recebeu.comprovantesPendentes} comprovante(s) recebido(s) e ainda não conferido(s)</li>
            )}
          </ul>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Coluna titulo="Como está hoje" sub="com o tom e o conhecimento salvos"
                  lado={res.antes} destaque={false} />
          {res.depois
            ? <Coluna titulo="Com o seu ajuste" sub="com o que está escrito aí em cima, ainda não salvo"
                      lado={res.depois} destaque />
            : (
              <div style={{
                flex: "1 1 300px", minWidth: 0, padding: 14, borderRadius: 12,
                border: `1px dashed ${cor.linha}`, display: "flex", alignItems: "center",
              }}>
                <p style={{ fontSize: 14, color: cor.cinza, margin: 0, lineHeight: 1.5 }}>
                  {res.porQueSemDepois}
                </p>
              </div>
            )}
        </div>

        {/* SEM ISTO A TELA MENTE POR OMISSÃO. O modelo é amostrado: a mesma
            pergunta dá textos diferentes a cada rodada. Se a bancada não
            dissesse que fixou a temperatura, você atribuiria ao seu ajuste uma
            diferença que às vezes é só acaso — e mudaria o tom por causa de
            ruído. */}
        <p style={{ fontSize: 13, color: cor.cinza, marginTop: 12, lineHeight: 1.5 }}>
          Rodou com <b>{res.modelo}</b>, com a variação do modelo desligada nos dois lados —
          assim a diferença que aparece é o seu ajuste, e não o acaso. Isso é da bancada; no
          atendimento de verdade a variação continua ligada, então o texto real não sai
          idêntico a este. <b>Nada foi salvo e nada foi enviado.</b> Para valer, use
          “Salvar treino” aí em cima.
        </p>
      </div>)}
    </div>
  );
}
