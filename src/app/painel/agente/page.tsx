"use client";

import { useEffect, useState } from "react";
import { PainelNav, painel, cor } from "../ui";

export default function Agente() {
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
    <div style={painel.wrap}>
      <PainelNav atual="/painel/agente" />
      <div style={painel.conteudo}>
        <h1 style={painel.h1}>Treino do agente</h1>
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

        <div style={painel.card}>
          <label style={painel.rotulo}>Ajuste de tom (opcional)</label>
          <input
            style={painel.input}
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
      </div>
    </div>
  );
}
