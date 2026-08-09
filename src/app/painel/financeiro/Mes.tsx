"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { painel, cor } from "../ui";
import { mesOperacao } from "@/lib/vencimento";

/**
 * O MÊS — uma tela só, um seletor só.
 *
 * As cinco perguntas do fechamento, na ordem em que se pergunta:
 *   1. quanto entrou (e quanto sobrou)
 *   2. quem pagou
 *   3. quem não pagou — e como estava NO FIM DAQUELE MÊS, não hoje
 *   4. o que ficou para trás (limpeza feita e não cobrada é dinheiro no chão)
 *   5. o que reajustar
 *
 * Antes isto exigia ~9 telas e 15+ cliques, e o mês era informado quatro vezes
 * em quatro controles que não se conversavam. As abas antigas continuam onde
 * estavam: esta tela não substitui nenhuma, ela responde a pergunta e aponta
 * para o lugar de agir.
 */

const money = (n: number) => `R$ ${Number(n || 0).toFixed(2)}`;
const dataBR = (s: string | null) =>
  s ? String(s).slice(0, 10).split("-").reverse().join("/") : "—";

function nomeDoMes(m: string) {
  const [a, mm] = m.split("-").map(Number);
  return new Date(a, mm - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}
function mesVizinho(m: string, passo: number) {
  const [a, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(a, mm - 1 + passo, 1));
  return d.toISOString().slice(0, 7);
}

export default function Mes() {
  const [mes, setMes] = useState(mesOperacao());
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await fetch(`/api/financeiro/mes?mes=${mes}`)
      .then((x) => x.json()).catch(() => null);
    setCarregando(false);
    if (r?.ok) { setD(r); setErro(""); }
    else setErro(r?.erro || "não consegui carregar o mês");
  }, [mes]);
  useEffect(() => { carregar(); }, [carregar]);

  if (erro) {
    return (
      <div style={{ ...painel.card, borderLeft: "4px solid #b45309" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>Não consegui montar o mês.</p>
        <p style={{ margin: "8px 0 0", color: cor.cinza }}>{erro}</p>
      </div>
    );
  }

  const podeAvancar = mes < mesOperacao();

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* ---- o seletor. UM só, e vale para a tela inteira ---- */}
      <div style={{ ...painel.card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button style={painel.botaoMiniSec} onClick={() => setMes(mesVizinho(mes, -1))}>← anterior</button>
        <input type="month" value={mes} max={mesOperacao()}
               onChange={(e) => e.target.value && setMes(e.target.value)}
               style={{ ...painel.input, width: 170 }} />
        <button style={painel.botaoMiniSec} disabled={!podeAvancar}
                onClick={() => podeAvancar && setMes(mesVizinho(mes, 1))}>
          seguinte →
        </button>
        {mes !== mesOperacao() && (
          <button style={painel.botaoMiniSec} onClick={() => setMes(mesOperacao())}>este mês</button>
        )}
        <span style={{ marginLeft: "auto", color: cor.cinza, fontSize: 15, textTransform: "capitalize" }}>
          {nomeDoMes(mes)}
          {d && !d.fechado && (
            <b style={{ color: "#b45309", textTransform: "none" }}> · parcial, o mês ainda não acabou</b>
          )}
        </span>
      </div>

      {carregando && <p style={{ color: cor.cinza }}>Carregando…</p>}
      {!carregando && d && (
        <>
          {/* ================= 1. O DINHEIRO ================= */}
          <div style={{ ...painel.card, background: cor.navy }}>
            <strong style={{ fontSize: 18, color: "#fff" }}>Como foi o mês</strong>
            <div style={{ display: "grid", gap: 14, marginTop: 12,
                          gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
              <Big rot="Entrou" val={money(d.dinheiro.entrou)} cor="#4ade80" />
              <Big rot="Custos" val={money(d.dinheiro.custos)} cor="#fca5a5" />
              <Big rot="Sobrou" val={money(d.dinheiro.resultado)}
                   cor={d.dinheiro.resultado >= 0 ? "#fff" : "#fca5a5"} />
              <Big rot="Ficou devendo" val={money(d.familias.totalDevendo)}
                   cor={d.familias.totalDevendo > 0 ? "#fbbf24" : "#fff"}
                   sub={`${d.familias.devendo.length} família(s)`} />
            </div>
            <p style={{ color: "#cbd5e1", fontSize: 14, margin: "12px 0 0", lineHeight: 1.5 }}>
              <b>{d.trabalho.limpezas}</b> limpeza(s) em <b>{d.trabalho.familiasAtendidas}</b> família(s)
              {d.trabalho.avulsas > 0 ? ` · ${d.trabalho.avulsas} avulsa(s)` : ""} ·
              faturado {money(d.dinheiro.faturado)}
              {d.dinheiro.aConferir > 0 ? ` · ${money(d.dinheiro.aConferir)} a conferir` : ""}
            </p>
          </div>

          {/* a diferença que a tela antiga mandava você digitar */}
          {d.dinheiro.caixaIndisponivel ? (
            <Aviso tom="atencao">
              Não consegui ler os lançamentos do caixa, então <b>custos e resultado estão sem eles</b>.
              O que entrou das famílias está certo.
            </Aviso>
          ) : (
            <Aviso tom="neutro">
              O <b>Entrou</b> é o que as famílias pagaram (a conta delas), e é dele que sai o
              <b> Sobrou</b>. Os lançamentos de entrada do caixa <b>não são somados por cima</b>:
              se você lança ali o mesmo dinheiro, somar os dois dobraria a receita.
              {d.dinheiro.entradaForaDasFamilias > 0.005 && (
                <> Neste mês há <b>{money(d.dinheiro.entradaForaDasFamilias)}</b> lançados como entrada
                além do que veio das famílias — se for receita de outra natureza, ela está de fora
                desta conta de propósito.</>
              )}
            </Aviso>
          )}

          {/* custos por categoria */}
          {d.dinheiro.porCategoria.length > 0 && (
            <div style={painel.card}>
              <b style={{ color: cor.navy }}>No que saiu o dinheiro</b>
              <table style={tabela}>
                <tbody>
                  {d.dinheiro.porCategoria.map((c: any) => (
                    <tr key={c.nome}>
                      <td style={td}>{c.nome}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{money(c.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ================= 2. O QUE FICOU PARA TRÁS ================= */}
          {(d.pendencias.semCobranca.length > 0
            || d.pendencias.semFoto.length > 0
            || d.pendencias.comprovantesAConferir > 0
            || (d.pendencias.entradasSemDono || 0) > 0) && (
            <div style={{ ...painel.card, border: "2px solid #f59e0b", background: "#fffbeb" }}>
              <b style={{ color: "#92400e", fontSize: 18 }}>O que ficou para trás</b>

              {d.pendencias.semCobranca.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <b style={{ color: "#7f1d1d" }}>
                    {d.pendencias.semCobranca.length} limpeza(s) feita(s) e NÃO cobrada(s)
                  </b>
                  <p style={{ margin: "4px 0 6px", color: "#78350f", fontSize: 14, lineHeight: 1.5 }}>
                    O serviço saiu e nada entrou na conta da família. É dinheiro no chão — e era o
                    tipo de coisa que só aparecia meses depois, se alguém cruzasse as duas tabelas.
                  </p>
                  <ul style={lista}>
                    {d.pendencias.semCobranca.slice(0, 8).map((s: any) => (
                      <li key={s.id}>
                        {dataBR(s.data)} · {s.familia}
                        {s.valor != null ? ` · ${money(s.valor)}` : " · sem valor definido"}
                      </li>
                    ))}
                    {d.pendencias.semCobranca.length > 8 && (
                      <li>e mais {d.pendencias.semCobranca.length - 8}…</li>
                    )}
                  </ul>
                </div>
              )}

              {d.pendencias.semFoto.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <b style={{ color: "#7f1d1d" }}>
                    {d.pendencias.semFoto.length} limpeza(s) fechada(s) sem a foto do depois
                  </b>
                  <p style={{ margin: "4px 0 0", color: "#78350f", fontSize: 14, lineHeight: 1.5 }}>
                    A regra da casa é que sem a foto o serviço não fecha. Estas passaram por outro
                    caminho — vale conferir antes que a família pergunte.
                  </p>
                </div>
              )}

              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {d.pendencias.comprovantesAConferir > 0 && (
                  <Link href="/painel/financeiro?aba=conferir" style={painel.botaoMiniSec}>
                    {d.pendencias.comprovantesAConferir} comprovante(s) a conferir
                  </Link>
                )}
                {(d.pendencias.entradasSemDono || 0) > 0 && (
                  <Link href="/painel/financeiro?aba=conferir" style={painel.botaoMiniSec}>
                    {d.pendencias.entradasSemDono} entrada(s) sem dono
                    {d.pendencias.valorSemDono ? ` · ${money(d.pendencias.valorSemDono)}` : ""}
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* ================= 3. QUEM NÃO PAGOU ================= */}
          <div style={painel.card}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <b style={{ fontSize: 18, color: cor.navy }}>Quem estava devendo no fim do mês</b>
              <span style={{ marginLeft: "auto", fontWeight: 800, color: "#dc2626", fontSize: 20 }}>
                {money(d.familias.totalDevendo)}
              </span>
            </div>
            <p style={{ margin: "4px 0 10px", color: cor.cinza, fontSize: 14, lineHeight: 1.5 }}>
              Esta é a foto de <b>{dataBR(d.fim)}</b> — não a de hoje. Quem pagou depois aparece aqui
              do mesmo jeito, porque naquele dia estava em aberto.
            </p>

            {d.familias.devendo.length === 0 ? (
              <p style={{ margin: 0, color: cor.teal }}>Ninguém devendo no fim deste mês. 🌿</p>
            ) : (
              <table style={tabela}>
                <thead>
                  <tr>
                    <th style={th}>Família</th>
                    <th style={{ ...th, textAlign: "right" }}>Em aberto</th>
                    <th style={th}>Último pagamento</th>
                    <th style={th}>Cobrança</th>
                  </tr>
                </thead>
                <tbody>
                  {d.familias.devendo.map((f: any) => (
                    <tr key={f.clienteId}>
                      <td style={td}>
                        <Link href={`/painel/clientes/${f.clienteId}`}
                              style={{ color: cor.navy, fontWeight: 600 }}>
                          {f.nome}
                        </Link>
                      </td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#dc2626" }}>
                        {money(f.valor)}
                      </td>
                      <td style={td}>
                        {f.ultimoPagamento
                          ? `${dataBR(f.ultimoPagamento)}${f.diasSemPagar != null ? ` (${f.diasSemPagar}d)` : ""}`
                          : "nunca pagou"}
                      </td>
                      <td style={{ ...td, fontSize: 14 }}>
                        {f.naoCobrar ? (
                          <span style={{ color: cor.cinza }}>não cobrar (escolha sua)</span>
                        ) : f.reguaQueimada ? (
                          <span style={{ color: "#b91c1c", fontWeight: 700 }}>
                            régua no teto — a cobrança automática parou
                          </span>
                        ) : f.envioDesligado ? (
                          <span style={{ color: "#b45309" }}>envio desligado</span>
                        ) : (
                          <span style={{ color: cor.cinza }}>
                            {f.cobrancaNivel} de {f.maxLembretes} lembrete(s)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {d.familias.devendo.some((f: any) => f.reguaQueimada) && (
              <Aviso tom="atencao">
                Quem está com a <b>régua no teto</b> parou de receber cobrança automática. Registrar um
                pagamento zera a régua; se a família continuar devendo, é caso de falar com ela na mão.
              </Aviso>
            )}
          </div>

          {/* ================= 4. QUEM PAGOU ================= */}
          <details style={painel.card}>
            <summary style={{ cursor: "pointer", color: cor.navy, fontWeight: 700, fontSize: 17 }}>
              {d.familias.quantosPagaram} família(s) pagaram neste mês · {money(d.dinheiro.entrou)}
            </summary>
            <table style={tabela}>
              <tbody>
                {(d.familias.pagaram || []).map((p: any) => (
                  <tr key={p.clienteId}>
                    <td style={td}>
                      <Link href={`/painel/clientes/${p.clienteId}`} style={{ color: cor.navy }}>
                        {p.nome}
                      </Link>
                    </td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#16a34a" }}>
                      {money(p.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(d.familias.adiantados || []).length > 0 && (
              <p style={{ margin: "10px 0 0", color: cor.cinza, fontSize: 14 }}>
                Adiantados no fim do mês:{" "}
                {d.familias.adiantados.map((a: any) => `${a.nome} (${money(a.valor)})`).join(" · ")}
              </p>
            )}
          </details>

          {/* ================= 5. O QUE REAJUSTAR ================= */}
          {d.reajustesTotal > 0 && (
            <div style={painel.card}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <b style={{ fontSize: 18, color: cor.navy }}>
                  {d.reajustesTotal} plano(s) com preço defasado
                </b>
                <Link href="/painel/financeiro?aba=reajustes"
                      style={{ ...painel.botaoMiniSec, marginLeft: "auto" }}>
                  Abrir reajustes
                </Link>
              </div>
              <ul style={lista}>
                {(d.reajustes || []).slice(0, 5).map((c: any, i: number) => (
                  <li key={c.planoId || i}>
                    <b>{c.cliente || "família"}</b>
                    {c.valorAtual != null ? ` · hoje ${money(c.valorAtual)}` : ""}
                    {c.valorSugerido != null ? ` → sugerido ${money(c.valorSugerido)}` : ""}
                    {c.mesesSemReajuste ? ` · ${c.mesesSemReajuste} meses sem reajuste` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Big({ rot, val, cor: c, sub }: { rot: string; val: string; cor: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontSize: 26, fontWeight: 800, color: c }}>{val}</div>
      <div style={{ color: "#cbd5e1", fontSize: 14 }}>{rot}</div>
      {sub && <div style={{ color: "#94a3b8", fontSize: 13 }}>{sub}</div>}
    </div>
  );
}

function Aviso({ tom, children }: { tom: "neutro" | "atencao"; children: React.ReactNode }) {
  const atencao = tom === "atencao";
  return (
    <p style={{
      margin: "10px 0 0", padding: "10px 12px", borderRadius: 10, lineHeight: 1.5, fontSize: 14,
      background: atencao ? "#fffbeb" : "#f8fafc",
      border: `1px solid ${atencao ? "#fde68a" : cor.linha}`,
      color: atencao ? "#78350f" : cor.cinza,
    }}>
      {children}
    </p>
  );
}

const tabela: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 15,
};
const th: React.CSSProperties = {
  textAlign: "left", padding: "6px 8px", color: "#64748b", fontSize: 13,
  borderBottom: `1px solid ${cor.linha}`, fontWeight: 600,
};
const td: React.CSSProperties = {
  padding: "8px", borderBottom: `1px solid ${cor.linha}`, color: "#334155",
};
const lista: React.CSSProperties = {
  margin: "6px 0 0", paddingLeft: 20, lineHeight: 1.8, color: "#475569", fontSize: 14,
};
