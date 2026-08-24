"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * SINAIS DE VIDA — a faixa que faltava.
 *
 * POR QUE ELA EXISTE
 *
 * Entre 04/08 e 22/08 de 2026 o WhatsApp não entregou uma única mensagem ao
 * sistema. Dezenove dias. Ninguém descobriu enquanto durava — a descoberta veio
 * de uma pergunta feita à mão: "o whats chega?".
 *
 * E o sistema SABIA. `rotinas` guardava o carimbo, `LIMITE_MINUTOS.webhook` já
 * era 48h, `/api/rotinas` já calculava tudo — inclusive com um comentário
 * dizendo "o Início só precisa disto para decidir se mostra a faixa vermelha".
 * Só que nenhuma tela chamava essa rota. O alarme foi construído inteiro e
 * nunca ligado no fio.
 *
 * Esta é a ligação. Fica no topo do Início, antes até da fila de contatos:
 * uma família esperando resposta é urgente, mas um cano entupido é a razão
 * pela qual a gente nem sabe quantas estão esperando.
 *
 * QUANDO ELA NÃO APARECE
 * Tudo em dia. Faixa de sistema que fica sempre na tela vira moldura — e
 * moldura ninguém lê. Ela só ocupa espaço quando tem o que dizer.
 */

interface Rotina {
  chave: string;
  nome: string;
  impacto: string;
  minutosDesde: number | null;
  nuncaRodou: boolean;
  atrasada: boolean;
  ultimoErro: string | null;
}

interface Saude {
  horas_calado: number;
  nunca_recebeu: boolean;
  silencio: boolean;
  total_24h: number;
  gravadas_24h: number;
  ultimo_evento: string | null;
}

function faz(minutos: number | null): string {
  if (minutos == null) return "nunca";
  if (minutos < 60) return `há ${minutos} min`;
  const h = Math.round(minutos / 60);
  if (h < 48) return `há ${h}h`;
  return `há ${Math.round(h / 24)} dias`;
}

export default function SinaisDeVida() {
  const [rotinas, setRotinas] = useState<Rotina[]>([]);
  const [whats, setWhats] = useState<Saude | null>(null);

  useEffect(() => {
    fetch("/api/rotinas")
      .then((r) => r.json())
      .then((r) => {
        if (!r?.ok) return;
        setRotinas(r.rotinas || []);
        setWhats(r.whatsapp || null);
      })
      // Silencioso: o Início é sobre o mês. Se o diagnóstico não responder, o
      // mês continua aparecendo — só o aviso não sai.
      .catch(() => {});
  }, []);

  const paradas = rotinas.filter((r) => r.atrasada);

  // O WHATSAPP CALADO É UM AVISO. O WHATSAPP FALANDO E NÃO GRAVANDO É OUTRO.
  //
  // O segundo é o mais traiçoeiro: o carimbo fica verde, o painel fica quieto,
  // e as mensagens entram e somem. Era exatamente o estado do dia 23/08 —
  // 70 eventos, zero gravadas.
  const calado = !!whats && (whats.silencio || whats.nunca_recebeu);
  const surdo =
    !!whats && !calado && whats.total_24h >= 10 && whats.gravadas_24h === 0;

  if (paradas.length === 0 && !calado && !surdo) return null;

  return (
    <div className="mb-4 rounded-xl2 border border-perigo/40 bg-perigo/5 p-4">
      <p className="text-[16px] font-semibold text-perigo">
        Alguma coisa parou de rodar
      </p>

      <ul className="mt-2 space-y-1.5">
        {calado && whats && (
          <li className="text-[14px] leading-relaxed text-ink">
            <b>O WhatsApp está calado</b>
            {whats.nunca_recebeu
              ? " — nunca chegou mensagem nenhuma."
              : ` há ${Math.round(whats.horas_calado)} horas.`}{" "}
            <span className="text-ink-soft">
              Mensagem de família pode estar chegando no seu celular e não entrando aqui.
            </span>
          </li>
        )}

        {surdo && whats && (
          <li className="text-[14px] leading-relaxed text-ink">
            <b>Chega e não entra.</b>{" "}
            <span className="text-ink-soft">
              {whats.total_24h} mensagens bateram no servidor nas últimas 24 horas
              e nenhuma virou conversa de família. Ou são só grupos e números
              desconhecidos, ou alguma família escreveu de um número que não está
              no cadastro.
            </span>
          </li>
        )}

        {paradas.map((r) => (
          <li key={r.chave} className="text-[14px] leading-relaxed text-ink">
            <b>{r.nome}</b>: {r.nuncaRodou ? "nunca rodou" : `última vez ${faz(r.minutosDesde)}`}.{" "}
            <span className="text-ink-soft">{r.impacto}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-3">
        <Link
          href="/painel/config?aba=whatsapp"
          className="text-[14px] font-semibold text-brand hover:underline"
        >
          Reconectar o WhatsApp →
        </Link>
        <Link
          href="/painel/config?aba=erros"
          className="text-[14px] font-semibold text-brand hover:underline"
        >
          Ver o diagnóstico completo →
        </Link>
      </div>
    </div>
  );
}
