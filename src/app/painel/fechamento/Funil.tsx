"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { painel, cor } from "../ui";

/**
 * O FUNIL DO MÊS, E O BOTÃO QUE PODE RECUSAR.
 *
 * A pergunta que a responsável faz uma vez por mês é uma só: **posso fechar?**
 * Antes, a resposta estava espalhada por quatro telas e ninguém somava.
 *
 * DUAS DECISÕES DE DESENHO, E O PORQUÊ
 * ---------------------------------------------------------------------------
 * 1. A pendência não é um alerta vermelho — é uma LINHA CLICÁVEL que leva à
 *    tela onde se resolve. Alerta que não diz o que fazer só ensina a ignorar
 *    alerta.
 *
 * 2. O botão de fechar fica sempre visível, mesmo bloqueado, com o motivo
 *    embaixo. Esconder o botão faz a pessoa procurar; mostrar bloqueado com o
 *    motivo faz ela resolver.
 *
 * As contas não moram aqui. Vêm de `sureya_funil` e
 * `sureya_pendencias_da_competencia` (migration 0075) — regra de dinheiro em
 * dois lugares vira dois números diferentes, e quem descobre é a família.
 */

const dinheiro = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** A etapa em que o mês está: a última que ainda tem coisa parada. */
function tomDaEtapa(etapa: string, quantidade: number) {
  if (etapa === "fechado") return quantidade > 0 ? cor.teal : cor.cinza;
  if (etapa === "pronto para fechar") return quantidade > 0 ? cor.teal : cor.cinza;
  return quantidade > 0 ? cor.aviso : cor.cinza;
}

