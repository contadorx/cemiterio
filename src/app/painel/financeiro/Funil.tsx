"use client";

import Link from "next/link";
import { useBusca, horaCurta } from "@/lib/buscar";
import { Falhou, Desde } from "../pecas";
import { reais } from "@/lib/vocabulario";

/**
 * O FUNIL — a primeira visão do Financeiro (CA-09).
 *
 * A tela abria numa aba: "Fechar o mês". Não estava errada, mas era uma
 * resposta antes da pergunta — dá para fechar o mês com dinheiro do banco ainda
 * sem dono, e ninguém na tela dizia isso.
 *
 * O funil é o vocabulário do dinheiro em ordem (`src/lib/vocabulario.ts`), e
 * cada etapa só faz sentido depois da anterior:
 *
 *   a identificar → a conferir → a receber → fechar o mês
 *
 * A ETAPA VAZIA FICA NA TELA, em cinza. Aqui, ao contrário do "Precisa de
 * você", sumir seria errado: o funil é uma sequência, e uma sequência com
 * buracos não se lê. "0 a identificar" é informação boa — quer dizer que o
 * banco está em dia.
 */

interface Etapa {
  chave: string;
  titulo: string;
  pergunta: string;
  numero: number | null;
  detalhe?: string;
  href: string;
  agir: boolean;
}

export default function Funil({ aoIr }: { aoIr: (aba: string) => void }) {
  const { fase, dados, erro, atualizadoEm, recarregar } = useBusca<any>("/api/financeiro/funil");

  if (fase === "carregando" && !dados) {
    return <p className="mb-4 text-[15px] text-ink-soft">Vendo como está o dinheiro…</p>;
  }
  if (fase === "erro" && !dados) {
    return <Falhou mensagem={erro || "Não consegui ler o funil."} aoTentar={recarregar} />;
  }
  if (!dados) return null;

  const d = dados;
  const etapas: Etapa[] = [
    {
      chave: "identificar", titulo: "A identificar", pergunta: "Caiu no banco. De quem é?",
      numero: d.identificar, href: "conferir", agir: (d.identificar ?? 0) > 0,
    },
    {
      chave: "conferir", titulo: "A conferir", pergunta: "Chegou com dono. Está certo?",
      numero: d.conferir, href: "conferir", agir: (d.conferir ?? 0) > 0,
    },
    {
      chave: "receber", titulo: "A receber", pergunta: "Está lançado e não entrou.",
      numero: d.aReceber ? d.aReceber.familias : null,
      detalhe: d.aReceber ? reais(d.aReceber.total) : undefined,
      href: "", agir: (d.aReceber?.familias ?? 0) > 0,
    },
    {
      chave: "fechar", titulo: "Fechar o mês", pergunta: "Tudo conferido? Então dá para fechar.",
      numero: d.fechar ? d.fechar.novos : null,
      detalhe: d.fechar && d.fechar.novos > 0 ? reais(d.fechar.total) : undefined,
      href: "fechar", agir: (d.fechar?.novos ?? 0) > 0,
    },
  ];

  return (
    <section className="mb-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {etapas.map((e, i) => {
          const corpo = (
            <>
              <p className="text-[12px] font-medium uppercase tracking-wide text-ink-soft">
                {i + 1}. {e.titulo}
              </p>
              <p className={`mt-1 text-[28px] font-semibold leading-none ${
                e.numero === null ? "text-perigo" : e.agir ? "text-aviso" : "text-ink-soft"
              }`}>
                {/* NÃO SABER NÃO É ZERO. A etapa que não deu para ler mostra "?"
                    e não um zero tranquilizador. */}
                {e.numero === null ? "?" : e.numero}
              </p>
              {e.detalhe && <p className="mt-0.5 text-[13px] text-ink">{e.detalhe}</p>}
              <p className="mt-1 text-[12px] leading-snug text-ink-soft">
                {e.numero === null ? "não consegui ler esta etapa" : e.pergunta}
              </p>
            </>
          );
          const classe = `block rounded-xl2 border p-3 text-left ${
            e.numero === null
              ? "border-perigo/40 bg-perigo/5"
              : e.agir
                ? "border-aviso/40 bg-aviso/10 hover:bg-aviso/20"
                : "border-line bg-card"
          }`;

          // "A receber" mora na lista de famílias, não aqui: é lá que se
          // resolve, família por família. As outras três são abas desta tela.
          if (e.chave === "receber") {
            return (
              <Link key={e.chave} href="/painel/clientes?atalho=em_aberto" className={classe}>
                {corpo}
              </Link>
            );
          }
          return (
            <button key={e.chave} onClick={() => aoIr(e.href)} className={classe}>
              {corpo}
            </button>
          );
        })}
      </div>

      {fase === "erro" && (
        <div className="mt-2">
          <Falhou mensagem={erro || "Não consegui atualizar."} aoTentar={recarregar}
                  parcial desde={horaCurta(atualizadoEm)} />
        </div>
      )}

      <Desde hora={horaCurta(atualizadoEm)} />
    </section>
  );
}
