"use client";

import { useEffect, useRef, useState } from "react";
import { painel, cor } from "../ui";

/**
 * A CONEXAO DO WHATSAPP — agora dentro de Configuracoes.
 *
 * Ela morava em `/painel/whatsapp`, uma rota solta, fora do menu, alcancavel
 * so por link. Ficou assim quando o agente de IA foi desligado: a tela foi
 * junto, e depois voltou a ser essencial — e a unica onde se reconecta a
 * instancia da Evolution, que e quem entrega as FOTOS do antes e depois.
 *
 * Uma tela essencial que so se acha por link e uma tela que ninguem acha na
 * hora que precisa: quando o WhatsApp cai, o que se procura e "configuracoes",
 * nao um endereco decorado.
 *
 * A rota antiga continua de pe, redirecionando.
 */
type Estado = "conectado" | "conectando" | "desconectado" | "inexistente" | "erro" | "carregando";

export default function ConexaoWhatsapp() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [detalhe, setDetalhe] = useState<string>("");
  const [instancia, setInstancia] = useState<string>("");
  const [qr, setQr] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [msgWebhook, setMsgWebhook] = useState<string>("");
  const polling = useRef<any>(null);

  async function carregarStatus() {
    const r = await fetch("/api/whatsapp").then((x) => x.json()).catch(() => null);
    if (!r) return;
    setEstado(r.estado || "erro");
    setDetalhe(r.detalhe || "");
    setInstancia(r.instancia || "");
    if (r.estado === "conectado") {
      setQr(null);
      pararPolling();
    }
  }

  function iniciarPolling() {
    pararPolling();
    polling.current = setInterval(carregarStatus, 3000);
  }
  function pararPolling() {
    if (polling.current) clearInterval(polling.current);
    polling.current = null;
  }

  useEffect(() => {
    carregarStatus();
    return pararPolling;
  }, []);

  async function conectar() {
    setOcupado(true);
    setQr(null);
    const r = await fetch("/api/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "conectar" }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (!r) return alert("Falha ao falar com o servidor.");
    if (r.estado === "conectado") {
      setEstado("conectado");
      return;
    }
    if (r.qr) {
      setQr(r.qr);
      setEstado("conectando");
      iniciarPolling(); // quando ler o QR, o status vira "conectado" sozinho
    } else {
      setDetalhe(r.detalhe || "QR não retornado — tente de novo em alguns segundos.");
      setEstado(r.estado || "erro");
    }
  }

  async function desconectar() {
    if (!confirm("Desconectar o WhatsApp? A IA para de receber mensagens até reconectar.")) return;
    setOcupado(true);
    const r = await fetch("/api/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "desconectar" }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    setQr(null);
    if (r?.ok) setEstado("desconectado");
    else alert("Não consegui desconectar: " + (r?.detalhe || "erro"));
  }

  async function configurarWebhook() {
    setOcupado(true);
    setMsgWebhook("");
    const r = await fetch("/api/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "webhook", origem: window.location.origin }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (r?.ok) setMsgWebhook(`Webhook apontado para: ${r.url}`);
    else setMsgWebhook("Falhou: " + (r?.detalhe || "erro") + " — dá pra configurar manualmente no Evolution.");
  }

  const bola: Record<string, { corFundo: string; rotulo: string }> = {
    conectado: { corFundo: "rgb(var(--zm-positivo))", rotulo: "Conectado — a IA está recebendo as mensagens" },
    conectando: { corFundo: "#f59e0b", rotulo: "Aguardando leitura do QR no celular..." },
    desconectado: { corFundo: "rgb(var(--zm-perigo))", rotulo: "Desconectado" },
    inexistente: { corFundo: "rgb(var(--zm-ink-soft))", rotulo: "Instância ainda não criada" },
    erro: { corFundo: "rgb(var(--zm-perigo))", rotulo: "Erro ao consultar" },
    carregando: { corFundo: "rgb(var(--zm-ink-soft))", rotulo: "Consultando..." },
  };
  const b = bola[estado];

  return (
    <>
        <h2 style={{ ...painel.h1, fontSize: 18, marginBottom: 8 }}>Conexão do WhatsApp</h2>

        <section style={painel.card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 12, height: 12, borderRadius: 999, background: b.corFundo, display: "inline-block" }} />
            <strong style={{ color: cor.navy }}>{b.rotulo}</strong>
          </div>
          {instancia && (
            <p style={{ color: cor.cinza, fontSize: 15, margin: "8px 0 0" }}>Instância: {instancia}</p>
          )}
          {detalhe && (
            <p style={{ color: "rgb(var(--zm-aviso))", fontSize: 15, margin: "8px 0 0" }}>{detalhe}</p>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            {estado !== "conectado" && (
              <button style={painel.botao} onClick={conectar} disabled={ocupado}>
                {ocupado ? "Gerando QR..." : "Conectar (gerar QR)"}
              </button>
            )}
            {estado === "conectado" && (
              <button style={painel.botaoPerigo} onClick={desconectar} disabled={ocupado}>
                Desconectar
              </button>
            )}
            <button style={painel.botaoSec} onClick={configurarWebhook} disabled={ocupado}>
              Apontar webhook pra cá
            </button>
            <button style={painel.botaoSec} onClick={carregarStatus} disabled={ocupado}>
              Atualizar status
            </button>
          </div>
          {msgWebhook && (
            <p style={{ fontSize: 15, color: cor.cinza, marginTop: 10, wordBreak: "break-all" }}>{msgWebhook}</p>
          )}
        </section>

        {qr && (
          <section style={{ ...painel.card, textAlign: "center" }}>
            <p style={{ color: cor.navy, fontWeight: 600 }}>
              No celular da Sureya: WhatsApp → Aparelhos conectados → Conectar aparelho
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR do WhatsApp" style={{ width: 260, height: 260, imageRendering: "pixelated" }} />
            <p style={{ color: cor.cinza, fontSize: 15 }}>
              O QR expira rápido. Se der tempo limite, clique em “Conectar” de novo.
            </p>
          </section>
        )}

        <section style={painel.card}>
          <p style={{ color: cor.cinza, fontSize: 14, margin: 0 }}>
            Depois de conectar pela primeira vez, clique em <strong>“Apontar webhook pra cá”</strong> uma
            única vez — é o que faz as mensagens chegarem no sistema. Reconexões futuras não precisam repetir isso.
          </p>
        </section>
    </>
  );
}
