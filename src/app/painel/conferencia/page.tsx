"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Cartao, Botao, Selo } from "../pecas";

/**
 * A DUPLA CONFERÊNCIA DO CADASTRO — Build 7, etapa 1.
 *
 * Metade da conferência é comparar com o caderno, e essa metade é humana. A
 * outra metade — falta telefone? falta quadra? o plano está ativo sem data? —
 * o banco responde melhor, e sem cansar na décima família.
 *
 * Esta tela é a segunda metade. Ela existe para que a atenção de quem confere
 * sobre inteira para o **saldo de abertura**, que é a única coisa aqui que
 * nenhuma consulta consegue verificar: só o caderno sabe se o número está certo.
 */

interface Item { item: string; situacao: string; detalhe: string; onde: string }
interface Fam {
  familia_id: string; familia: string; jazigos: number; pessoas: number;
  contratado: boolean; pendencias: number; o_que_falta: string | null;
}

function tomDaSituacao(s: string): "bom" | "atencao" | "neutro" {
  if (s === "ok") return "bom";
  if (s === "CORRIGIR") return "atencao";
  return "neutro";   // "CONFERIR NO CADERNO", "nao se aplica", "atencao"
}

export default function Conferencia() {
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const [itens, setItens] = useState<Record<string, Item[]>>({});
  const [soPendentes, setSoPendentes] = useState(false);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const r = await fetch("/api/conferencia").then((x) => x.json());
      if (!r.ok) throw new Error(r.erro || "falhou");
      setDados(r);
    } catch (e: any) {
      setErro(e?.message || "não deu para carregar");
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function abrir(f: Fam) {
    if (aberta === f.familia_id) { setAberta(null); return; }
    setAberta(f.familia_id);
    if (itens[f.familia_id]) return;
    const r = await fetch(`/api/conferencia?familiaId=${f.familia_id}`).then((x) => x.json());
    if (r.ok) setItens((x) => ({ ...x, [f.familia_id]: r.itens }));
  }

  if (erro) {
    return (
      <Cartao>
        <p className="text-[15px] text-perigo">Não deu para carregar: {erro}</p>
        <div className="mt-3"><Botao onClick={carregar}>Tentar de novo</Botao></div>
      </Cartao>
    );
  }
  if (!dados) return <p className="text-[15px] text-ink-soft">Carregando…</p>;

  const familias: Fam[] = dados.familias || [];
  const lista = soPendentes ? familias.filter((f) => Number(f.pendencias) > 0) : familias;

  return (
    <>
      <h1 className="text-[22px] font-semibold text-ink">Conferência de cadastro</h1>
      <p className="mb-4 text-[14px] text-ink-soft">
        Da família mais simples para a mais complicada. Comece pelas de cima:
        se a mais simples já dá problema, o problema é do sistema, não do cadastro.
      </p>

      <div className="mb-4 grid grid-cols-3 gap-3 rounded-xl2 bg-brand p-4 text-sobre">
        <div>
          <p className="text-[26px] font-semibold leading-tight">{dados.resumo.total}</p>
          <p className="text-[12px] opacity-75">famílias</p>
        </div>
        <div>
          <p className="text-[26px] font-semibold leading-tight">{dados.resumo.prontas}</p>
          <p className="text-[12px] opacity-75">sem pendência</p>
        </div>
        <div>
          <p className="text-[26px] font-semibold leading-tight">{dados.resumo.prontasContratadas}</p>
          <p className="text-[12px] opacity-75">prontas e contratadas</p>
        </div>
      </div>

      {/* O NÚMERO DO MEIO ENGANA SOZINHO. Uma família sem contrato pode estar
          "sem pendência" e mesmo assim não servir para o piloto: ela não gera
          competência. O terceiro número é o que conta para escolher a amostra. */}
      {dados.resumo.prontasContratadas < 5 && (
        <Cartao>
          <p className="text-[15px] text-ink">
            <b>Só {dados.resumo.prontasContratadas} família(s) pronta(s) e contratada(s).</b>{" "}
            O piloto pede 5.
          </p>
          <p className="mt-1 text-[14px] text-ink-soft">
            Família sem contrato não gera competência — as limpezas dela entram como
            avulso, que é outro fluxo. Para chegar a 5: resolva as pendências das
            contratadas, ou feche contrato com famílias que já têm jazigo ligado.
          </p>
        </Cartao>
      )}

      <div className="mb-3">
        <Botao tom={soPendentes ? "principal" : "secundario"}
               onClick={() => setSoPendentes((v) => !v)}>
          {soPendentes ? "Mostrando só as pendentes" : "Ver só as pendentes"}
        </Botao>
      </div>

      {lista.map((f) => (
        <Cartao key={f.familia_id}>
          <button onClick={() => abrir(f)}
                  className="flex w-full items-center justify-between gap-3 text-left">
            <span className="min-w-0">
              <span className="text-[15px] font-medium text-ink">{f.familia}</span>
              <span className="ml-2 text-[13px] text-ink-soft">
                {f.jazigos} jazigo{f.jazigos === 1 ? "" : "s"} · {f.pessoas} pessoa{f.pessoas === 1 ? "" : "s"}
                {f.contratado ? " · contratada" : " · sem contrato"}
              </span>
            </span>
            <Selo tom={Number(f.pendencias) === 0 ? "bom" : "atencao"}>
              {Number(f.pendencias) === 0 ? "sem pendência" : `${f.pendencias} a corrigir`}
            </Selo>
          </button>

          {aberta === f.familia_id && (
            <div className="mt-3 border-t border-line pt-3">
              {!itens[f.familia_id] && (
                <p className="text-[14px] text-ink-soft">Conferindo…</p>
              )}
              {(itens[f.familia_id] || []).map((i) => (
                <div key={i.item}
                     className="flex flex-wrap items-start justify-between gap-2 border-b border-line py-2 last:border-0">
                  <span className="min-w-0">
                    <span className="text-[14px] text-ink">{i.item}</span>
                    <span className="block text-[13px] text-ink-soft">{i.detalhe}</span>
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-2">
                    <Selo tom={tomDaSituacao(i.situacao)}>{i.situacao}</Selo>
                    {i.situacao === "CORRIGIR" && (
                      <Link href={i.onde} className="text-[13px] underline text-ink-soft">abrir</Link>
                    )}
                  </span>
                </div>
              ))}

              {/* A ÚNICA LINHA DESTA TELA QUE A MÁQUINA NÃO RESOLVE. */}
              <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
                <b>O saldo de abertura é o número mais perigoso do piloto.</b> É
                digitado à mão e é o único que ninguém consegue conferir depois
                olhando o sistema — só o caderno sabe. Confira com duas pessoas,
                separadamente. Corrigir é seguro: a correção substitui a anterior
                em vez de somar.
              </p>
            </div>
          )}
        </Cartao>
      ))}
    </>
  );
}
