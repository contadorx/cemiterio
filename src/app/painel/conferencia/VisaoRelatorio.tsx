"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Cartao, Botao, Selo } from "../pecas";

/**
 * O RELATÓRIO DE EVENTOS — por competência, com o canal ao lado.
 *
 * POR QUE O CANAL É O ASSUNTO
 * ---------------------------------------------------------------------------
 * O registro entra por três portas: a esteira automática da competência, o
 * aplicativo de campo e o painel. Conferir é justamente descobrir o que entrou
 * por uma e não pela outra — "essas cinco lavagens de agosto vieram do campo,
 * essas duas alguém digitou, e essa aqui ninguém sabe".
 *
 * Foi olhando por canal que se viu, em 23/08, que DUAS de três lavagens
 * registradas fora do campo nunca viraram dinheiro. No extrato elas não
 * apareciam — é o que as tornava invisíveis: um serviço que aconteceu e não
 * deixou linha nenhuma no razão.
 *
 * EXPORTAR NÃO É UM BOTÃO DE ENFEITE. É o caminho para a conferência a quatro
 * mãos que o piloto pede: duas pessoas, cada uma com a sua planilha, sem uma
 * olhar a tela da outra.
 */

const CANAIS: [string, string][] = [
  ["", "todos"],
  ["campo", "campo"],
  ["manual_adm", "painel"],
  ["automatico", "automático"],
  ["importacao", "importado"],
];

const ROTULO_CANAL: Record<string, string> = {
  campo: "campo", manual_adm: "painel", automatico: "automático",
  importacao: "importado", "nao marcado": "sem canal",
};

