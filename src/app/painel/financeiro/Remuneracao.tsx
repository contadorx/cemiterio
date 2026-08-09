"use client";

import { useCallback, useEffect, useState } from "react";
import { painel, cor } from "../ui";
import { mesOperacao } from "@/lib/vencimento";

/**
 * PAGAMENTO DA EQUIPE — por mês, por jazigo, ou os dois.
 *
 * A pergunta que esta tela responde não é "quanto eu pago" — é "qual dos dois
 * jeitos me serve melhor". Por isso o comparativo fica ao lado do valor real:
 * com os MESMOS números do mês, quanto sairia pagando só o fixo, quanto sairia
 * pagando só por jazigo, e quanto sairia o fixo + adicional dos avulsos.
 *
 * A regra da casa (sem pessoa) vale para todo mundo que não tem regra própria —
 * é o que faz a segunda ajudante funcionar sem cadastro nenhum.
 */

const money = (n: number) => `R$ ${Number(n || 0).toFixed(2)}`;

function mesAtual() {
  return mesOperacao();
}
function nomeDoMes(m: string) {
  const [a, mm] = m.split("-").map(Number);
  return new Date(a, mm - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export default function Remuneracao() {
  const [mes, setMes] = useState(mesAtual());
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [editando, setEditando] = useState<string | null>(null); // membroId | "geral"

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/equipe/remuneracao?mes=${mes}`)
      .then((x) => x.json()).catch(() => null);
    if (r?.ok) { setD(r); setErro(""); }
    else setErro(r?.dica || r?.erro || "não consegui carregar");
  }, [mes]);
  useEffect(() => { carregar(); }, [carregar]);

  async function recalcular() {
    if (!confirm(
      "Recalcular aplica a regra de HOJE em todos os jazigos que ainda não foram pagos.\n\n" +
      "O que já foi acertado não muda. Seguir?"
    )) return;
    setOcupado(true);
    const r = await fetch("/api/equipe/remuneracao", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "recalcular" }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (r?.ok) { alert(`${r.recalculados} de ${r.total} serviços atualizados.`); carregar(); }
    else alert(r?.erro || "falhou");
  }

  /**
   * ACERTAR — quem decide se o fixo entra é o BOTÃO, não um confirm ambíguo.
   *
   * O fluxo antigo perguntava "incluir o fixo?" num confirm onde **Cancelar
   * significava 'pagar só os jazigos'**. Quem tentasse abortar o acerto inteiro
   * avançava para o segundo diálogo — o oposto do que o botão Cancelar quer
   * dizer em qualquer outro lugar do mundo. Agora são dois botões separados,
   * cada um dizendo o que vai fazer, e o Cancelar do confirm final cancela.
   */
  async function acertar(p: any, incluirMensal: boolean) {
    const total = p.aPagar.jazigos + (incluirMensal ? p.mensalDevido : 0);
    if (!confirm(
      `Acertar com ${p.nome}\n\n` +
      `${p.aPagar.servicos} jazigo(s): ${money(p.aPagar.jazigos)}\n` +
      (incluirMensal ? `Fixo de ${nomeDoMes(mes)}: ${money(p.mensalDevido)}\n` : "") +
      `TOTAL: ${money(total)}\n\n` +
      `Sai uma saída no caixa e os jazigos ficam marcados como pagos.` +
      (incluirMensal ? `\nO fixo deste mês não poderá ser pago de novo.` : "")
    )) return;
    setOcupado(true);
    const r = await fetch("/api/equipe/remuneracao", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        acao: "acerto", membroId: p.membroId,
        valorMensal: incluirMensal ? p.mensalDevido : 0,
        mesRef: mes,
        observacao: `ref. ${nomeDoMes(mes)}`,
      }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (r?.ok) {
      alert(`Pago ${money(r.pago)}.` + (r.avisoCaixa ? `\n\n⚠ ${r.avisoCaixa}` : "\nLançado no caixa como saída."));
      carregar();
    } else {
      alert(r?.mensagem || r?.erro || "falhou");
      if (r?.erro === "fixo_ja_pago") carregar();
    }
  }

  if (erro) {
    // o título não pode chutar a causa: a rota agora também devolve erro de
    // consulta, e dizer "precisa da migration 0031" quando o problema é outro
    // manda a pessoa procurar no lugar errado.
    return (
      <div style={{ ...painel.card, borderLeft: "4px solid #b45309" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>Não consegui montar esta aba.</p>
        <p style={{ margin: "8px 0 0", color: cor.cinza, lineHeight: 1.5 }}>{erro}</p>
      </div>
    );
  }
  if (!d) return <p style={{ color: cor.cinza }}>Carregando…</p>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* ---- cabeçalho: mês + ações ---- */}
      <div style={{ ...painel.card, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
          style={{ ...painel.input, width: 170 }} />
        <span style={{ color: cor.cinza }}>
          {d.totais.jazigos} jazigo(s) · receita {money(d.totais.receita)} ·
          custo da equipe {money(d.totais.custoEquipe)}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button style={painel.botaoSec} disabled={ocupado} onClick={recalcular}>
            Recalcular não pagos
          </button>
          <button style={painel.botaoSec}
            onClick={() => setEditando(editando === "geral" ? null : "geral")}>
            Regra da casa
          </button>
        </div>
      </div>

      {d.totais.semCarimbo > 0 && (
        <div style={{ ...painel.card, borderLeft: "4px solid #b45309" }}>
          <b>{d.totais.semCarimbo} jazigo(s) deste mês sem valor de mão de obra.</b>
          <p style={{ margin: "6px 0 0", color: cor.cinza, lineHeight: 1.5 }}>
            São serviços concluídos antes de a regra existir. Toque em
            <b> Recalcular não pagos</b> para aplicar a regra de hoje neles.
          </p>
        </div>
      )}

      {editando === "geral" && (
        <FormRegra titulo="Regra geral da casa"
          ajuda="Vale para quem não tem regra própria — inclusive gente que você ainda nem cadastrou."
          regra={d.regraGeral} membroId={null}
          onSalvo={() => { setEditando(null); carregar(); }}
          onCancelar={() => setEditando(null)} />
      )}

      {/* ---- uma pessoa por bloco ---- */}
      {d.pessoas.length === 0 && (
        <div style={painel.card}>
          <p style={{ margin: 0, color: cor.cinza }}>
            Ninguém executou serviço em {nomeDoMes(mes)}.
          </p>
        </div>
      )}

      {(d.pessoas || []).map((p: any) => (
        <div key={p.membroId} style={painel.card}>
          <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 19 }}>{p.nome}</h3>
            <span style={{ fontSize: 13, color: cor.cinza }}>
              {p.regraPropria ? "regra própria" : "usando a regra da casa"} ·{" "}
              {p.regra.modo === "mensal" ? "só o fixo do mês"
                : p.regra.modo === "por_jazigo" ? "só por jazigo"
                : "fixo + por jazigo"}
              {p.regra.so_avulso && p.regra.modo !== "mensal" ? " (por jazigo só nos avulsos)" : ""}
            </span>
            <button style={{ ...painel.botaoMiniSec, marginLeft: "auto" }}
              onClick={() => setEditando(editando === p.membroId ? null : p.membroId)}>
              {p.regraPropria ? "Mudar regra" : "Criar regra própria"}
            </button>
          </div>

          {editando === p.membroId && (
            <div style={{ marginTop: 12 }}>
              <FormRegra titulo={`Regra de ${p.nome}`}
                ajuda="Sobrepõe a regra da casa só para esta pessoa."
                regra={p.regra} membroId={p.membroId}
                onSalvo={() => { setEditando(null); carregar(); }}
                onCancelar={() => setEditando(null)} />
            </div>
          )}

          {/* o mês dela */}
          <div style={grade}>
            <Num rot="Jazigos no mês" val={String(p.jazigos)}
              sub={`${p.jazigosAvulsos} avulso(s)`} />
            <Num rot="Receita gerada" val={money(p.receita)}
              sub="o que as famílias pagam" />
            <Num rot="Fixo do mês" val={money(p.fixoPago ? (p.fixoPagoValor ?? 0) : p.mensalDevido)}
              sub={p.fixoPago ? "já acertado" : undefined} />
            <Num rot="Por jazigo" val={money(p.porJazigoCongelado)}
              sub={p.divergente ? `regra de hoje daria ${money(p.porRegraHoje)}` : undefined}
              alerta={p.divergente} />
            <Num rot="Total do mês" val={money(p.totalDoMes)} forte
              sub={p.jazigos ? `${money(p.comparacao.ganhoMedio)} por jazigo` : undefined} />
          </div>

          {/* A COMPARAÇÃO — o motivo desta tela existir */}
          <div style={{ marginTop: 14, padding: 14, background: "#f8fafc",
                        border: `1px solid ${cor.linha}`, borderRadius: 10 }}>
            <b style={{ fontSize: 14 }}>Com os números deste mês, quanto sairia cada jeito</b>
            <table style={tabela}>
              <tbody>
                <Linha rot="Só o fixo do mês" val={p.comparacao.soMensal}
                  obs={p.jazigos ? `${money(p.comparacao.custoJazigoSeMensal)} por jazigo` : "—"} />
                <Linha rot="Só por jazigo" val={p.comparacao.soPorJazigo}
                  obs={p.jazigos ? `${money(p.comparacao.custoJazigoSePorJazigo)} por jazigo` : "—"} />
                <Linha rot="Fixo + adicional só nos avulsos" val={p.comparacao.mensalMaisAvulsos}
                  obs={`${p.jazigosAvulsos} avulso(s) no mês`} />
                <Linha rot="Fixo + por todos os jazigos" val={p.comparacao.mensalMaisTodos} obs="" />
              </tbody>
            </table>
            <p style={{ margin: "10px 0 0", fontSize: 13, color: cor.cinza, lineHeight: 1.5 }}>
              A tarifa usada em todas as linhas é a que está na regra dela
              ({p.regra.base_jazigo === "percentual"
                ? `${p.regra.percentual_receita}% da receita do serviço`
                : `${money(p.regra.valor_por_jazigo)} por jazigo`}).
              Mude a tarifa acima e os quatro cenários se recalculam.
            </p>
          </div>

          {/* acerto */}
          <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, color: cor.cinza }}>A pagar (jazigos não acertados)</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{money(p.aPagar.jazigos)}</div>
              <div style={{ fontSize: 13, color: cor.cinza }}>
                {p.aPagar.servicos} serviço(s)
                {p.aPagar.maisAntigo ? ` · desde ${String(p.aPagar.maisAntigo).slice(0, 10).split("-").reverse().join("/")}` : ""}
              </div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button style={painel.botaoSec} disabled={ocupado || !p.aPagar.jazigos}
                onClick={() => acertar(p, false)}>
                Pagar só os jazigos ({money(p.aPagar.jazigos)})
              </button>
              {p.mensalDevido > 0 && (
                <button style={painel.botao} disabled={ocupado}
                  onClick={() => acertar(p, true)}>
                  Pagar jazigos + fixo ({money(p.aPagar.jazigos + p.mensalDevido)})
                </button>
              )}
            </div>
          </div>

          {p.fixoPago && (
            <p style={{ margin: "8px 0 0", fontSize: 14, color: cor.teal }}>
              ✓ O fixo de {nomeDoMes(mes)} ({money(p.fixoPagoValor ?? 0)}) já foi acertado
              {p.fixoPagoEm ? ` em ${new Date(p.fixoPagoEm).toLocaleDateString("pt-BR")}` : ""}.
              Só os jazigos novos entram no próximo acerto.
            </p>
          )}

          {p.servicos.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer", color: cor.teal, fontSize: 14 }}>
                ver os {p.servicos.length} jazigos do mês
              </summary>
              <table style={tabela}>
                <thead>
                  <tr><th style={th}>data</th><th style={th}>jazigo</th><th style={th}>tipo</th>
                    <th style={{ ...th, textAlign: "right" }}>família paga</th>
                    <th style={{ ...th, textAlign: "right" }}>ela ganha</th>
                    <th style={th}>pago</th></tr>
                </thead>
                <tbody>
                  {(p.servicos || []).map((s: any) => (
                    <tr key={s.id}>
                      <td style={td}>{String(s.data || "").slice(0, 10).split("-").reverse().join("/")}</td>
                      <td style={td}>{s.jazigo}</td>
                      <td style={td}>{s.avulso ? "avulso" : "do plano"}</td>
                      <td style={{ ...td, textAlign: "right" }}>{money(s.receita)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{money(s.ganho)}</td>
                      <td style={td}>{s.pago ? "✓" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ form */

function FormRegra({ titulo, ajuda, regra, membroId, onSalvo, onCancelar }: {
  titulo: string; ajuda: string; regra: any; membroId: string | null;
  onSalvo: () => void; onCancelar: () => void;
}) {
  const [f, setF] = useState({
    modo: regra?.modo || "mensal",
    valorMensal: String(regra?.valor_mensal ?? ""),
    baseJazigo: regra?.base_jazigo || "fixo",
    valorPorJazigo: String(regra?.valor_por_jazigo ?? ""),
    percentualReceita: String(regra?.percentual_receita ?? ""),
    soAvulso: !!regra?.so_avulso,
    observacao: regra?.observacao || "",
  });
  const [ocupado, setOcupado] = useState(false);
  const num = (v: string) => Number(String(v).replace(",", ".")) || 0;

  async function salvar() {
    setOcupado(true);
    const r = await fetch("/api/equipe/remuneracao", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        membroId, modo: f.modo,
        valorMensal: num(f.valorMensal),
        baseJazigo: f.baseJazigo,
        valorPorJazigo: num(f.valorPorJazigo),
        percentualReceita: num(f.percentualReceita),
        soAvulso: f.soAvulso,
        observacao: f.observacao || null,
      }),
    }).then((x) => x.json()).catch(() => null);
    setOcupado(false);
    if (r?.ok) onSalvo(); else alert(r?.erro || "não consegui salvar");
  }

  const temJazigo = f.modo !== "mensal";

  return (
    <div style={{ padding: 14, background: "#f8fafc", border: `1px solid ${cor.linha}`, borderRadius: 10 }}>
      <b>{titulo}</b>
      <p style={{ margin: "4px 0 12px", fontSize: 13, color: cor.cinza }}>{ajuda}</p>

      <label style={painel.rotulo}>Como paga</label>
      <select style={painel.input} value={f.modo} onChange={(e) => setF({ ...f, modo: e.target.value })}>
        <option value="mensal">Só o fixo do mês (como é hoje)</option>
        <option value="por_jazigo">Só por jazigo lavado</option>
        <option value="mensal_mais_jazigo">Fixo do mês + por jazigo</option>
      </select>

      {f.modo !== "por_jazigo" && (
        <>
          <label style={painel.rotulo}>Fixo do mês (R$)</label>
          <input style={painel.input} inputMode="decimal" value={f.valorMensal}
            onChange={(e) => setF({ ...f, valorMensal: e.target.value })} placeholder="1200,00" />
        </>
      )}

      {temJazigo && (
        <>
          <label style={painel.rotulo}>O valor do jazigo é</label>
          <select style={painel.input} value={f.baseJazigo}
            onChange={(e) => setF({ ...f, baseJazigo: e.target.value })}>
            <option value="fixo">um valor fixo em reais</option>
            <option value="percentual">uma porcentagem do que a família paga</option>
          </select>

          {f.baseJazigo === "fixo" ? (
            <>
              <label style={painel.rotulo}>Por jazigo lavado (R$)</label>
              <input style={painel.input} inputMode="decimal" value={f.valorPorJazigo}
                onChange={(e) => setF({ ...f, valorPorJazigo: e.target.value })} placeholder="15,00" />
            </>
          ) : (
            <>
              <label style={painel.rotulo}>Porcentagem da receita do serviço (%)</label>
              <input style={painel.input} inputMode="decimal" value={f.percentualReceita}
                onChange={(e) => setF({ ...f, percentualReceita: e.target.value })} placeholder="30" />
              <p style={{ margin: "4px 0 0", fontSize: 13, color: cor.cinza }}>
                Enquanto o preço da limpeza não estabilizar, a porcentagem se ajusta sozinha:
                jazigo mais caro paga mais a ela, sem você mexer em nada.
              </p>
            </>
          )}

          <label style={{ ...painel.rotulo, display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
            <input type="checkbox" checked={f.soAvulso}
              onChange={(e) => setF({ ...f, soAvulso: e.target.checked })} />
            pagar por jazigo só nos AVULSOS (os do plano já estão no fixo)
          </label>
        </>
      )}

      <label style={painel.rotulo}>Observação (opcional)</label>
      <input style={painel.input} value={f.observacao}
        onChange={(e) => setF({ ...f, observacao: e.target.value })}
        placeholder="combinado em 01/08, revisar em outubro" />

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button style={painel.botao} disabled={ocupado} onClick={salvar}>Salvar regra</button>
        <button style={painel.botaoSec} onClick={onCancelar}>Cancelar</button>
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 13, color: cor.cinza, lineHeight: 1.5 }}>
        A regra vale dos próximos serviços em diante. Para aplicar nos que já foram
        feitos e ainda não foram pagos, use <b>Recalcular não pagos</b>.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ pedacinhos */

const grade: React.CSSProperties = {
  display: "grid", gap: 10, marginTop: 14,
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
};
const tabela: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse", marginTop: 8, fontSize: 14,
};
const th: React.CSSProperties = {
  textAlign: "left", padding: "6px 4px", borderBottom: `1px solid ${cor.linha}`,
  color: cor.cinza, fontWeight: 600, fontSize: 13,
};
const td: React.CSSProperties = { padding: "6px 4px", borderBottom: `1px solid ${cor.linha}` };

function Num({ rot, val, sub, forte, alerta }: {
  rot: string; val: string; sub?: string; forte?: boolean; alerta?: boolean;
}) {
  return (
    <div style={{
      padding: 10, borderRadius: 8, background: forte ? "#ecfdf5" : "#f8fafc",
      border: `1px solid ${alerta ? "#d97706" : cor.linha}`,
    }}>
      <div style={{ fontSize: 12, color: cor.cinza }}>{rot}</div>
      <div style={{ fontSize: 19, fontWeight: 700 }}>{val}</div>
      {sub && <div style={{ fontSize: 12, color: alerta ? "#b45309" : cor.cinza }}>{sub}</div>}
    </div>
  );
}

function Linha({ rot, val, obs }: { rot: string; val: number; obs: string }) {
  return (
    <tr>
      <td style={td}>{rot}</td>
      <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{money(val)}</td>
      <td style={{ ...td, color: cor.cinza, fontSize: 13 }}>{obs}</td>
    </tr>
  );
}
