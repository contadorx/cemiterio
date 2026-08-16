"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Cartao, Selo, dinheiro } from "./pecas";

/**
 * O MÊS — a tela inicial.
 *
 * Responde de cima para baixo a única pergunta que importa no dia a dia:
 * QUEM FOI LIMPO E QUEM PAGOU.
 *
 * O que havia aqui antes: capacidade do dia, rascunhos da IA, leads novos do
 * site e indicadores de gestão — números de um sistema que saiu de escopo, e
 * nenhum deles dizia se o mês estava fechando.
 */

const MESES = ["janeiro","fevereiro","março","abril","maio","junho",
               "julho","agosto","setembro","outubro","novembro","dezembro"];

function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function Painel() {
  const [competencia, setCompetencia] = useState(competenciaAtual);
  const [dados, setDados] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<"todas" | "pendentes">("pendentes");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/mes?competencia=${competencia}`).then((x) => x.json());
      if (r?.ok) setDados(r);
    } finally {
      setCarregando(false);
    }
  }, [competencia]);

  useEffect(() => { carregar(); }, [carregar]);

  const linhas = (dados?.linhas || []).filter((l: any) =>
    filtro === "todas" ? true : !l.limpezaOk || !l.pagamentoOk
  );
  const r = dados?.resumo;
  const mesNome = `${MESES[Number(competencia.slice(5, 7)) - 1]} de ${competencia.slice(0, 4)}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold text-ink">O mês</h1>
        <input
          type="month"
          value={competencia.slice(0, 7)}
          onChange={(e) => setCompetencia(`${e.target.value}-01`)}
          className="rounded-lg border border-line bg-card px-3 py-2 text-[15px] text-ink focus:border-brand focus:outline-none"
        />
      </div>

      {/* Três números e nada mais no topo: o que falta fazer, o que falta
          entrar, e quanto isso soma. */}
      {r && (
        <div className="mb-4 grid grid-cols-3 gap-3 rounded-xl2 bg-brand p-4 text-sobre">
          <div>
            <p className="text-[26px] font-semibold leading-tight">{r.faltaLimpar}</p>
            <p className="text-[12px] opacity-75">falta limpar</p>
          </div>
          <div>
            <p className="text-[26px] font-semibold leading-tight">{r.faltaPagar}</p>
            <p className="text-[12px] opacity-75">falta pagar</p>
          </div>
          <Link href="/painel/financeiro" className="block">
            <p className="text-[26px] font-semibold leading-tight">{dinheiro(r.emAberto)}</p>
            <p className="text-[12px] opacity-75">em aberto →</p>
          </Link>
        </div>
      )}

      <div className="mb-3 flex gap-2">
        {(["pendentes", "todas"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setFiltro(v)}
            className={`rounded-lg border px-3 py-2 text-[14px] font-medium transition-colors ${
              filtro === v
                ? "border-transparent bg-brand text-sobre"
                : "border-line bg-card text-ink hover:bg-surface"
            }`}
          >
            {v === "pendentes" ? "Só as pendentes" : "Todas as famílias"}
          </button>
        ))}
      </div>

      {carregando && <p className="text-[15px] text-ink-soft">Carregando {mesNome}…</p>}

      {!carregando && !linhas.length && (
        <Cartao>
          <p className="text-[16px] font-semibold text-positivo">
            {filtro === "pendentes"
              ? "Nenhuma pendência neste mês. 🌿"
              : "Nenhuma família cadastrada ainda."}
          </p>
          {filtro === "pendentes" && (
            <p className="mt-1 text-[14px] text-ink-soft">
              Todas limpas e todas em dia em {mesNome}.
            </p>
          )}
        </Cartao>
      )}

      {linhas.map((l: any) => (
        <Link
          key={l.familiaId}
          href={`/painel/clientes?familia=${l.familiaId}`}
          className="mb-2 block rounded-xl2 border border-line bg-card p-4 hover:bg-surface"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[16px] font-medium text-ink">{l.nome}</p>
              {l.local && <p className="text-[13px] text-ink-soft">{l.local}</p>}
            </div>

            {/* As duas colunas escritas por extenso: um ✓ e um ✗ sozinhos
                exigiriam decorar qual é qual. */}
            <div className="flex items-center gap-2">
              {l.semPlano ? (
                <Selo tom="neutro">avulso</Selo>
              ) : l.limpezaOk ? (
                <Selo tom="bom">limpa</Selo>
              ) : (
                <Selo tom="atencao">
                  {l.limpos > 0 ? `${l.limpos} de ${l.contratados}` : "falta limpar"}
                </Selo>
              )}
              {l.pagamentoOk ? (
                <Selo tom="bom">em dia</Selo>
              ) : (
                <Selo tom="atencao">{dinheiro(l.saldo)}</Selo>
              )}
            </div>
          </div>
        </Link>
      ))}
    </>
  );
}
