"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Cartao, Botao, Selo } from "../pecas";
import VisaoRelatorio from "./VisaoRelatorio";

/**
 * A DUPLA CONFERÊNCIA DO CADASTRO.
 *
 * Metade da conferência é comparar com o caderno, e essa metade é humana. A
 * outra metade — falta telefone? falta quadra? o plano está ativo sem data? —
 * o banco responde melhor, e sem cansar na décima família.
 *
 * O QUE MUDOU DEPOIS DE USAR A TELA DE VERDADE
 * ---------------------------------------------------------------------------
 * 1. OS BLOCOS VÊM PREENCHIDOS. Cada família era um clique para expandir e só
 *    então uma ida ao servidor: trinta famílias eram sessenta cliques antes de
 *    ler a primeira linha. Agora o checklist já vem, e o trabalho é ler e dar
 *    o ok — que é o que a conferência é.
 *
 * 2. O TÍTULO DIZ DE QUEM É. Era "ALCANTARA · 1 jazigo · 1 pessoa · sem
 *    contrato": nome e contagem. Faltava a coisa mais útil para quem vai
 *    ligar — o nome de quem atende. Agora é "ALCANTARA — CLECIA", e as
 *    contagens descem para a segunda linha.
 *
 * 3. PENDENTE E ATENÇÃO SÃO COISAS DIFERENTES. Antes tudo que não fosse "ok"
 *    tinha o mesmo peso, e um consentimento não registrado pesava igual a um
 *    telefone faltando. Agora o que é obrigatório e falta é **pendente**
 *    (trava o piloto); o resto é **atenção** (avisa e deixa passar).
 *
 * 4. O "ABRIR" ABRE. O link ia para `/painel/clientes?familiaId=…`, um
 *    parâmetro que aquela tela não lê — caía na lista inteira e a família se
 *    perdia no meio de trezentas. Agora vai para a ficha da família, que tem
 *    exatamente o que a conferência cobra, e volta para cá.
 */

interface Item {
  item: string; situacao: string; detalhe: string; onde: string;
  obrigatorio: boolean; acao: string;
}
interface Fam {
  familia_id: string; familia: string; responsavel: string | null; telefone: string | null;
  regime: string; contratado: boolean; conferida_em: string | null;
  jazigos: number; pessoas: number; pendencias: number; avisos: number;
  o_que_falta: string | null;
}

function tomDaSituacao(s: string): "bom" | "atencao" | "neutro" {
  if (s === "ok") return "bom";
  if (s === "pendente") return "atencao";
  return "neutro";   // "CONFERIR NO CADERNO", "nao se aplica", "atencao"
}

const ROTULO_REGIME: Record<string, string> = {
  contrato: "contrato",
  avulso: "avulso",
  nao_definido: "sem regime definido",
};