export default function VisaoRelatorio() {
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [f, setF] = useState({ competencia: "", canal: "", conferido: "" });
  const [ocupado, setOcupado] = useState<string | null>(null);

  const qs = useCallback(() => {
    const p = new URLSearchParams();
    if (f.competencia) p.set("competencia", f.competencia);
    if (f.canal) p.set("canal", f.canal);
    if (f.conferido) p.set("conferido", f.conferido);
    return p.toString();
  }, [f]);

  const carregar = useCallback(async () => {
    setErro("");
    const r = await fetch(`/api/relatorio?${qs()}`).then((x) => x.json()).catch(() => null);
    if (!r?.ok) { setErro(r?.erro || "não deu para carregar"); return; }
    setD(r);
  }, [qs]);

  useEffect(() => { carregar(); }, [carregar]);

  async function ok(id: string, marcar: boolean) {
    setOcupado(id);
    try {
      await fetch("/api/relatorio", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lancamentoId: id, ok: marcar }),
      });
      await carregar();
    } finally { setOcupado(null); }
  }

  const dinheiro = (v: any) =>
    Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dia = (iso: string | null) =>
    iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-BR") : "—";
  const mes = (iso: string | null) =>
    iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }) : "—";

  if (erro) {
    return (
      <Cartao>
        <p className="text-[15px] text-perigo">Não deu para carregar: {erro}</p>
        <div className="mt-3"><Botao onClick={carregar}>Tentar de novo</Botao></div>
      </Cartao>
    );
  }
  if (!d) return <p className="text-[15px] text-ink-soft">Carregando…</p>;

  const eventos: any[] = d.eventos || [];
  const comps: any[] = d.competencias || [];
  const semCobranca: any[] = d.semCobranca || [];

  return (
    <>
      {/* --------------------------------------------------- AS COMPETÊNCIAS
          O mês em números, com a quebra por canal. `competencia` estava NULA
          em 100% dos lançamentos até a 0098 — este bloco não tinha como
          existir. */}
      <Cartao>
        <h2 className="mb-2 text-[16px] font-medium text-ink">Competências</h2>
        {comps.length === 0 ? (
          <p className="text-[14px] text-ink-soft">Nenhum lançamento ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-ink-soft">
                  <th className="py-2 pr-3">competência</th>
                  <th className="py-2 pr-3 text-right">débitos</th>
                  <th className="py-2 pr-3 text-right">créditos</th>
                  <th className="py-2 pr-3 text-right">resultado</th>
                  <th className="py-2 pr-3 text-right">eventos</th>
                  <th className="py-2 pr-3">de onde vieram</th>
                </tr>
              </thead>
              <tbody>
                {comps.map((c) => (
                  <tr key={c.competencia} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3">
                      <button className="text-ink underline"
                              onClick={() => setF({ ...f, competencia: String(c.competencia).slice(0, 7) })}>
                        {mes(c.competencia)}
                      </button>
                    </td>
                    <td className="py-2 pr-3 text-right text-perigo">{dinheiro(c.debitos)}</td>
                    <td className="py-2 pr-3 text-right text-positivo">{dinheiro(c.creditos)}</td>
                    <td className={`py-2 pr-3 text-right ${
                      Number(c.resultado) < 0 ? "text-perigo" : "text-positivo"}`}>
                      {dinheiro(c.resultado)}
                    </td>
                    <td className="py-2 pr-3 text-right text-ink-soft">
                      {c.eventos} ({c.conferidos} ok)
                    </td>
                    <td className="py-2 pr-3 text-ink-soft">
                      {[
                        Number(c.do_campo) ? `${c.do_campo} campo` : null,
                        Number(c.do_painel) ? `${c.do_painel} painel` : null,
                        Number(c.automaticos) ? `${c.automaticos} automático` : null,
                        Number(c.importados) ? `${c.importados} importado` : null,
                        Number(c.sem_canal) ? `${c.sem_canal} sem canal` : null,
                      ].filter(Boolean).join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      {/* ------------------------------ A LAVAGEM QUE NÃO VIROU DINHEIRO */}
      {semCobranca.length > 0 && (
        <Cartao>
          <h2 className="mb-1 text-[16px] font-medium text-perigo">
            {semCobranca.length} lavagem(ns) executada(s) sem cobrança
          </h2>
          <p className="mb-3 text-[13px] text-ink-soft">
            Aconteceram e não deixaram linha nenhuma no razão — por isso não
            aparecem no extrato. Abra a ficha da família para lançar.
          </p>
          {semCobranca.map((l) => (
            <div key={l.servico_id}
                 className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 last:border-0">
              <span className="min-w-0">
                <span className="text-[15px] text-ink">{l.familia || "sem família"}</span>
                <span className="block text-[13px] text-ink-soft">
                  {l.jazigo} · lavada em {dia(l.dia)} · competência {mes(l.competencia)} ·
                  pelo {ROTULO_CANAL[l.canal] || l.canal}
                  {l.valor_sugerido != null && ` · sugerido ${dinheiro(l.valor_sugerido)}`}
                </span>
              </span>
              {l.familia_id && (
                <Link href={`/painel/clientes/${l.familia_id}?de=conferencia`}>
                  <Botao tom="secundario">Abrir e lançar</Botao>
                </Link>
              )}
            </div>
          ))}
        </Cartao>
      )}

      {/* --------------------------------------------------------- FILTROS */}
      <Cartao>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[13px] text-ink-soft">Competência</label>
            <input type="month" value={f.competencia}
                   onChange={(e) => setF({ ...f, competencia: e.target.value })}
                   className="rounded-lg border border-line bg-card px-2 py-1.5 text-[14px] text-ink" />
          </div>
          <div>
            <label className="mb-1 block text-[13px] text-ink-soft">Canal</label>
            <select value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })}
                    className="rounded-lg border border-line bg-card px-2 py-1.5 text-[14px] text-ink">
              {CANAIS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[13px] text-ink-soft">Conferência</label>
            <select value={f.conferido} onChange={(e) => setF({ ...f, conferido: e.target.value })}
                    className="rounded-lg border border-line bg-card px-2 py-1.5 text-[14px] text-ink">
              <option value="">tudo</option>
              <option value="nao">só o que falta conferir</option>
              <option value="sim">só o já conferido</option>
            </select>
          </div>
          {(f.competencia || f.canal || f.conferido) && (
            <Botao tom="secundario" onClick={() => setF({ competencia: "", canal: "", conferido: "" })}>
              limpar
            </Botao>
          )}
          <span className="flex-1" />
          {/* EXPORTAR LEVA O FILTRO JUNTO. Um botão que exporta sempre tudo,
              ao lado de filtros que mostram uma parte, entrega um arquivo que
              não é o que está na tela — e quem confere descobre isso depois de
              somar a coluna errada. */}
          <a href={`/api/relatorio?${qs()}&formato=csv`}>
            <Botao tom="secundario">Baixar CSV</Botao>
          </a>
          <a href={`/api/relatorio?${qs()}&formato=xls`}>
            <Botao tom="secundario">Baixar Excel</Botao>
          </a>
        </div>
      </Cartao>

      {/* --------------------------------------------------------- EVENTOS */}
      <Cartao>
        <h2 className="mb-2 text-[16px] font-medium text-ink">
          {eventos.length} evento{eventos.length === 1 ? "" : "s"}
          {f.competencia ? ` em ${f.competencia}` : ""}
        </h2>
        {eventos.length === 0 ? (
          <p className="text-[14px] text-ink-soft">Nada com este filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-ink-soft">
                  <th className="py-2 pr-3">comp.</th>
                  <th className="py-2 pr-3">data</th>
                  <th className="py-2 pr-3">família</th>
                  <th className="py-2 pr-3">origem</th>
                  <th className="py-2 pr-3">canal</th>
                  <th className="py-2 pr-3 text-right">valor</th>
                  <th className="py-2 pr-3">ok</th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((e) => (
                  <tr key={e.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3 text-ink">{mes(e.competencia)}</td>
                    <td className="py-2 pr-3 text-ink-soft">{dia(e.data)}</td>
                    <td className="py-2 pr-3">
                      <Link href={`/painel/clientes/${e.familia_id}?de=conferencia`}
                            className="text-ink underline">{e.familia}</Link>
                      {e.jazigo && <span className="text-ink-soft"> · {e.jazigo}</span>}
                    </td>
                    <td className="py-2 pr-3 text-ink-soft">
                      {e.origem}{e.e_estorno ? " (estorno)" : ""}
                    </td>
                    <td className="py-2 pr-3">
                      <Selo tom={e.canal === "nao marcado" ? "atencao" : "neutro"}>
                        {ROTULO_CANAL[e.canal] || e.canal}
                      </Selo>
                    </td>
                    <td className={`py-2 pr-3 text-right ${
                      Number(e.valor_com_sinal) < 0 ? "text-perigo" : "text-positivo"}`}>
                      {dinheiro(e.valor_com_sinal)}
                    </td>
                    <td className="py-2 pr-3">
                      <button disabled={ocupado === e.id}
                              onClick={() => ok(e.id, !e.conferido_em)}
                              className={e.conferido_em ? "text-positivo" : "text-ink-soft underline"}>
                        {e.conferido_em ? "✓" : "dar ok"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </>
  );
}
