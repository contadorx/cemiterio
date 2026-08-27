"use client";

import { useCallback, useEffect, useState } from "react";
import { Cartao, Campo, Entrada, Selecao, Botao, Selo, dinheiro } from "../../pecas";
import { useConfirmar } from "@/components/Dialogos";

/**
 * O COMBINADO DE FLORES — mora no JAZIGO, não na família.
 *
 * Pela mesma razão que a periodicidade da lavagem mora no jazigo (D-01): a
 * flor é posta num túmulo. Uma família com dois jazigos pode ter flor num e
 * não no outro, e cada um no seu ritmo.
 *
 * O QUE ESTA TELA PRECISA DIZER, e a ordem importa:
 *   1. QUANDO      "todo último sábado do mês" — por extenso, não em código
 *   2. O QUÊ       o item do catálogo e quantos
 *   3. COMO COBRA  junto com a fatura do contrato, ou sozinha
 *
 * O terceiro é o que o Leandro pediu explicitamente ("recorrentes na cobrança
 * ou avulso") e é o único que muda dinheiro. Fica visível, não escondido num
 * avançado.
 */

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// {-1} = a última do mês. Contar de trás é o que faz "último sábado"
// continuar sendo o último num mês de cinco sábados.
const RITMOS: { rotulo: string; semanas: number[] }[] = [
  { rotulo: "todo último ___ do mês", semanas: [-1] },
  { rotulo: "todo ___", semanas: [1, 2, 3, 4, 5] },
  { rotulo: "1º e 3º ___ do mês", semanas: [1, 3] },
  { rotulo: "1º ___ do mês", semanas: [1] },
  { rotulo: "2º ___ do mês", semanas: [2] },
];

const mesmoRitmo = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

