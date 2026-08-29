"use client";

/**
 * O antigo /painel/agente, agora ABA da central de Atendimento.
 * Quem treina a IA e quem le as conversas e a MESMA pessoa, no mesmo momento:
 * a regra nasce da conversa que acabou de sair torta. /painel/agente redireciona.
 */

import { useEffect, useState } from "react";
import { painel, cor } from "../ui";
import Modelos from "../agente/Modelos";
import Bancada from "./Bancada";

export default function VisaoAgente() {
  const [aba, setAba] = useState<"ensinar" | "modelos">("ensinar");
  const [conhecimento, setConhecimento] = useState("");
  const [tom, setTom] = useState("");
  const [msgLead, setMsgLead] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    fetch("/api/config-ia")
      .then((x) => x.json())
      .then((r) => {
        if (r.ok) {
          setConhecimento(r.conhecimento);
          setTom(r.tom);
          setMsgLead(r.msgLead || "");
        }
      });
  }, []);

  async function salvar() {
    setSalvando(true);
    setOk(false);
    await fetch("/api/config-ia", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conhecimento, tom, msgLead }),
    });
    setSalvando(false);
    setOk(true);
    setTimeout(() => setOk(false), 2500);
  }

  return (
    <div>
      <div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {([["ensinar", "Ensinar a IA"], ["modelos", "Modelos e custo"]] as const).map(([v, rot]) => (
            <button key={v} style={aba === v ? painel.botao : painel.botaoSec}
                    onClick={() => setAba(v)}>{rot}</button>
          ))}
        </div>

        {aba === "modelos" && <Modelos />}
        {aba === "ensinar" && (<>
        <p style={{ color: cor.cinza, marginTop: -10 }}>
          Isto vale para <b>todos</b> os atendimentos. Para instruções de um contato específico,
          use a ficha do cliente.
        </p>

        <div style={painel.card}>
          <label style={painel.rotulo}>Conhecimento do negócio (preços, o que está incluso, prazos, formas de pagamento, respostas comuns)</label>
          <textarea
            style={{ ...painel.input, minHeight: 220, resize: "vertical", fontFamily: "inherit" }}
            value={conhecimento}
            onChange={(e) => setConhecimento(e.target.value)}
            placeholder={"Ex.:\n- Limpeza avulsa: R$ 40 por túmulo.\n- Pagamento por Pix na chave (11) 9xxxx-xxxx.\n- Limpeza inclui: retirada de mato, lavagem da lápide, troca de flores se o cliente enviar.\n- Atendemos o Cemitério da Saudade (Vila Vitória, Mauá).\n- A foto do serviço é enviada no mesmo dia."}
          />
        </div>

        {/* UMA LINHA NÃO CABIA. Medido em 29/08: o tom salvo tem 786
            caracteres — quinze linhas de instrução espremidas num campo de
            uma linha só, onde não dá para ler o que está escrito nem achar a
            frase que se quer mudar. É lá, na última frase, que mora
            "deixa eu conferir aqui e já te falo". */}
        <div style={painel.card}>
          <label style={painel.rotulo}>Ajuste de tom (opcional)</label>
          <textarea
            style={{ ...painel.input, minHeight: 160, resize: "vertical", fontFamily: "inherit",
                     lineHeight: 1.5 }}
            value={tom}
            onChange={(e) => setTom(e.target.value)}
            placeholder="Ex.: mais formal, sempre chamar de senhor/senhora"
          />
        </div>

        <div style={painel.card}>
          <label style={painel.rotulo}>
            Saudação para números desconhecidos (leads). Se preencher, quem não é cliente recebe esta
            mensagem UMA vez e entra na aba Leads. Vazio = não responde (só registra o lead).
          </label>
          <textarea
            style={{ ...painel.input, minHeight: 80, resize: "vertical", fontFamily: "inherit" }}
            value={msgLead}
            onChange={(e) => setMsgLead(e.target.value)}
            placeholder={"Ex.: Olá! Aqui é a Sureya, do serviço de limpeza de túmulos do Cemitério da Saudade. Me conta como posso ajudar? 🌿"}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button style={painel.botao} onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar treino"}
          </button>
          {ok && <span style={{ color: cor.teal }}>✓ salvo</span>}
        </div>

        <div style={{ marginTop: 20 }}>
          <Bancada tom={tom} conhecimento={conhecimento} />
        </div>
        </>)}
      </div>
    </div>
  );
}
