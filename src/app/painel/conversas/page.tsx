"use client";

import { useCallback, useEffect, useState } from "react";
import { PainelNav, painel } from "../ui";
import VisaoLiberacao from "./VisaoLiberacao";
import VisaoConversas from "./VisaoConversas";
import VisaoSite from "./VisaoSite";

/**
 * CONVERSAS — tudo que é falar com a família, numa tela só.
 *
 * O QUE ESTAVA ESPALHADO
 * ---------------------------------------------------------------------------
 * Três endereços para o mesmo minuto de trabalho:
 *
 *   /painel/fila       · a liberação das mensagens preparadas
 *   /painel/contatos   · quem escreveu pelo site, e as conversas de WhatsApp
 *   /painel/conversas  · o CRM antigo (conversas, leads, rascunhos, agente)
 *
 * E, embaixo disso, DUAS FILAS de mensagem esperando decisão: `fila_liberacao`
 * (foto, cobrança) e `interacoes_ia` (aniversário, Finados, aviso de saldo).
 * A segunda tinha tela própria, num endereço que ninguém abria — e em 23/08
 * havia **164 mensagens paradas nela**, 157 delas cobranças geradas entre 04
 * e 22 de agosto. Não é que alguém decidiu não enviar: ninguém viu.
 *
 * A 0094 abriu a porta única. Esta tela é a outra metade: uma tela só, e a
 * LIBERAÇÃO PRIMEIRO, porque é o que tem prazo — do outro lado tem gente
 * esperando resposta que já foi escrita.
 *
 * A ORDEM DAS ABAS é a ordem do dia dela:
 *   1. Liberação      — o que está pronto para sair e depende de um toque
 *   2. Conversas      — quem falou com a gente e espera resposta
 *   3. Contatos do site — quem chegou agora e ainda não é ninguém aqui
 *   4. Fila antiga    — o passivo das 164, que some quando zerar
 *
 * A aba fica no endereço (?aba=conversas) para dar link direto e sobreviver ao
 * F5. Leitura no window dentro do useEffect, NÃO com useSearchParams — que no
 * Next 14 exigiria um <Suspense> em volta da página inteira só por isso.
 */
/**
 * A "FILA ANTIGA" SAIU DAS ABAS.
 *
 * Ela era uma lista de rascunhos da IA soltos — texto sem a pergunta que o
 * originou. Nasceu como remendo para expor 164 mensagens que o sistema tinha
 * preparado numa segunda fila sem tela, e cumpriu o papel: hoje as 162 estão
 * todas decididas e a lista está vazia.
 *
 * Mantê-la seria manter a SEGUNDA PORTA aberta — a mesma que a 0094 fechou
 * para as mensagens e deixou aberta para a IA. Foi por ela que os rascunhos se
 * acumularam sem ninguém ver.
 *
 * Agora a sugestão da IA aparece DENTRO da conversa, embaixo da última
 * mensagem, com o motivo pelo qual não foi enviada. É o único lugar onde dá
 * para julgar se a resposta serve.
 */
type Aba = "liberacao" | "conversas" | "site";

const ABAS: [Aba, string][] = [
  ["liberacao", "Liberação"],
  ["conversas", "Conversas"],
  ["site", "Contatos do site"],
];