export default function Flores({ familiaId, tumulos }: {
  familiaId: string | null;
  tumulos: any[];
}) {
  const perguntar = useConfirmar();
  const [d, setD] = useState<any>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [f, setF] = useState({
    tumuloId: "", extraId: "", quantidade: "1",
    diaSemana: "6", ritmo: 0, cobranca: "recorrente",
  });

  const carregar = useCallback(async () => {
    if (!familiaId) return;
    const r = await fetch(`/api/flores/assinaturas?familiaId=${familiaId}`)
      .then((x) => x.json()).catch(() => null);
    if (r?.ok) setD(r);
  }, [familiaId]);

  useEffect(() => { carregar(); }, [carregar]);

  if (!familiaId) return null;

  const assinaturas = (d?.assinaturas || []) as any[];
  const catalogo = (d?.catalogo || []) as any[];

  async function salvar() {
    setOcupado(true); setErro("");
    try {
      const r = await fetch("/api/flores/assinaturas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tumuloId: f.tumuloId || tumulos[0]?.id,
          extraId: f.extraId,
          quantidade: Number(f.quantidade.replace(",", ".")) || 1,
          diaSemana: Number(f.diaSemana),
          semanas: RITMOS[f.ritmo].semanas,
          cobranca: f.cobranca,
        }),
      }).then((x) => x.json());
      if (!r?.ok) { setErro(r?.mensagem || r?.erro || "não deu para salvar"); return; }
      setAbrindo(false);
      setF({ ...f, extraId: "", quantidade: "1" });
      carregar();
    } finally { setOcupado(false); }
  }

  async function desligar(id: string) {
    if (!await perguntar({
      oQue: "Tirar este combinado?",
      efeito: "As entregas já feitas ficam no histórico. Só param as próximas.",
      confirmar: "Tirar", tom: "perigo",
    })) return;
    const r = await fetch(`/api/flores/assinaturas?id=${id}`, { method: "DELETE" })
      .then((x) => x.json());
    if (r?.mensagem) alert(r.mensagem);
    carregar();
  }

  return (
    <Cartao
      titulo="Flores e outros extras"
      acao={
        <Botao onClick={() => setAbrindo((x) => !x)}>
          {abrindo ? "Fechar" : "Combinar"}
        </Botao>
      }
    >
      {!assinaturas.length && !abrindo && (
        <p className="text-[14px] text-ink-soft">
          Nada combinado. O que se combina aqui vira a lista do sábado em{" "}
          <b>Flores</b>, com a compra prevista.
        </p>
      )}

      {abrindo && (
        <div className="mb-3 rounded-lg bg-surface p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {tumulos.length > 1 && (
              <Campo rotulo="Em qual jazigo">
                <Selecao value={f.tumuloId || tumulos[0]?.id}
                         onChange={(e: any) => setF({ ...f, tumuloId: e.target.value })}>
                  {tumulos.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.identificacao || t.codigo}</option>
                  ))}
                </Selecao>
              </Campo>
            )}

            <Campo rotulo="O que se põe">
              <Selecao value={f.extraId}
                       onChange={(e: any) => setF({ ...f, extraId: e.target.value })}>
                <option value="">escolha…</option>
                {catalogo.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} — {dinheiro(c.preco)} o {c.unidade}
                  </option>
                ))}
              </Selecao>
            </Campo>

            <Campo rotulo="Quantos">
              <Entrada inputMode="decimal" value={f.quantidade}
                       onChange={(e: any) => setF({ ...f, quantidade: e.target.value })} />
            </Campo>

            <Campo rotulo="Em que dia">
              <Selecao value={f.diaSemana}
                       onChange={(e: any) => setF({ ...f, diaSemana: e.target.value })}>
                {DIAS.map((dia, i) => <option key={i} value={i}>{dia}</option>)}
              </Selecao>
            </Campo>

            <Campo rotulo="Com que frequência">
              <Selecao value={String(f.ritmo)}
                       onChange={(e: any) => setF({ ...f, ritmo: Number(e.target.value) })}>
                {RITMOS.map((r, i) => (
                  <option key={i} value={i}>
                    {r.rotulo.replace("___", DIAS[Number(f.diaSemana)])}
                  </option>
                ))}
              </Selecao>
            </Campo>

            {/* O ÚNICO CAMPO QUE MUDA DINHEIRO fica visível, com a consequência
                escrita — e não um rótulo que só faz sentido para quem escreveu
                o sistema. */}
            <Campo rotulo="Como se cobra"
                   dica={f.cobranca === "recorrente"
                     ? "entra na mesma conta do contrato do jazigo"
                     : "vence sozinha, no dia de vencimento da casa"}>
              <Selecao value={f.cobranca}
                       onChange={(e: any) => setF({ ...f, cobranca: e.target.value })}>
                <option value="recorrente">junto com a fatura do contrato</option>
                <option value="avulso">sozinha, a cada entrega</option>
              </Selecao>
            </Campo>
          </div>

          {erro && <p className="mt-2 text-[13px] text-perigo">{erro}</p>}

          <p className="mt-3 text-[13px] text-ink-soft">
            Só se cobra o que for <b>entregue</b>. A data combinada entra na
            lista do sábado; o dinheiro nasce quando você marca a entrega.
          </p>

          <div className="mt-3 flex gap-2">
            <Botao tom="principal" onClick={salvar}
                   disabled={ocupado || !f.extraId || (!f.tumuloId && !tumulos.length)}>
              {ocupado ? "Salvando…" : "Combinar"}
            </Botao>
            <Botao onClick={() => setAbrindo(false)}>Cancelar</Botao>
          </div>
        </div>
      )}

      {assinaturas.map((a: any) => (
        <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-2.5 first:border-t-0">
          <div className="min-w-0">
            <p className="text-[15px] text-ink">
              {Number(a.quantidade)} {a.unidade} · {a.nome}
              {!a.ativo && <span className="text-ink-soft"> · desligado</span>}
            </p>
            {/* A FRASE, e não {dia_semana: 6, semanas: [-1]}. Um combinado que
                ninguém consegue ler é um combinado que ninguém confere. */}
            <p className="text-[13px] text-ink-soft">
              {a.ritmo}
              {a.jazigo && ` · ${a.jazigo}`}
              {a.proxima && ` · próxima ${new Date(a.proxima + "T12:00:00").toLocaleDateString("pt-BR")}`}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <Selo tom={a.cobranca === "recorrente" ? "neutro" : "atencao"}>
              {a.cobranca === "recorrente" ? "na fatura" : "avulsa"}
            </Selo>
            <span className="text-[14px] font-semibold text-ink">
              {dinheiro(a.quantidade * a.preco)}
            </span>
            <button onClick={() => desligar(a.id)}
                    className="text-[13px] text-ink-soft underline">
              tirar
            </button>
          </div>
        </div>
      ))}
    </Cartao>
  );
}
