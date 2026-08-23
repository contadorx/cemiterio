"use client";

import { useCallback, useEffect, useState } from "react";
import { PainelNav, painel } from "../ui";
import VisaoLiberacao from "./VisaoLiberacao";
import VisaoConversas from "./VisaoConversas";
import VisaoSite from "./VisaoSite";
import VisaoRascunhos from "./VisaoRascunhos";

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
type Aba = "liberacao" | "conversas" | "site" | "antiga";

const ABAS: [Aba, string][] = [
  ["liberacao", "Liberação"],
  ["conversas", "Conversas"],
  ["site", "Contatos do site"],
  ["antiga", "Fila antiga"],
];

export default function Conversas() {
  const [aba, setAba] = useState<Aba>("liberacao");
  const [nLiberacao, setNLiberacao] = useState<number | null>(null);
  const [nSite, setNSite] = useState<number | null>(null);
  const [nAntiga, setNAntiga] = useState<number | null>(null);

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
  }, []);
  useEffect(() => { contar(); }, [contar]);

  function trocar(v: Aba) {
    setAba(v);
    const url = v === "liberacao" ? "/painel/conversas" : `/painel/conversas?aba=${v}`;
    window.history.replaceState(null, "", url);
  }

  const contagem = (v: Aba) =>
    v === "liberacao" ? nLiberacao : v === "site" ? nSite : v === "antiga" ? nAntiga : null;

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/conversas" />
      <div style={painel.conteudo}>
        <h1 style={{ ...painel.h1, marginBottom: 10 }}>Conversas</h1>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {ABAS.map(([v, rot]) => {
            // A FILA ANTIGA SOME QUANDO ZERAR. Ela existe para o passivo ser
            // pago, não para virar mais um lugar permanente de olhar: uma aba
            // vazia para sempre é o começo da próxima fila esquecida.
            if (v === "antiga" && nAntiga === 0) return null;
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
        {aba === "liberacao" && !!nAntiga && (
          <div className="mb-4 rounded-xl2 border border-aviso/30 bg-aviso/10 p-3 text-[14px] text-aviso">
            <b>{nAntiga} mensagens na fila antiga.</b> São as que o sistema preparou
            antes desta tela existir e ficaram numa segunda fila, sem tela — a maior
            parte cobranças geradas dia após dia. Elas <b>não</b> foram enviadas.{" "}
            <button className="underline" onClick={() => trocar("antiga")}>
              ver e decidir
            </button>
          </div>
        )}

        {aba === "liberacao" && <VisaoLiberacao />}
        {aba === "conversas" && <VisaoConversas />}
        {aba === "site" && <VisaoSite />}
        {aba === "antiga" && <VisaoRascunhos onMudou={contar} />}
      </div>
    </div>
  );
}