export default function Conversas() {
  const [aba, setAba] = useState<Aba>("liberacao");
  const [nLiberacao, setNLiberacao] = useState<number | null>(null);
  const [nSite, setNSite] = useState<number | null>(null);
  const [nAntiga, setNAntiga] = useState<number | null>(null);
  /**
   * O QUE ESPERA POR VOCÊ NA ABA CONVERSAS.
   *
   * A aba era a única sem número. Liberação e Contatos do site diziam quantos
   * havia; Conversas ficava muda, e de fora não dava para saber se havia
   * alguém esperando resposta — que é justamente o defeito que criou esta
   * tela: 164 mensagens paradas dezenove dias porque nada as anunciava.
   *
   * O NÚMERO NÃO É "QUANTAS CONVERSAS EXISTEM". Medido em 24/08: existem 161,
   * e só 3 pedem alguma coisa. Um crachá com 161 não seria informação, seria
   * ruído — e ruído se aprende a ignorar, que é como o silêncio começa.
   */
  const [conv, setConv] = useState<{
    pendentes: number; aguardando: number; escaladas: number;
  } | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("aba");
    if (ABAS.some(([v]) => v === q)) setAba(q as Aba);
  }, []);

  // Os números são o convite. Mensagem preparada e não liberada é resposta que
  // a família NÃO recebeu — se não aparecer no rótulo, ninguém abre. Foi
  // exatamente assim que 164 mensagens ficaram paradas dezenove dias.
  const contar = useCallback(() => {
    fetch("/api/fila")
      .then((x) => x.json())
      .then((r) => { if (r?.ok) setNLiberacao((r.itens || []).length); })
      .catch(() => {});
    fetch("/api/contatos")
      .then((x) => x.json())
      .then((r) => { if (r?.ok) setNSite((r.pendentes || []).length); })
      .catch(() => {});
    fetch("/api/rascunhos")
      .then((x) => x.json())
      .then((r) => { if (r?.ok) setNAntiga((r.rascunhos || []).length); })
      .catch(() => {});
    // Os contadores vêm de `sureya_contadores_conversas`, a MESMA função que
    // desenha as sub-abas lá dentro. Uma segunda contagem aqui começaria igual
    // e terminaria discordando — é o defeito de forma que já apareceu cinco
    // vezes neste sistema.
    fetch("/api/conversas?situacao=pendentes")
      .then((x) => x.json())
      .then((r) => { if (r?.ok && r.contadores) setConv(r.contadores); })
      .catch(() => {});
  }, []);
  useEffect(() => { contar(); }, [contar]);

  function trocar(v: Aba) {
    setAba(v);
    const url = v === "liberacao" ? "/painel/conversas" : `/painel/conversas?aba=${v}`;
    window.history.replaceState(null, "", url);
  }

  const contagem = (v: Aba) =>
    v === "liberacao" ? nLiberacao : v === "site" ? nSite : (conv?.pendentes ?? null);

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/conversas" />
      <div style={painel.conteudo}>
        <h1 style={{ ...painel.h1, marginBottom: 10 }}>Conversas</h1>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {ABAS.map(([v, rot]) => {
            const ativa = aba === v;
            const n = contagem(v);
            return (
              <button
                key={v}
                onClick={() => trocar(v)}
                style={{
                  ...(ativa ? painel.botaoMini : painel.botaoMiniSec),
                  ...(!ativa && n ? { borderColor: "#d97706", color: "#92400e" } : {}),
                }}
              >
                {rot}{n ? ` (${n})` : ""}
              </button>
            );
          })}
        </div>

        {/* O PASSIVO ANUNCIADO NA PRIMEIRA ABA.
            Esconder o número na aba 4 repetiria o erro que criou o problema:
            quem abre esta tela tem de saber, na primeira linha, que existem
            mensagens preparadas há semanas que nunca foram vistas. */}
        {/* O PASSIVO CONTINUA ANUNCIADO, mas agora aponta para onde se decide.
            A lista solta saiu; o que sobrou de rascunho da IA aparece dentro da
            conversa que o originou. */}
        {aba === "liberacao" && !!nAntiga && (
          <div className="mb-4 rounded-xl2 border border-aviso/30 bg-aviso/10 p-3 text-[14px] text-aviso">
            <b>A IA preparou {nAntiga} {nAntiga === 1 ? "resposta" : "respostas"} esperando você.</b>{" "}
            Nenhuma foi enviada. Elas aparecem <b>dentro da conversa</b> de cada família,
            com o motivo pelo qual a IA segurou.{" "}
            <button className="underline" onClick={() => trocar("conversas")}>
              ver as conversas
            </button>
          </div>
        )}

        {/* O CRACHÁ DIZ QUANTOS; ESTA LINHA DIZ O QUÊ.
            "Conversas (3)" faz abrir a aba, e aí começa a procura: qual das
            161? Aqui a divisão está pronta, e cada pedaço é um botão que já
            entra com o recorte feito. */}
        {aba === "conversas" && !!conv?.pendentes && (
          <div className="mb-4 rounded-xl2 border border-line bg-surface p-3 text-[14px]">
            <b className="text-ink">
              {conv.pendentes === 1 ? "1 conversa espera" : `${conv.pendentes} conversas esperam`} por você
            </b>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-ink-soft">
              {conv.aguardando > 0 && (
                <a className="underline" href="/painel/conversas?aba=conversas&ver=aguardando">
                  {conv.aguardando} sem resposta
                </a>
              )}
              {conv.escaladas > 0 && (
                <a className="underline" href="/painel/conversas?aba=conversas&ver=escaladas">
                  {conv.escaladas} escalada{conv.escaladas === 1 ? "" : "s"}
                </a>
              )}
              <span>
                as demais estão em dia — o número não é quantas conversas existem,
                é quantas pedem alguma coisa.
              </span>
            </div>
          </div>
        )}

        {aba === "liberacao" && <VisaoLiberacao />}
        {aba === "conversas" && <VisaoConversas />}
        {aba === "site" && <VisaoSite />}
      </div>
    </div>
  );
}
