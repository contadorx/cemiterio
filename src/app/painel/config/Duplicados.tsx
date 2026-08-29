"use client";

import { useCallback, useEffect, useState } from "react";
import { painel, cor } from "../ui";
import { useConfirmar, useRecado } from "@/components/Dialogos";

/**
 * A MESMA PESSOA, CADASTRADA DUAS VEZES (0145).
 *
 * ---------------------------------------------------------------------------
 * DE ONDE VIERAM
 * ---------------------------------------------------------------------------
 * O WhatsApp sempre manda o número com o DDI — `5511988758966`. Medido em
 * 29/08, havia 46 clientes cadastrados SEM o 55, e a busca comparava por
 * igualdade exata: nenhum deles era reconhecido. Escreviam, viravam lead,
 * alguém cadastrava de novo — e nascia a cópia, com o 55, numa família nova.
 *
 * A busca já foi consertada, então a torneira está fechada. Estes 11 pares são
 * o que ficou de antes.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO EXISTE "LIMPAR TUDO"
 * ---------------------------------------------------------------------------
 * Fundir apaga um cadastro. Doze das vinte e nove referências a `clientes` são
 * ON DELETE CASCADE — entre elas conversas, mensagens e comprovantes. Um botão
 * que resolvesse os onze de uma vez apagaria histórico de família com base num
 * palpite meu sobre qual dos dois é o bom.
 *
 * Então: um par por vez, com o que cada lado carrega na tela, e o ensaio antes.
 */

type Lado = {
  cliente_id: string; nome: string; telefone: string;
  familia: string | null; jazigos: number; lancamentos: number;
  comprovantes: number; conversas: number; mensagens: number; criado_em: string;
};
type Par = { numero: string; lados: Lado[]; sugerido: string | null };

function Carrega({ l }: { l: Lado }) {
  const itens = [
    l.jazigos ? `${l.jazigos} ${l.jazigos === 1 ? "jazigo" : "jazigos"}` : null,
    l.lancamentos ? `${l.lancamentos} no razão` : null,
    l.comprovantes ? `${l.comprovantes} comprovante${l.comprovantes > 1 ? "s" : ""}` : null,
    l.conversas ? `${l.conversas} conversa${l.conversas > 1 ? "s" : ""}` : null,
    l.mensagens ? `${l.mensagens} mensagem${l.mensagens > 1 ? "ns" : ""}` : null,
  ].filter(Boolean);
  return (
    <span style={{ fontSize: 13, color: cor.cinza }}>
      {itens.length ? itens.join(" · ") : "não carrega nada"}
    </span>
  );
}

