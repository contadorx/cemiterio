"use client";

import { useCallback, useEffect, useState } from "react";
import { painel, cor } from "../ui";
import { useRecado } from "@/components/Dialogos";

/**
 * O QUE FOI PROMETIDO NESTA CONVERSA (0142).
 *
 * O QUE SE MEDIU EM 29/08, EM PRODUÇÃO
 * ---------------------------------------------------------------------------
 *   25  respostas a mensagens de família
 *   11  (44%) prometiam voltar — "deixa eu conferir isso direitinho e já te falo"
 *    0  diziam um prazo
 *    0  deixavam registro
 *
 * A promessa saía, a família esperava, e do lado de cá não havia nada: nem
 * lista, nem relógio, nem quem. Seis das onze eram "recebi seu comprovante,
 * vou conferir e te confirmo" — promessa verdadeira (o comprovante fica
 * `a_conferir`), mas conferir não devolvia nada: 94 lançamentos, zero
 * conferidos.
 *
 * A caixa aparece EM CIMA DAS MENSAGENS, não embaixo. Quem abre a conversa
 * para responder precisa saber o que já foi prometido ANTES de escrever —
 * embaixo da rolagem ela seria lida depois do envio, quando não serve mais.
 *
 * NADA AQUI ENVIA NADA. Fechar é dizer o que aconteceu com o assunto; a
 * resposta, se houver, sai pelo campo de texto abaixo, com o seu toque.
 */

type Compromisso = {
  id: string;
  sobre: string;
  vence_em: string;
  atrasado: boolean;
  criado_em: string;
};

function dia(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

export default function Compromissos({ conversaId }: { conversaId: string }) {
  const recado = useRecado();
  const [lista, setLista] = useState<Compromisso[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/compromissos?conversa=${encodeURIComponent(conversaId)}`)
      .then((x) => x.json())
      .catch(() => null);
    // VAZIO NÃO É ZERO: se a busca falhou eu não digo "nenhuma promessa em
    // aberto" — digo nada, e a caixa some. Uma lista vazia por engano faria
    // parecer que ninguém está esperando resposta.
    setLista(r?.ok ? (r.compromissos as Compromisso[]) : null);
  }, [conversaId]);

  useEffect(() => { if (conversaId) carregar(); }, [conversaId, carregar]);

  async function fechar(id: string, desfecho: "respondido" | "nao_cabe") {
    setOcupado(id);
    try {
      const r = await fetch("/api/compromissos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, desfecho }),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { recado.erro(r?.mensagem || "Não consegui fechar agora. Tente de novo."); return; }
      await carregar();
    } finally { setOcupado(null); }
  }

  if (!lista || lista.length === 0) return null;

  const atrasados = lista.filter((c) => c.atrasado).length;

  return (
    <div style={{
      ...painel.card,
      borderColor: atrasados ? "rgb(var(--zm-perigo) / 0.45)" : "rgb(var(--zm-aviso) / 0.45)",
      background: atrasados ? "rgb(var(--zm-perigo) / 0.07)" : "rgb(var(--zm-aviso) / 0.09)",
    }}>
      <div style={painel.rotulo}>
        {lista.length === 1 ? "Você prometeu voltar sobre isto" : `Você prometeu voltar sobre ${lista.length} coisas`}
        {atrasados > 0 && (
          <b style={{ color: "rgb(var(--zm-perigo))" }}>
            {" "}· {atrasados === 1 ? "1 já passou do prazo" : `${atrasados} já passaram do prazo`}
          </b>
        )}
      </div>

      {lista.map((c) => (
        <div key={c.id} style={{
          padding: "10px 0",
          borderTop: `1px solid ${cor.linha}`,
        }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: "rgb(var(--zm-ink))" }}>
            {c.sobre}
          </p>
          <p style={{ margin: "3px 0 8px", fontSize: 13, color: c.atrasado ? "rgb(var(--zm-perigo))" : cor.cinza }}>
            Prometido em {dia(c.criado_em)}
            {c.atrasado ? ` · era para responder até ${dia(c.vence_em)}` : ` · responder até ${dia(c.vence_em)}`}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {/* DOIS DESFECHOS, PORQUE ELES DIZEM COISAS DIFERENTES.
                "Respondi" = a família ouviu. "Não cabe mais" = o assunto morreu.
                Um botão só de "feito" misturaria os dois, e daqui a três meses
                ninguém saberia se a família foi respondida ou se a pendência
                foi varrida para debaixo do tapete. */}
            <button style={painel.botaoSec} disabled={ocupado === c.id}
                    onClick={() => fechar(c.id, "respondido")}>
              Já respondi isso
            </button>
            <button style={painel.botaoSec} disabled={ocupado === c.id}
                    onClick={() => fechar(c.id, "nao_cabe")}>
              Não cabe mais
            </button>
          </div>
        </div>
      ))}

      <p style={{ margin: "10px 0 0", fontSize: 13, color: cor.cinza, lineHeight: 1.45 }}>
        Fechar aqui não manda nada para a família. A resposta sai pelo campo de
        texto abaixo, quando você escrever.
      </p>
    </div>
  );
}
