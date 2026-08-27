"use client";

import { useEffect, useRef, useState } from "react";
import { painel, cor } from "../ui";
import { useConfirmar, useRecado } from "@/components/Dialogos";

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
  const recado = useRecado();
  const perguntar = useConfirmar();
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
    if (!r) return recado.erro("Falha ao falar com o servidor.");
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
    if (!await perguntar({
      oQue: "Desconectar o WhatsApp?",
      efeito: "As mensagens das famílias param de chegar no sistema até alguém reconectar. "
            + "Elas continuam chegando no celular, mas ninguém aqui fica sabendo.",
      confirmar: "Desconectar", tom: "perigo",
    })) return;
    setOcupado(true);
    const r = await fetch("/api/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "desconectar" }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    setQr(null);
    if (r?.ok) setEstado("desconectado");
    else recado.erro("Não consegui desconectar: " + (r?.detalhe || "erro"));
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

        <ChegouAlgumaCoisa />

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


/**
 * "CONECTADO" NÃO É "CHEGANDO".
 *
 * A bolinha verde acima diz que a instância da Evolution está de pé. Ela não
 * diz que mensagem de família está ENTRANDO no sistema — e as duas coisas já
 * discordaram, feio:
 *
 *   23/08/2026   70 mensagens bateram no servidor.  Zero viraram conversa.
 *   04/08 a 22/08  dezenove dias sem um único evento, e ninguém soube.
 *
 * Este bloco mostra o que a bolinha não mostra: quando chegou a última, e o
 * que aconteceu com o que chegou. Os desfechos vêm do rastro da 0121.
 */
function ChegouAlgumaCoisa() {
  const [s, setS] = useState<any>(null);

  useEffect(() => {
    fetch("/api/rotinas")
      .then((r) => r.json())
      .then((r) => { if (r?.ok && r.whatsapp) setS(r.whatsapp); })
      .catch(() => {});
  }, []);

  if (!s) return null;

  const calado = s.silencio || s.nunca_recebeu;
  // Chegou bastante coisa e nada virou conversa de família. É o caso mais
  // traiçoeiro: tudo verde e o sistema surdo.
  const surdo = !calado && s.total_24h >= 10 && s.gravadas_24h === 0;

  const desfechos = Object.entries((s.em_7d || {}) as Record<string, number>)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  const NOME: Record<string, string> = {
    gravada: "viraram conversa de família",
    lead: "de números que não são família",
    grupo: "de grupos",
    vazio: "sem texto e sem mídia",
    duplicado: "repetidas (o WhatsApp reenvia)",
    espelho_cliente: "que você mandou pelo celular",
    espelho_eco: "eco do que o painel enviou",
    espelho_lead: "que você mandou para um contato novo",
    espelho_nada: "que você mandou para fora do sistema",
    escalado: "que pararam para uma pessoa ver",
    ignorado: "de família com a IA desligada",
    erro: "que falharam no meio (o WhatsApp vai reenviar)",
    sem_mensagem: "avisos do WhatsApp, sem mensagem",
    antes_do_rastro: "recebidas antes de existir este registro",
  };

  return (
    <section style={{ ...painel.card,
      borderLeft: `5px solid ${calado || surdo ? "rgb(var(--zm-perigo))" : "rgb(var(--zm-positivo))"}` }}>
      <strong style={{ color: cor.navy }}>Está chegando alguma coisa?</strong>

      <p style={{ color: cor.cinza, fontSize: 15, margin: "8px 0 0" }}>
        {s.nunca_recebeu
          ? "Nunca chegou mensagem nenhuma até agora."
          : calado
            ? `A última mensagem chegou há ${Math.round(s.horas_calado)} horas. `
              + "Mensagem de família pode estar caindo no seu celular e não entrando aqui."
            : `Última mensagem há ${Math.round(s.horas_calado)}h · `
              + `${s.total_24h} nas últimas 24 horas, ${s.gravadas_24h} viraram conversa de família.`}
      </p>

      {surdo && (
        <p style={{ color: "rgb(var(--zm-perigo))", fontSize: 15, margin: "8px 0 0" }}>
          Chega e não entra: {s.total_24h} mensagens em 24 horas e nenhuma virou
          conversa. Ou são só grupos e números desconhecidos, ou alguma família
          escreveu de um número que não está no cadastro.
        </p>
      )}

      {desfechos.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.4,
                        textTransform: "uppercase", color: cor.cinza, marginBottom: 4 }}>
            nos últimos 7 dias
          </div>
          {desfechos.map(([k, n]) => (
            <div key={k} style={{ fontSize: 14, color: cor.navy, padding: "2px 0" }}>
              <b>{String(n)}</b> {NOME[k] || k}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
