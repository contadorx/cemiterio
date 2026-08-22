"use client";

import { useCallback, useEffect, useState } from "react";
import { PainelNav, painel } from "../ui";
import VisaoConversas from "./VisaoConversas";
import VisaoLeads from "./VisaoLeads";
import VisaoRascunhos from "./VisaoRascunhos";
import VisaoAgente from "./VisaoAgente";

/**
 * ATENDIMENTO — tudo que é conversa, numa tela só.
 *
 * Eram quatro endereços para o mesmo trabalho, e um deles não estava nem no
 * menu:
 *
 *   Conversas   · quem é cliente e escreveu
 *   Leads       · quem NÃO é cliente e escreveu (a IA não responde sozinha) e
 *                 quem a Sureya quer abordar
 *   Rascunhos   · o que a IA escreveu e está esperando aval (era
 *                 /painel/atendimento, fora do menu, alcançável só por link)
 *   Agente      · o treino da IA
 *
 * A separação não tinha razão: é o mesmo minuto de trabalho. Quem lê a conversa
 * é quem aprova o rascunho; e a regra do agente nasce justamente da conversa que
 * acabou de sair torta — obrigar a pessoa a trocar de tela no meio disso é
 * garantir que a correção não seja feita.
 *
 * A aba fica no endereço (?aba=leads) para dar link direto e sobreviver ao F5.
 * Leitura no window dentro do useEffect, NÃO com useSearchParams — que no
 * Next 14 exigiria um <Suspense> em volta da página inteira só por isso.
 */
type Aba = "conversas" | "leads" | "rascunhos" | "agente";

const ABAS: [Aba, string][] = [
  ["conversas", "Conversas"],
  ["leads", "Leads"],
  ["rascunhos", "Rascunhos da IA"],
  ["agente", "Treino do agente"],
];

export default function Atendimento() {
  const [aba, setAba] = useState<Aba>("conversas");
  const [nLeads, setNLeads] = useState<number | null>(null);
  const [nRascunhos, setNRascunhos] = useState<number | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("aba");
    if (ABAS.some(([v]) => v === q)) setAba(q as Aba);
  }, []);

  // Os números são o convite. Lead novo e rascunho parado são resposta que a
  // pessoa do outro lado NÃO recebeu — se não aparecer no rótulo, ninguém abre.
  const contar = useCallback(() => {
    fetch("/api/leads?status=novo")
      .then((x) => x.json())
      .then((r) => { if (r?.ok) setNLeads((r.leads || []).length); })
      .catch(() => {});
    fetch("/api/rascunhos")
      .then((x) => x.json())
      .then((r) => { if (r?.ok) setNRascunhos((r.rascunhos || []).length); })
      .catch(() => {});
  }, []);
  useEffect(() => { contar(); }, [contar]);

  function trocar(v: Aba) {
    setAba(v);
    const url = v === "conversas" ? "/painel/conversas" : `/painel/conversas?aba=${v}`;
    window.history.replaceState(null, "", url);
  }

  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/conversas" />
      <div style={painel.conteudo}>
        <h1 style={{ ...painel.h1, marginBottom: 10 }}>Atendimento</h1>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {ABAS.map(([v, rot]) => {
            const ativa = aba === v;
            const n = v === "leads" ? nLeads : v === "rascunhos" ? nRascunhos : null;
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

        {aba === "conversas" && <VisaoConversas />}
        {aba === "leads" && <VisaoLeads />}
        {aba === "rascunhos" && <VisaoRascunhos onMudou={contar} />}
        {aba === "agente" && <VisaoAgente />}
      </div>
    </div>
  );
}
