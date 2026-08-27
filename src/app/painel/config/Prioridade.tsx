"use client";

import { useBusca, horaCurta } from "@/lib/buscar";
import { Falhou, Desde } from "../pecas";
import { useRecado } from "@/components/Dialogos";
import { useState } from "react";
import { painel, cor } from "../ui";

/**
 * A RÉGUA DE PRIORIDADE (0136).
 *
 * O QUE HAVIA
 *
 * Um número só, `servicos.prioridade`, que subia +15 a cada "não deu para
 * fazer". Nada mais no mundo levantava prioridade — nem a família que ligou
 * pedindo, nem a data de memória chegando, nem o contrato novo que nunca foi
 * lavado. E ele era mudo: "este veio na frente" sem dizer por quê.
 *
 * O ALCANCE AO LADO DO PESO É O PONTO DESTA TELA.
 *
 * Quando a régua nasceu, medido em 27/08, CINCO dos seis critérios alcançavam
 * zero: nenhum falecido tinha data, ninguém tinha pedido lavagem, nada tinha
 * sido adiado. Sem o número ao lado, quem mexesse num peso não veria efeito
 * nenhum e concluiria que a tela está quebrada. Ela não está — é o mundo que
 * ainda não tem aquele caso.
 *
 * Peso negativo REBAIXA de propósito: dá para mandar um caso para o fim da
 * fila sem desligá-lo.
 */
export default function Prioridade() {
  const recado = useRecado();
  const { fase, dados, erro, atualizadoEm, recarregar } = useBusca<any>("/api/config/prioridade");
  const [salvando, setSalvando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});

  async function salvar(c: any, campo: "peso" | "ativo", valor: any) {
    setSalvando(c.id);
    const r = await fetch("/api/config/prioridade", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, [campo]: valor }),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(null);
    if (!r?.ok) {
      recado.erro(r?.mensagem || r?.erro || "Não consegui salvar.");
      return;
    }
    setRascunho((x) => { const y = { ...x }; delete y[c.id]; return y; });
    recado.ok(`${c.rotulo}: ${campo === "ativo" ? (valor ? "ligado" : "desligado") : `peso ${valor}`}.`);
    recarregar();
  }

  if (fase === "carregando" && !dados) {
    return <p style={{ color: cor.cinza }}>Lendo a régua…</p>;
  }
  if (fase === "erro" && !dados) {
    return <Falhou mensagem={erro || "Não consegui ler a régua."} aoTentar={recarregar} />;
  }
  if (!dados) return null;

  const criterios = dados.criterios || [];

  return (
    <div>
      <section style={painel.card}>
        <strong style={{ color: cor.navy, fontSize: 17 }}>Régua de prioridade</strong>
        <p style={{ color: cor.cinza, fontSize: 15, margin: "8px 0 0", lineHeight: 1.55 }}>
          Quando a agenda é gerada, ela distribui por quadra e rua — mas alguns jazigos precisam
          furar essa ordem. Aqui você diz quais, e quanto cada motivo pesa. Os pontos <b>somam</b>:
          um jazigo nunca lavado (25) e atrasado duas semanas (2 × 10) fica com 45, na frente de um
          que ficou para depois uma vez (15).
        </p>
        <p style={{ color: cor.cinza, fontSize: 14, margin: "10px 0 0" }}>
          A coluna <b>alcança hoje</b> diz quantas lavagens da fila atual se encaixam em cada
          motivo. Motivo com zero não está quebrado — é um caso que ainda não aconteceu.
        </p>
      </section>

      {fase === "erro" && (
        <Falhou mensagem={erro || "Não consegui atualizar."} aoTentar={recarregar}
                parcial desde={horaCurta(atualizadoEm)} />
      )}

      {/* VAZIO NÃO É ZERO: quando a contagem falha, a coluna diz que não soube,
          em vez de mostrar um zero que passaria por "nenhum caso". */}
      {dados.leuOAlcance === false && (
        <p style={{ ...painel.card, color: "rgb(var(--zm-aviso))", fontSize: 15 }}>
          Não consegui contar quantas lavagens cada motivo alcança agora. Os pesos abaixo estão
          certos; o que falta é a contagem.
        </p>
      )}

      {(criterios || []).map((c: any) => {
        const emEdicao = rascunho[c.id] !== undefined;
        const valor = emEdicao ? rascunho[c.id] : String(c.peso);
        return (
          <section key={c.id} style={{ ...painel.card, opacity: c.ativo ? 1 : 0.62 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <strong style={{ color: cor.navy, fontSize: 16 }}>{c.rotulo}</strong>
                <p style={{ color: cor.cinza, fontSize: 14.5, margin: "5px 0 0", lineHeight: 1.5 }}>
                  {c.explicacao}
                </p>
              </div>

              <div style={{ textAlign: "right", minWidth: 108 }}>
                <div style={{ fontSize: 12, color: cor.cinza, marginBottom: 3 }}>alcança hoje</div>
                <div style={{
                  fontSize: 21, fontWeight: 700,
                  color: c.alcanca === null ? "rgb(var(--zm-aviso))"
                       : c.alcanca > 0 ? cor.navy : cor.cinza,
                }}>
                  {c.alcanca === null ? "?" : c.alcanca}
                </div>
                <div style={{ fontSize: 12, color: cor.cinza }}>
                  {c.alcanca === null ? "não contei"
                    : c.alcanca === 1 ? "lavagem" : "lavagens"}
                </div>
              </div>

              <div style={{ minWidth: 150 }}>
                <label style={painel.rotulo}>Peso</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="text" inputMode="numeric"
                    style={{ ...painel.input, width: 78, textAlign: "right" }}
                    value={valor}
                    onChange={(e) => setRascunho({ ...rascunho, [c.id]: e.target.value })}
                  />
                  <button
                    style={emEdicao ? painel.botaoMini : { ...painel.botaoMiniSec, opacity: 0.5 }}
                    disabled={!emEdicao || salvando === c.id}
                    onClick={() => salvar(c, "peso", rascunho[c.id])}
                  >
                    {salvando === c.id ? "…" : "Salvar"}
                  </button>
                </div>
                <button
                  style={{ ...painel.botaoMiniSec, marginTop: 8, width: "100%" }}
                  disabled={salvando === c.id}
                  onClick={() => salvar(c, "ativo", !c.ativo)}
                >
                  {c.ativo ? "Desligar este motivo" : "Ligar este motivo"}
                </button>
              </div>
            </div>
          </section>
        );
      })}

      <section style={{ ...painel.card, background: "rgb(var(--zm-brand-light))" }}>
        <p style={{ margin: 0, fontSize: 14.5, color: cor.navy, lineHeight: 1.55 }}>
          <b>Peso negativo empurra para o fim da fila</b>, em vez de desligar o motivo — útil
          quando um caso deve ser feito por último, e não deixar de ser considerado.
          A mudança vale na próxima vez que a agenda for gerada ou reorganizada; o que já está
          marcado não se mexe sozinho.
        </p>
      </section>

      <Desde hora={horaCurta(atualizadoEm)} />
    </div>
  );
}
