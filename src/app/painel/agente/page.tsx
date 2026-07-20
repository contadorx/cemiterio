"use client";

import { useEffect, useState } from "react";
import { PainelNav, painel, cor } from "../ui";
import Modelos from "./Modelos";

export default function Agente() {
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
    <div style={painel.wrap}>
      <PainelNav atual="/painel/agente" />
      <div style={painel.conteudo}>
        <h1 style={painel.h1}>Treino do agente</h1>

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

        <div style={{ marginTop: 20 }}>
          <Simulador />
        </div>
        </>)}
      </div>
    </div>
  );
}

function Simulador() {
  const [msgs, setMsgs] = useState<{ papel: string; texto: string; meta?: any }[]>([]);
  const [entrada, setEntrada] = useState("");
  const [pensando, setPensando] = useState(false);

  const exemplos = [
    "Oi, quanto custa a limpeza?",
    "Já paguei, mandei o pix ontem",
    "Quando vocês vão lá de novo?",
    "Minha mãe faleceu semana passada, preciso de ajuda",
    "Não gostei, o túmulo continua sujo",
  ];

  async function enviar(texto?: string) {
    const t = (texto ?? entrada).trim();
    if (!t || pensando) return;
    const novo = [...msgs, { papel: "cliente", texto: t }];
    setMsgs(novo);
    setEntrada("");
    setPensando(true);

    const r = await fetch("/api/simulador", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ historico: novo }),
    }).then((x) => x.json()).catch(() => null);
    setPensando(false);

    if (r?.ok) {
      setMsgs([...novo, { papel: "ia", texto: r.resposta, meta: r }]);
    } else {
      setMsgs([...novo, { papel: "ia", texto: "(erro: " + (r?.erro || "falha") + ")" }]);
    }
  }

  return (
    <div style={painel.card}>
      <strong style={{ color: cor.navy }}>Simulador de treino</strong>
      <p style={{ color: cor.cinza, fontSize: 15, margin: "6px 0 12px" }}>
        Converse com a IA como se fosse um cliente. <b>Nada é enviado no WhatsApp nem gravado</b> — serve
        para você testar o conhecimento e o tom acima. Se a resposta não ficar boa, ajuste o texto e teste de novo.
      </p>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {exemplos.map((e) => (
          <button key={e} style={painel.botaoMiniSec} onClick={() => enviar(e)}>
            {e}
          </button>
        ))}
      </div>

      <div style={{ background: "#f8fafc", borderRadius: 12, padding: 12, minHeight: 140, maxHeight: 380, overflowY: "auto", marginBottom: 12 }}>
        {msgs.length === 0 && <p style={{ color: cor.cinza, fontSize: 14, margin: 0 }}>Mande uma mensagem para começar.</p>}
        {msgs.map((m, i) => (
          <div key={i} style={{ marginBottom: 10, textAlign: m.papel === "cliente" ? "left" : "right" }}>
            <div
              style={{
                display: "inline-block",
                maxWidth: "85%",
                padding: "10px 14px",
                borderRadius: 14,
                background: m.papel === "cliente" ? "#e2e8f0" : cor.teal,
                color: m.papel === "cliente" ? cor.navy : "#fff",
                fontSize: 15,
                textAlign: "left",
                whiteSpace: "pre-wrap",
              }}
            >
              {m.texto}
            </div>
            {m.meta && (
              <div style={{ fontSize: 14, color: cor.cinza, marginTop: 4 }}>
                assunto: {m.meta.assunto} · confiança: {m.meta.confianca}
                {m.meta.precisaHumano ? " · ⚠️ iria pra você aprovar" : " · ✓ sairia automático"}
                {m.meta.motivo ? ` · ${m.meta.motivo}` : ""}
              </div>
            )}
          </div>
        ))}
        {pensando && <p style={{ color: cor.cinza, fontSize: 14 }}>pensando…</p>}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={{ ...painel.input, flex: 1 }}
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enviar()}
          placeholder="Escreva como se fosse o cliente…"
        />
        <button style={painel.botao} onClick={() => enviar()} disabled={pensando}>Enviar</button>
      </div>
      {msgs.length > 0 && (
        <button style={{ ...painel.botaoSec, marginTop: 10 }} onClick={() => setMsgs([])}>Limpar conversa</button>
      )}
    </div>
  );
}