export function Funil({ competencia }: { competencia: string }) {
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [recusa, setRecusa] = useState("");
  const [motivo, setMotivo] = useState("");
  const [reabrindo, setReabrindo] = useState(false);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const r = await fetch(`/api/funil?competencia=${competencia}`).then((x) => x.json());
      if (!r.ok) throw new Error(r.erro || "falhou");
      setDados(r);
    } catch (e: any) {
      // FUNIL VAZIO SE LÊ COMO "ESTÁ TUDO RESOLVIDO".
      // Exatamente a leitura errada para uma falha — por isso o erro aparece em
      // vez de a tela mostrar zeros.
      setErro(e?.message || "não deu para carregar o funil");
      setDados(null);
    }
  }, [competencia]);

  useEffect(() => { carregar(); }, [carregar]);

  async function fechar(forcar: boolean) {
    setOcupado(true); setRecusa("");
    try {
      const r = await fetch("/api/funil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competencia, forcar }),
      }).then((x) => x.json());

      if (!r.ok) {
        // A recusa vem com o motivo dentro da mensagem da função.
        setRecusa(String(r.erro || "").replace(/^ha_pendencias:\s*/, ""));
      } else {
        await carregar();
      }
    } finally {
      setOcupado(false);
    }
  }

  async function reabrir() {
    if (!motivo.trim()) return;
    setOcupado(true);
    try {
      await fetch("/api/funil", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competencia, motivo }),
      });
      setMotivo(""); setReabrindo(false);
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  if (erro) {
    return (
      <div style={painel.card}>
        <strong style={{ color: cor.navy }}>Como está o mês</strong>
        <p style={{ color: cor.perigo, marginTop: 10 }}>
          Não deu para carregar: {erro}
        </p>
        <button style={painel.botaoMiniSec} onClick={carregar}>Tentar de novo</button>
      </div>
    );
  }

  if (!dados) {
    return (
      <div style={painel.card}>
        <strong style={{ color: cor.navy }}>Como está o mês</strong>
        <p style={{ color: cor.cinza, marginTop: 10 }}>Carregando…</p>
      </div>
    );
  }

  const etapas = (dados.etapas || []) as any[];
  const pendencias = (dados.pendencias || []) as any[];

  return (
    <div style={painel.card}>
      <strong style={{ color: cor.navy }}>Como está o mês</strong>

      {/* ---------- as cinco etapas ---------- */}
      <div style={{ marginTop: 12, display: "grid", gap: 1, background: cor.linha,
                    border: `1px solid ${cor.linha}`, borderRadius: 10, overflow: "hidden" }}>
        {etapas.map((e) => {
          const marco = e.etapa === "pronto para fechar" || e.etapa === "fechado";
          const qtd = Number(e.quantidade) || 0;   // bigint pode chegar como string
          const conteudo = (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                          gap: 12, padding: "11px 13px", background: cor.card }}>
              <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: 8, flexShrink: 0,
                                           background: tomDaEtapa(e.etapa, qtd) }} />
                <span style={{ color: "rgb(var(--zm-ink))", fontSize: 15 }}>{e.etapa}</span>
              </span>
              <span style={{ textAlign: "right", flexShrink: 0 }}>
                {marco ? (
                  <b style={{ color: qtd > 0 ? cor.teal : cor.cinza, fontSize: 15 }}>
                    {qtd > 0 ? "sim" : "ainda não"}
                  </b>
                ) : (
                  <>
                    <b style={{ fontSize: 15 }}>{qtd}</b>
                    {Number(e.valor) > 0 && (
                      <span style={{ color: cor.cinza, fontSize: 14 }}> · {dinheiro(e.valor)}</span>
                    )}
                  </>
                )}
              </span>
            </div>
          );
          // Etapa com coisa parada leva para onde se resolve. Etapa zerada não
          // é link: clicar e não encontrar nada é pior que não poder clicar.
          return !marco && qtd > 0
            ? <Link key={e.etapa} href={e.onde} style={{ textDecoration: "none" }}>{conteudo}</Link>
            : <div key={e.etapa}>{conteudo}</div>;
        })}
      </div>

      {/* ---------- o que falta para fechar ---------- */}
      {pendencias.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p style={{ margin: "0 0 8px", fontSize: 14, color: cor.cinza }}>
            Para fechar, falta resolver:
          </p>
          {pendencias.map((p) => (
            <Link key={p.tipo} href={p.onde_resolver}
                  style={{ textDecoration: "none", display: "block", marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10,
                            padding: "10px 12px", borderRadius: 9,
                            border: `1px solid ${cor.linha}`,
                            borderLeft: `3px solid ${cor.aviso}` }}>
                <span style={{ color: "rgb(var(--zm-ink))", fontSize: 14 }}>
                  {p.descricao} <b>({p.quantidade})</b>
                </span>
                <span style={{ color: cor.cinza, fontSize: 14, flexShrink: 0 }}>
                  {Number(p.valor) > 0 ? dinheiro(p.valor) : ""} →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* ---------- fechar, ou dizer por que não dá ---------- */}
      <div style={{ marginTop: 16, borderTop: `1px solid ${cor.linha}`, paddingTop: 14 }}>
        {dados.fechado ? (
          <>
            <p style={{ margin: 0, color: cor.teal, fontWeight: 700 }}>Mês fechado.</p>
            <p style={{ margin: "6px 0 10px", fontSize: 14, color: cor.cinza, lineHeight: 1.5 }}>
              Os números deste mês estão guardados como estavam no fechamento.
              Reabrir é possível e fica registrado, com o motivo.
            </p>
            {reabrindo ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  style={{ ...painel.input, width: "auto", flex: "1 1 220px" }}
                  placeholder="Por que está reabrindo?"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
                <button style={painel.botaoMiniPerigo} onClick={reabrir}
                        disabled={ocupado || !motivo.trim()}>
                  {ocupado ? "Reabrindo…" : "Confirmar reabertura"}
                </button>
                <button style={painel.botaoMiniSec} onClick={() => setReabrindo(false)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <button style={painel.botaoMiniSec} onClick={() => setReabrindo(true)}>
                Reabrir o mês
              </button>
            )}
          </>
        ) : (
          <>
            <button
              style={dados.podeFechar ? painel.botao : painel.botaoSec}
              onClick={() => fechar(false)}
              disabled={ocupado || !dados.podeFechar}
            >
              {ocupado ? "Fechando…" : "Fechar o mês"}
            </button>

            {/* O BOTÃO BLOQUEADO SEM MOTIVO É UMA PORTA TRANCADA SEM PLACA. */}
            {!dados.podeFechar && (
              <p style={{ margin: "10px 0 0", fontSize: 14, color: cor.cinza, lineHeight: 1.5 }}>
                {pendencias.length > 0
                  ? "Resolva os itens acima e o botão libera."
                  : "Este mês ainda está em andamento. Só dá para fechar depois que ele acabar."}
              </p>
            )}

            {recusa && (
              <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 9,
                            border: `1px solid ${cor.aviso}`, fontSize: 14, lineHeight: 1.5 }}>
                <b>Não fechei:</b> {recusa}
                {pendencias.length > 0 && (
                  <>
                    <p style={{ margin: "10px 0 6px", color: cor.cinza }}>
                      Se você já sabe disso e quer fechar assim mesmo, a pendência
                      fica registrada na observação do fechamento.
                    </p>
                    <button style={painel.botaoMiniSec} onClick={() => fechar(true)} disabled={ocupado}>
                      Fechar mesmo assim
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