export default function Duplicados() {
  const perguntar = useConfirmar();
  const recado = useRecado();
  const [pares, setPares] = useState<Par[] | null>(null);
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [previa, setPrevia] = useState<Record<string, { o_que: string; quantos: number }[]>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/duplicados").then((x) => x.json()).catch(() => null);
    if (!r?.ok) { setPares(null); return; }
    setPares(r.pares as Par[]);
    // O palpite do servidor entra como marcação inicial, e dá para trocar.
    const e: Record<string, string> = {};
    for (const p of r.pares as Par[]) if (p.sugerido) e[p.numero] = p.sugerido;
    setEscolha((x) => ({ ...e, ...x }));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function agir(p: Par, ensaio: boolean) {
    const fica = escolha[p.numero];
    const sai = (p.lados || []).find((l) => l.cliente_id !== fica)?.cliente_id;
    if (!fica || !sai) return;

    const oQueSai = (p.lados || []).find((l) => l.cliente_id === sai)!;
    if (!ensaio) {
      const ok = await perguntar({
        oQue: `Juntar "${oQueSai.nome}" dentro de "${(p.lados || []).find((l) => l.cliente_id === fica)!.nome}"?`,
        efeito: "Tudo o que está no cadastro que sai — conversas, comprovantes, razão — passa "
              + "para o que fica, e o cadastro que sai é apagado. Não dá para desfazer.",
        confirmar: "Juntar", tom: "perigo",
      });
      if (!ok) return;
    }

    setOcupado(p.numero);
    try {
      const r = await fetch("/api/duplicados", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fica, sai, ensaio }),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { recado.erro(r?.mensagem || "Não consegui agora."); return; }
      if (ensaio) { setPrevia((x) => ({ ...x, [p.numero]: r.movido || [] })); return; }
      setPrevia((x) => { const y = { ...x }; delete y[p.numero]; return y; });
      await carregar();
    } finally { setOcupado(null); }
  }

  if (pares === null) return <p style={{ color: cor.cinza }}>Procurando cadastros repetidos…</p>;

  if (pares.length === 0) {
    return (
      <div style={painel.card}>
        <div style={painel.rotulo}>Cadastros repetidos</div>
        <p style={{ fontSize: 14, color: cor.cinza, margin: 0, lineHeight: 1.5 }}>
          Nenhum número aparece em dois cadastros. A busca por telefone agora ignora a
          diferença do <b>55</b>, então novos duplicados não nascem mais por esse caminho.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={painel.card}>
        <div style={painel.rotulo}>
          Cadastros repetidos · <b>{pares.length}</b>
        </div>
        <p style={{ fontSize: 14, color: cor.cinza, margin: 0, lineHeight: 1.55 }}>
          O mesmo número em dois cadastros. Nasceram porque o WhatsApp manda o número com{" "}
          <b>55</b> e o cadastro estava sem — a pessoa escrevia, virava desconhecida, e era
          cadastrada de novo. <b>Isso já foi consertado</b>; estes são os que ficaram.
          <br /><br />
          Escolha qual cadastro <b>fica</b>. Tudo o que estiver no outro — conversas,
          comprovantes, razão — passa para ele, e o outro é apagado.{" "}
          <b>Não dá para desfazer</b>, então use “O que vai mudar” antes.
        </p>
      </div>

      {pares.map((p) => {
        const fica = escolha[p.numero];
        return (
          <div key={p.numero} style={painel.card}>
            <div style={{ fontSize: 12.5, color: cor.cinza, marginBottom: 8 }}>
              {p.numero}
            </div>

            {(p.lados || []).map((l) => (
              <label key={l.cliente_id} style={{
                display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px",
                borderRadius: 10, marginBottom: 8, cursor: "pointer",
                border: `1px solid ${fica === l.cliente_id ? "rgb(var(--zm-teal) / 0.6)" : cor.linha}`,
                background: fica === l.cliente_id ? "rgb(var(--zm-teal) / 0.07)" : cor.card,
              }}>
                <input type="radio" name={`p-${p.numero}`} checked={fica === l.cliente_id}
                       onChange={() => {
                         setEscolha((x) => ({ ...x, [p.numero]: l.cliente_id }));
                         setPrevia((x) => { const y = { ...x }; delete y[p.numero]; return y; });
                       }}
                       style={{ marginTop: 3 }} />
                <span style={{ minWidth: 0 }}>
                  <b style={{ color: "rgb(var(--zm-ink))" }}>{l.nome}</b>
                  <span style={{ color: cor.cinza }}> · {l.telefone}</span>
                  <br />
                  <span style={{ fontSize: 13.5, color: cor.cinza }}>
                    família {l.familia || "(nenhuma)"} · </span>
                  <Carrega l={l} />
                  {fica === l.cliente_id && (
                    <b style={{ display: "block", fontSize: 13, color: "rgb(var(--zm-teal))", marginTop: 3 }}>
                      este fica
                    </b>
                  )}
                </span>
              </label>
            ))}

            {previa[p.numero] && (
              <div style={{
                padding: "10px 12px", borderRadius: 10, marginBottom: 8,
                border: `1px solid ${cor.linha}`, background: "rgb(var(--zm-ink) / 0.03)",
              }}>
                <div style={{ fontSize: 12.5, color: cor.cinza, marginBottom: 4 }}>
                  O que vai passar para o cadastro que fica — <b>nada foi movido ainda</b>
                </div>
                <div style={{ fontSize: 14 }}>
                  {(previa[p.numero] || []).filter((m) => m.quantos > 0)
                    .map((m) => `${m.quantos} ${m.o_que}`).join(" · ")
                    || "nada — o cadastro que sai está vazio"}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={painel.botaoSec} disabled={ocupado === p.numero || !fica}
                      onClick={() => agir(p, true)}>
                O que vai mudar
              </button>
              <button style={painel.botaoPerigo} disabled={ocupado === p.numero || !fica}
                      onClick={() => agir(p, false)}>
                {ocupado === p.numero ? "…" : "Juntar num só"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
