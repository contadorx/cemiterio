"use client";

import { useCallback, useEffect, useState } from "react";
import { painel, cor } from "../ui";
import { useRecado } from "@/components/Dialogos";

/**
 * DE QUEM É CADA PIX — A TRIANGULAÇÃO
 *
 * O extrato de outubro trouxe 248 Pix de 196 nomes diferentes. Pelo nome do
 * cadastro, 69 casam e 127 não — porque quem paga muitas vezes não é quem está
 * cadastrado, e porque o banco corta o nome em 21 letras.
 *
 * Então a tela não pede que você procure 196 famílias. Ela traz um palpite por
 * entrada, com o motivo escrito, e você lê e confirma. Quando confirma, o
 * sistema GUARDA de quem é aquele nome: no mês que vem ele já vem sabendo.
 *
 * O palpite nunca grava sozinho. Antes de creditar, o botão mostra a que meses
 * o dinheiro vai — e aí sim você confirma.
 */
export default function Triangular({ aoMudar }: { aoMudar?: () => void }) {
  const recado = useRecado();
  const [d, setD] = useState<any>(null);
  const [meses, setMeses] = useState(3);
  const [carregando, setCarregando] = useState(false);
  const [forca, setForca] = useState<string>("todas");
  const [aberto, setAberto] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await fetch(`/api/financeiro/conciliar/triangular?meses=${meses}`)
      .then((x) => x.json()).catch(() => null);
    setCarregando(false);
    if (r?.ok) setD(r); else recado.erro("Não consegui montar os palpites.");
  }, [meses, recado]);

  useEffect(() => { if (aberto) carregar(); }, [aberto, carregar]);

  const money = (n: number) => `R$ ${Number(n || 0).toFixed(2)}`;
  const res = d?.resumo;

  const lista = ((d?.entradas as any[]) || []).filter((e) => {
    if (forca === "todas") return true;
    if (forca === "sem") return !e.palpite;
    return e.palpite?.forca === forca;
  });

  return (
    <div style={{ ...painel.card, borderLeft: `4px solid ${cor.navy}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
                    gap: 10, flexWrap: "wrap" }}>
        <strong style={{ color: cor.navy, fontSize: 17 }}>De quem é cada Pix</strong>
        <button style={painel.botaoMiniSec} onClick={() => setAberto(!aberto)}>
          {aberto ? "fechar" : "abrir"}
        </button>
      </div>

      {!aberto && (
        <p style={{ margin: "8px 0 0", color: cor.cinza, fontSize: 15 }}>
          Palpites para as entradas do banco que ainda não têm dono.
        </p>
      )}

      {aberto && (
        <>
          <p style={{ margin: "8px 0 12px", color: cor.cinza, fontSize: 15, lineHeight: 1.6 }}>
            Cada linha traz um palpite e o motivo dele. Você lê e confirma — e quando
            confirma, eu guardo de quem é esse nome do extrato para a próxima vez.
          </p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
                        marginBottom: 12 }}>
            <select style={{ ...painel.input, width: "auto" }} value={meses}
                    onChange={(e) => setMeses(Number(e.target.value))}>
              <option value={1}>Último mês</option>
              <option value={3}>Últimos 3 meses</option>
              <option value={12}>Último ano</option>
            </select>
            <button style={painel.botaoSec} disabled={carregando} onClick={carregar}>
              {carregando ? "Procurando…" : "Atualizar"}
            </button>
            {d?.licoesGuardadas > 0 && (
              <span style={{ fontSize: 14, color: cor.cinza }}>
                {d.licoesGuardadas} nome(s) já aprendido(s)
              </span>
            )}
          </div>

          {!d && <p style={{ color: cor.cinza }}>Carregando…</p>}

          {res && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))",
                            gap: 8, marginBottom: 12 }}>
                <Ficha r="sem dono" v={String(res.semDono)} s={money(res.valorSemDono)} c={cor.navy} />
                <Ficha r="com palpite" v={String(res.comPalpite)} s={money(res.valorComPalpite)} c={cor.teal} />
                <Ficha r="por comprovante" v={String(res.porComprovante)} s="a fonte mais forte" c={cor.teal} />
                <Ficha r="por lição" v={String(res.porLicao)} s="já foi dito antes" c={cor.teal} />
                <Ficha r="pelo nome" v={String(res.porNome)} s="confira este" c="rgb(var(--zm-aviso))" />
                <Ficha r="sem palpite" v={String(res.semPalpite)} s="precisa de você" c={cor.cinza} />
              </div>

              <div data-filtros style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {(["todas", "comprovante", "licao", "nome", "sem"] as const).map((f) => (
                  <button key={f}
                    style={f === forca ? painel.botaoMini : painel.botaoMiniSec}
                    onClick={() => setForca(f)}>
                    {f === "todas" ? "todas" : f === "sem" ? "sem palpite"
                      : f === "licao" ? "por lição" : f === "nome" ? "pelo nome" : "por comprovante"}
                  </button>
                ))}
              </div>
            </>
          )}

          {d && lista.length === 0 && (
            <p style={{ color: cor.cinza, fontSize: 15, margin: 0 }}>
              {d.entradas?.length ? "Nenhuma entrada neste filtro." : "Nenhuma entrada esperando dono. 🌿"}
            </p>
          )}

          {(lista || []).map((e: any) => (
            <Linha key={e.id} e={e} aoConfirmar={() => { carregar(); aoMudar?.(); }} />
          ))}
        </>
      )}
    </div>
  );
}

const TOM: Record<string, { cor: string; selo: string }> = {
  comprovante: { cor: "rgb(var(--zm-positivo))", selo: "comprovante" },
  licao:       { cor: "rgb(var(--zm-positivo))", selo: "já aprendido" },
  nome:        { cor: "rgb(var(--zm-aviso))",    selo: "só pelo nome" },
};

function Linha({ e, aoConfirmar }: { e: any; aoConfirmar: () => void }) {
  const recado = useRecado();
  const [plano, setPlano] = useState<any>(null);
  const [debitos, setDebitos] = useState<any[] | null>(null);
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [aprender, setAprender] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const money = (n: number) => `R$ ${Number(n || 0).toFixed(2)}`;
  const p = e.palpite;
  const tom = p ? TOM[p.forca] : null;

  /**
   * SUGERIR OS MESES: do mais antigo até o dinheiro acabar.
   *
   * É o que a família faz quando paga o anual — ela não escolhe meses no meio.
   * Mas é SUGESTÃO: os marcadores ficam abertos para corrigir antes de gravar.
   */
  async function abrirMeses() {
    if (!p?.clienteId) return;
    setOcupado(true);
    const r = await fetch(`/api/financeiro/debitos?cliente=${p.clienteId}`)
      .then((x) => x.json()).catch(() => null);
    setOcupado(false);
    const lista = (r?.debitos || []) as any[];
    setDebitos(lista);
    const m: Record<string, boolean> = {};
    let resta = Number(e.valor);
    for (const d of lista) {
      if (resta <= 0.004) break;
      m[d.lancamento_id] = true;
      resta -= Number(d.em_aberto);
    }
    setMarcados(m);
    setPlano(null);
  }

  const escolhidos = Object.keys(marcados).filter((k) => marcados[k]);
  const totalEscolhido = ((debitos as any[]) || [])
    .filter((d) => marcados[d.lancamento_id])
    .reduce((s, d) => s + Number(d.em_aberto), 0);

  async function ensaiar() {
    setOcupado(true);
    const r = await fetch("/api/financeiro/conciliar/triangular", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entradaId: e.id, clienteId: p.clienteId,
        debitos: escolhidos.length ? escolhidos : null,
        ensaio: true,
      }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (!r?.ok) return recado.erro("Não consegui ensaiar: " + (r?.erro || "erro"));
    setPlano(r);
  }

  async function gravar() {
    setOcupado(true);
    const r = await fetch("/api/financeiro/conciliar/triangular", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entradaId: e.id, clienteId: p.clienteId,
        debitos: escolhidos.length ? escolhidos : null,
        ensaio: false,
        aprender, nomeCru: e.remetente, familiaId: p.familiaId || null,
      }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (!r?.ok) return recado.erro("Não gravei: " + (r?.erro || "erro"));
    const nAprend = r.aprendeu?.ok ? " Nome guardado." : "";
    recado.ok(`Creditado para ${p.familia}. ${r.quitados} mês(es) quitado(s).${nAprend}`);
    aoConfirmar();
  }

  return (
    <div style={{ padding: "12px 0", borderTop: `1px solid ${cor.linha}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <b style={{ color: cor.navy, fontSize: 18 }}>{money(e.valor)}</b>
            <span style={{ color: cor.cinza, fontSize: 14 }}>
              {new Date(e.data + "T12:00:00").toLocaleDateString("pt-BR")}
            </span>
            {e.remetente && (
              <span style={{ fontSize: 14, color: cor.navy }}>de <b>{e.remetente}</b></span>
            )}
          </div>

          {p && tom && (
            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5,
                             color: tom.cor, border: `1px solid ${tom.cor}`, borderRadius: 999,
                             padding: "1px 8px" }}>
                {tom.selo}
              </span>
              <div style={{ fontSize: 15, color: cor.navy, marginTop: 4 }}>
                é da família <b>{p.familia}</b>
                {p.cliente && p.cliente !== p.familia && ` · creditar em ${p.cliente}`}
              </div>
              <div style={{ fontSize: 14, color: cor.cinza }}>porque {p.porque}</div>
            </div>
          )}

          {!p && (
            <div style={{ fontSize: 14, color: cor.cinza, marginTop: 6 }}>
              {e.semPessoa
                ? "Achei a família, mas ela não tem ninguém cadastrado para receber o crédito."
                : "Nenhum comprovante com este valor, nenhuma lição guardada e nenhum nome parecido. Identifique na lista abaixo."}
            </div>
          )}
        </div>

        {p && !debitos && (
          <button style={painel.botao} disabled={ocupado} onClick={abrirMeses}>
            {ocupado ? "…" : "A que meses se refere?"}
          </button>
        )}
      </div>

      {/* ---------------- os meses, antes de gravar ---------------- */}
      {p && debitos && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10,
                      background: "rgb(var(--zm-fundo))" }}>
          {debitos.length === 0 ? (
            <p style={{ margin: 0, fontSize: 15, color: cor.cinza }}>
              Esta família não tem nada em aberto — o valor entra a favor dela, para as próximas.
            </p>
          ) : (
            <>
              <div style={painel.rotulo}>
                Marquei do mês mais antigo até o dinheiro acabar. Corrija se não for isso.
              </div>
              {(debitos || []).map((dd: any) => (
                <label key={dd.lancamento_id}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0",
                           borderTop: `1px solid ${cor.linha}`, cursor: "pointer" }}>
                  <input type="checkbox" style={{ width: 19, height: 19 }}
                         checked={!!marcados[dd.lancamento_id]}
                         onChange={(ev) => { setPlano(null);
                           setMarcados({ ...marcados, [dd.lancamento_id]: ev.target.checked }); }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ color: cor.navy }}>
                      {dd.competencia
                        ? new Date(String(dd.competencia) + "T12:00:00")
                            .toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })
                        : "sem competência"}
                      {dd.jazigo && dd.jazigo !== "—" && ` · ${dd.jazigo}`}
                    </span>
                    <div style={{ fontSize: 13, color: cor.cinza }}>{dd.descricao}</div>
                  </div>
                  <b style={{ color: cor.navy }}>{money(dd.em_aberto)}</b>
                </label>
              ))}

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8,
                            fontSize: 15, color: cor.cinza }}>
                <span>{escolhidos.length} mês(es) marcado(s)</span>
                <b style={{ color: cor.navy }}>{money(totalEscolhido)}</b>
              </div>
              {Math.abs(Number(e.valor) - totalEscolhido) > 0.01 && (
                <p style={{ fontSize: 14, color: "rgb(var(--zm-aviso))",
                            background: "rgb(var(--zm-aviso) / 0.08)", padding: 9,
                            borderRadius: 8, margin: "8px 0 0" }}>
                  {Number(e.valor) > totalEscolhido
                    ? `Entrou ${money(Number(e.valor) - totalEscolhido)} a mais — vira crédito da família.`
                    : `Falta ${money(totalEscolhido - Number(e.valor))} para quitar tudo que está marcado.`}
                </p>
              )}
            </>
          )}

          {/* O ENSAIO: o que vai ser escrito, antes de escrever. */}
          {plano && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${cor.linha}` }}>
              <div style={painel.rotulo}>Se você confirmar, eu gravo isto:</div>
              {((plano.meses as any[]) || []).map((m: any, i: number) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between",
                                      fontSize: 15, padding: "3px 0" }}>
                  <span style={{ color: cor.navy }}>
                    {m.competencia
                      ? new Date(String(m.competencia) + "T12:00:00")
                          .toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })
                      : m.descricao}
                    {m.quitou ? " · quita" : " · abate parte"}
                  </span>
                  <b style={{ color: cor.teal }}>{money(m.valor)}</b>
                </div>
              ))}
              {plano.sobra > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15,
                              padding: "3px 0", color: cor.cinza }}>
                  <span>sobra, fica como crédito</span>
                  <b>{money(plano.sobra)}</b>
                </div>
              )}
            </div>
          )}

          {e.remetente && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12,
                            fontSize: 14, color: cor.cinza, cursor: "pointer" }}>
              <input type="checkbox" checked={aprender}
                     onChange={(ev) => setAprender(ev.target.checked)} />
              guardar que “{e.remetente}” é desta família
            </label>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {!plano ? (
              <button style={painel.botao} disabled={ocupado} onClick={ensaiar}>
                {ocupado ? "…" : "Ver o que vai acontecer"}
              </button>
            ) : (
              <button style={painel.botao} disabled={ocupado} onClick={gravar}>
                {ocupado ? "Gravando…" : "Confirmar e creditar"}
              </button>
            )}
            <button style={painel.botaoSec} disabled={ocupado}
                    onClick={() => { setDebitos(null); setPlano(null); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Ficha({ r, v, s, c }: { r: string; v: string; s: string; c: string }) {
  return (
    <div style={{ border: `1px solid ${cor.linha}`, borderTop: `3px solid ${c}`,
                  borderRadius: 10, padding: "8px 10px" }}>
      <div style={{ fontSize: 12, color: "#475569", textTransform: "uppercase",
                    letterSpacing: 0.4 }}>{r}</div>
      <div style={{ fontSize: 21, fontWeight: 700, color: c }}>{v}</div>
      <div style={{ fontSize: 12, color: cor.cinza }}>{s}</div>
    </div>
  );
}