export default function Conferencia() {
  // DUAS ABAS. Conferir o CADASTRO (falta telefone? falta quadra?) e conferir
  // os EVENTOS (o que foi lançado, em que competência, por qual porta) são o
  // mesmo trabalho em dois tempos — e quem faz o segundo é quem acabou de
  // fazer o primeiro. Duas telas separadas fariam a segunda ser esquecida,
  // que é o que já aconteceu com o `conferido_em` dos lançamentos: a coluna
  // existia desde a 0073 e nenhuma tela a escrevia.
  const [aba, setAba] = useState<"cadastro" | "relatorio">("cadastro");
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [itens, setItens] = useState<Record<string, Item[]>>({});
  const [fechadas, setFechadas] = useState<Set<string>>(new Set());
  const [soPendentes, setSoPendentes] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const r = await fetch("/api/conferencia").then((x) => x.json());
      if (!r.ok) throw new Error(r.erro || "falhou");
      setDados(r);
      // Os blocos já vêm preenchidos do servidor. O que passar do teto continua
      // abrindo sob demanda, e a tela não mente sobre isso.
      setItens(r.itens || {});
    } catch (e: any) {
      setErro(e?.message || "não deu para carregar");
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("aba");
    if (q === "relatorio") setAba("relatorio");
  }, []);

  async function alternar(f: Fam) {
    setFechadas((s) => {
      const n = new Set(s);
      if (n.has(f.familia_id)) n.delete(f.familia_id); else n.add(f.familia_id);
      return n;
    });
    if (itens[f.familia_id]) return;
    const r = await fetch(`/api/conferencia?familiaId=${f.familia_id}`).then((x) => x.json());
    if (r.ok) setItens((x) => ({ ...x, [f.familia_id]: r.itens }));
  }

  /** DAR O OK — recusado pelo banco enquanto houver pendência obrigatória. */
  async function darOk(f: Fam, ok: boolean) {
    setOcupado(f.familia_id);
    try {
      const r = await fetch("/api/conferencia", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familiaId: f.familia_id, ok }),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { alert(r?.mensagem || r?.erro || "não consegui salvar"); return; }
      await carregar();
    } finally { setOcupado(null); }
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
      <h1 className="text-[22px] font-semibold text-ink">Conferência</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        {([["cadastro", "Cadastro"], ["relatorio", "Relatório de eventos"]] as const).map(([v, rot]) => (
          <button key={v}
                  onClick={() => {
                    setAba(v);
                    window.history.replaceState(null, "",
                      v === "cadastro" ? "/painel/conferencia" : `/painel/conferencia?aba=${v}`);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-[14px] ${
                    aba === v ? "border-brand bg-brand text-white"
                              : "border-line bg-card text-ink hover:border-brand"}`}>
            {rot}
          </button>
        ))}
      </div>

      {aba === "relatorio" && <VisaoRelatorio />}

      {aba === "cadastro" && (<>
      <p className="mb-4 text-[14px] text-ink-soft">
        Da família mais simples para a mais complicada. Comece pelas de cima:
        se a mais simples já dá problema, o problema é do sistema, não do cadastro.
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl2 bg-brand p-4 text-sobre sm:grid-cols-4">
        {[
          [dados.resumo.total, "famílias"],
          [dados.resumo.prontas, "sem pendência"],
          [dados.resumo.conferidas, "com o seu ok"],
          [dados.resumo.prontasContratadas, "prontas e com contrato"],
        ].map(([n, rot], i) => (
          <div key={i}>
            <p className="text-[26px] font-semibold leading-tight">{n as any}</p>
            <p className="text-[12px] opacity-75">{rot as any}</p>
          </div>
        ))}
      </div>

      {/* O QUE NINGUÉM DECIDIU AINDA.
          "Sem contrato" e "avulso" não são a mesma coisa: a primeira é uma
          lacuna, a segunda é uma decisão. Enquanto forem confundidas, a família
          indecisa aparece verde. */}
      {dados.resumo.semRegime > 0 && (
        <Cartao>
          <p className="text-[15px] text-ink">
            <b>{dados.resumo.semRegime} família(s) sem regime definido.</b>{" "}
            Ninguém disse ainda se é contrato ou avulso.
          </p>
          <p className="mt-1 text-[14px] text-ink-soft">
            Não é detalhe de cadastro: são fluxos de cobrança diferentes, e a
            lavagem não espera a decisão. Abra a ficha e escolha uma das duas.
          </p>
        </Cartao>
      )}

      {dados.resumo.prontasContratadas < 5 && (
        <Cartao>
          <p className="text-[15px] text-ink">
            <b>Só {dados.resumo.prontasContratadas} família(s) pronta(s) e com contrato.</b>{" "}
            O piloto pede 5.
          </p>
          <p className="mt-1 text-[14px] text-ink-soft">
            Família avulsa não gera competência — as limpezas dela entram uma a uma,
            que é outro fluxo. Para chegar a 5: resolva as pendências das que já têm
            contrato, ou feche contrato com famílias que já têm jazigo ligado.
          </p>
        </Cartao>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Botao tom={soPendentes ? "principal" : "secundario"}
               onClick={() => setSoPendentes((v) => !v)}>
          {soPendentes ? "Mostrando só as pendentes" : "Ver só as pendentes"}
        </Botao>
        <Botao tom="secundario"
               onClick={() => setFechadas(fechadas.size ? new Set() : new Set(lista.map((f) => f.familia_id)))}>
          {fechadas.size ? "Abrir todas" : "Fechar todas"}
        </Botao>
        {dados.preenchidas < familias.length && (
          <span className="text-[13px] text-ink-soft">
            as {dados.preenchidas} primeiras já vêm conferidas; as demais abrem ao clicar
          </span>
        )}
      </div>

      {lista.map((f) => {
        const aberta = !fechadas.has(f.familia_id);
        const pend = Number(f.pendencias);
        return (
          <Cartao key={f.familia_id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <button onClick={() => alternar(f)} className="min-w-0 flex-1 text-left">
                {/* O TÍTULO: família — quem responde. */}
                {/* POR EXTENSO. "ALCANTARA — CLECIA" economiza duas palavras e
                    custa a certeza: quem lê rápido não sabe se o segundo nome
                    é o responsável, o falecido ou outra família. */}
                <span className="text-[16px] font-medium text-ink">
                  (Família - {f.familia}){" "}
                  {f.responsavel
                    ? <span className="text-ink-soft">(Responsável - {f.responsavel})</span>
                    : <span className="text-aviso">(Responsável - não definido)</span>}
                </span>
                <span className="block text-[13px] text-ink-soft">
                  {f.jazigos} jazigo{f.jazigos === 1 ? "" : "s"} · {f.pessoas} pessoa{f.pessoas === 1 ? "" : "s"}
                  {" · "}{ROTULO_REGIME[f.regime] || f.regime}
                  {f.telefone ? ` · ${f.telefone}` : ""}
                </span>
              </button>
              <span className="flex flex-shrink-0 flex-wrap items-center gap-2">
                {f.conferida_em && <Selo tom="bom">✓ conferida</Selo>}
                <Selo tom={pend === 0 ? "bom" : "atencao"}>
                  {pend === 0 ? "sem pendência" : `${pend} a corrigir`}
                </Selo>
                {Number(f.avisos) > 0 && (
                  <Selo tom="neutro">{f.avisos} aviso{Number(f.avisos) === 1 ? "" : "s"}</Selo>
                )}
              </span>
            </div>

            {aberta && (
              <div className="mt-3 border-t border-line pt-3">
                {!itens[f.familia_id] && (
                  <p className="text-[14px] text-ink-soft">Conferindo…</p>
                )}
                {(itens[f.familia_id] || []).map((i) => (
                  <div key={i.item}
                       className="flex flex-wrap items-start justify-between gap-2 border-b border-line py-2 last:border-0">
                    <span className="min-w-0">
                      <span className="text-[14px] text-ink">
                        {i.item}
                        {i.obrigatorio && (
                          <span className="ml-1 text-[12px] text-ink-soft">(obrigatório)</span>
                        )}
                      </span>
                      <span className="block text-[13px] text-ink-soft">{i.detalhe}</span>
                      {/* O QUE FAZER, em palavras de quem vai fazer. Só quando
                          há o que fazer: repetir a instrução no que já está ok
                          é ruído em toda linha. */}
                      {i.situacao === "pendente" && i.acao && (
                        <span className="block text-[13px] text-aviso">{i.acao}</span>
                      )}
                    </span>
                    <span className="flex flex-shrink-0 items-center gap-2">
                      <Selo tom={tomDaSituacao(i.situacao)}>{i.situacao}</Selo>
                      {i.situacao === "pendente" && (
                        <Link href={i.onde} className="text-[13px] underline text-ink-soft">
                          abrir
                        </Link>
                      )}
                    </span>
                  </div>
                ))}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {/* A FICHA DE VERDADE, e não uma cópia dela. Reproduzir a
                      ficha aqui criava uma segunda verdade sobre a mesma
                      família — e cada coisa que faltasse na cópia mandava a
                      pessoa para a original no meio da correção. */}
                  <Link href={`/painel/clientes/${f.familia_id}?de=conferencia`}>
                    <Botao tom="secundario">Abrir a ficha da família</Botao>
                  </Link>
                  {f.conferida_em ? (
                    <>
                      <span className="text-[13px] text-ink-soft">
                        conferida em {new Date(f.conferida_em).toLocaleDateString("pt-BR")}
                      </span>
                      <button className="text-[13px] underline text-ink-soft"
                              disabled={ocupado === f.familia_id}
                              onClick={() => darOk(f, false)}>
                        tirar o ok
                      </button>
                    </>
                  ) : (
                    <Botao tom="principal" disabled={ocupado === f.familia_id || pend > 0}
                           onClick={() => darOk(f, true)}>
                      {pend > 0 ? `Faltam ${pend} obrigatório(s)` : "Dar o ok nesta família"}
                    </Botao>
                  )}
                </div>

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
        );
      })}
      </>)}
    </>
  );
}
