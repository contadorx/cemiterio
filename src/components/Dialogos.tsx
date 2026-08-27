"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

/**
 * UMA PORTA SÓ PARA PERGUNTAR, E UMA SÓ PARA AVISAR.
 *
 * O QUE ESTAVA ERRADO
 *
 * 193 diálogos do navegador entre painel e campo: 57 `confirm`, 9 `prompt` e
 * 109 `alert` no painel, mais 18 no campo. Cada um com a aparência que o
 * navegador do dia resolve dar, nenhum dizendo o que acontece DEPOIS de
 * confirmar, nenhum com desfazer, e todos travando a tela inteira.
 *
 * Pior: eles se pareciam. "Excluir a limpeza?" e "Gerar o mês?" chegavam na
 * mesma caixinha cinza, com os mesmos dois botões. Confirmar vira reflexo, e
 * reflexo é como se apaga a coisa errada.
 *
 * DUAS PEÇAS, PORQUE SÃO DUAS COISAS
 *
 *   perguntar()   antes de um ato que custa desfazer. Trava, de propósito.
 *   recado()      depois, para dizer como foi. NÃO trava: a pessoa já agiu, e
 *                 obrigá-la a clicar "OK" para voltar ao trabalho é cobrança
 *                 sem motivo.
 *
 * Os 109 `alert` eram quase todos o segundo caso — "Não consegui salvar",
 * "3 movidas" — usando a ferramenta do primeiro.
 *
 * POR QUE `perguntar` DEVOLVE UMA PROMESSA
 *
 * `confirm()` é síncrono, e é isso que o torna tão fácil de usar:
 *
 *     if (!confirm("...")) return;
 *     await excluir();
 *
 * Uma peça de React normal obrigaria a partir cada uma dessas funções em duas,
 * com estado no meio — 66 lugares reescritos, 66 chances de errar. Com promessa,
 * a linha muda de `confirm(` para `await perguntar(`, e o resto fica igual.
 */

export interface Pedido {
  /** O ato, na voz de quem vai fazer: "Excluir a limpeza de Maria Aparecida". */
  oQue: string;
  /** O QUE ACONTECE DEPOIS. É a parte que o `confirm()` nunca teve. */
  efeito: string;
  /** Rótulo do botão que confirma. Diga o verbo, não "OK". */
  confirmar?: string;
  tom?: "perigo" | "normal";
  /**
   * Quando existe, a pessoa precisa escrever algo para poder confirmar — é o
   * `prompt()` embutido aqui, em vez de um segundo diálogo depois do primeiro.
   */
  pedirMotivo?: string;
  /** Idem para uma data. Os dois juntos substituem `prompt` em fila. */
  pedirData?: string;
  dataInicial?: string;
  /** E para um valor em reais — o `prompt` de "pagar quanto?". */
  pedirValor?: string;
  valorInicial?: string;
  /** O motivo é opcional (o botão libera sem ele). A data pedida nunca é. */
  motivoOpcional?: boolean;
  dica?: string;
}

export interface Campos { motivo: string; data: string; valor: string }

/**
 * `false` = desistiu. `true` = confirmou e não havia campo a preencher.
 * `Campos` = confirmou, com o que ela escreveu.
 *
 * Devolver o objeto em vez de uma string solta foi conserto de erro meu: ao
 * converter o adiamento eu troquei o `prompt` da data por uma sugestão fixa de
 * sete dias, e com isso TIREI a escolha da data — que era o ponto inteiro de
 * "a família combinou dia 15".
 */
export type Resposta = false | true | Campos;

interface Recado {
  id: number;
  tom: "ok" | "erro" | "aviso";
  texto: string;
  desfazer?: () => void;
}

interface Balcao {
  perguntar: (p: Pedido) => Promise<Resposta>;
  recado: {
    ok: (texto: string, opcoes?: { desfazer?: () => void }) => void;
    erro: (texto: string) => void;
    aviso: (texto: string) => void;
  };
}

const Ctx = createContext<Balcao | null>(null);

/**
 * Fora do provedor, o pedido não pode simplesmente sumir — um `confirm` que
 * não aparece e devolve `false` faz o botão parecer quebrado; devolver `true`
 * seria pior ainda, porque executaria o ato sem ninguém confirmar. Cai no
 * diálogo do navegador, que é feio mas é honesto.
 */
const SEM_PROVEDOR: Balcao = {
  perguntar: async (p) =>
    typeof window !== "undefined" && window.confirm(`${p.oQue}\n\n${p.efeito}`),
  recado: {
    ok: (t) => typeof window !== "undefined" && window.alert(t),
    erro: (t) => typeof window !== "undefined" && window.alert(t),
    aviso: (t) => typeof window !== "undefined" && window.alert(t),
  },
};

export function useConfirmar() {
  return (useContext(Ctx) || SEM_PROVEDOR).perguntar;
}

export function useRecado() {
  return (useContext(Ctx) || SEM_PROVEDOR).recado;
}

export default function Dialogos({
  children, campo = false,
}: {
  children: React.ReactNode;
  /** No campo tudo é maior: de pé, no sol, às vezes de luva. */
  campo?: boolean;
}) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [motivo, setMotivo] = useState("");
  const [data, setData] = useState("");
  const [valor, setValor] = useState("");
  const [recados, setRecados] = useState<Recado[]>([]);
  const responder = useRef<((r: Resposta) => void) | null>(null);
  const proximo = useRef(1);

  const perguntar = useCallback((p: Pedido) => {
    setMotivo("");
    setData(p.dataInicial || "");
    setValor(p.valorInicial || "");
    setPedido(p);
    return new Promise<Resposta>((ok) => { responder.current = ok; });
  }, []);

  function fechar(r: Resposta) {
    setPedido(null);
    const f = responder.current;
    responder.current = null;
    f?.(r);
  }

  const empurrar = useCallback((tom: Recado["tom"], texto: string, desfazer?: () => void) => {
    const id = proximo.current++;
    setRecados((r) => [...r, { id, tom, texto, desfazer }]);
    // O ERRO NÃO SOME SOZINHO. Um "não consegui salvar" que desaparece em três
    // segundos é a mesma coisa que não avisar: ela estava olhando o formulário.
    // O bom e o aviso somem, porque ficar na tela depois de lidos vira estorvo.
    if (tom !== "erro") {
      setTimeout(() => setRecados((r) => r.filter((x) => x.id !== id)), desfazer ? 8000 : 4500);
    }
  }, []);

  const recado = useRef({
    ok: (t: string, o?: { desfazer?: () => void }) => empurrar("ok", t, o?.desfazer),
    erro: (t: string) => empurrar("erro", t),
    aviso: (t: string) => empurrar("aviso", t),
  }).current;

  const g = campo ? "text-[17px]" : "text-[15px]";
  const alvo = campo ? "min-h-[60px] px-5 py-4 text-[17px]" : "min-h-[46px] px-4 py-2.5 text-[15px]";

  return (
    <Ctx.Provider value={{ perguntar, recado }}>
      {children}

      {pedido && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          // Tocar fora DESISTE. Nunca confirma: o toque acidental tem de cair
          // para o lado seguro.
          onClick={(e) => { if (e.target === e.currentTarget) fechar(false); }}
        >
          <div className="w-full max-w-lg rounded-t-2xl bg-card p-5 sm:rounded-2xl">
            <p className={`font-semibold text-ink ${campo ? "text-[20px]" : "text-[18px]"}`}>
              {pedido.oQue}
            </p>

            {/* O EFEITO É O CORPO, não uma nota de rodapé. É a pergunta que o
                `confirm()` nunca respondia: e depois de eu clicar, o quê? */}
            <p className={`mt-2 leading-relaxed text-ink-soft ${g}`}>{pedido.efeito}</p>

            {pedido.pedirData && (
              <label className="mt-4 block">
                <span className="mb-1 block text-[13px] font-medium text-ink-muted">
                  {pedido.pedirData}
                </span>
                <input
                  type="date"
                  autoFocus
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className={`w-full rounded-lg border border-line bg-card px-3 py-2.5 text-ink
                              focus:border-brand focus:outline-none ${g}`}
                />
              </label>
            )}

            {pedido.pedirValor && (
              <label className="mt-4 block">
                <span className="mb-1 block text-[13px] font-medium text-ink-muted">
                  {pedido.pedirValor}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  className={`w-full rounded-lg border border-line bg-card px-3 py-2.5 text-ink
                              focus:border-brand focus:outline-none ${g}`}
                />
              </label>
            )}

            {pedido.pedirMotivo && (
              <label className="mt-4 block">
                <span className="mb-1 block text-[13px] font-medium text-ink-muted">
                  {pedido.pedirMotivo}
                </span>
                <textarea
                  autoFocus={!pedido.pedirData && !pedido.pedirValor}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className={`w-full rounded-lg border border-line bg-card px-3 py-2.5 text-ink
                              focus:border-brand focus:outline-none ${g}`}
                  rows={3}
                />
                {pedido.dica && (
                  <span className="mt-1 block text-[12px] text-ink-soft">{pedido.dica}</span>
                )}
              </label>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => fechar(false)}
                className={`rounded-lg border border-line bg-card font-medium text-ink hover:bg-surface ${alvo}`}
              >
                Deixar como está
              </button>
              <button
                // Com motivo obrigatório, confirmar sem escrever nada não é
                // decisão informada — é o Enter da pressa.
                disabled={
                  (!!pedido.pedirData && !data) ||
                  (!!pedido.pedirValor && !valor.trim()) ||
                  (!!pedido.pedirMotivo && !pedido.motivoOpcional && !motivo.trim())
                }
                onClick={() =>
                  fechar(pedido.pedirMotivo || pedido.pedirData || pedido.pedirValor
                    ? { motivo: motivo.trim(), data, valor: valor.trim() }
                    : true)
                }
                className={`rounded-lg border border-transparent font-semibold text-sobre
                            disabled:opacity-50 ${alvo} ${
                  pedido.tom === "perigo" ? "bg-perigo hover:opacity-90" : "bg-brand hover:bg-brand-dark"
                }`}
              >
                {pedido.confirmar || "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {recados.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex flex-col items-center gap-2 p-4">
          {recados.map((r) => (
            <div
              key={r.id}
              role={r.tom === "erro" ? "alert" : "status"}
              className={`pointer-events-auto flex w-full max-w-lg flex-wrap items-center justify-between
                          gap-3 rounded-xl2 border p-4 shadow-lg ${g} ${
                r.tom === "erro"
                  ? "border-perigo/40 bg-perigo/10 text-perigo"
                  : r.tom === "aviso"
                    ? "border-aviso/40 bg-aviso/10 text-aviso"
                    : "border-positivo/40 bg-positivo/10 text-positivo"
              }`}
            >
              <span className="min-w-0 font-medium">{r.texto}</span>
              <span className="flex shrink-0 gap-2">
                {/* DESFAZER — para o que não é dinheiro. Um descarte de mensagem
                    tocado sem querer se resolve aqui, e não com uma pergunta a
                    mais antes de todo descarte. */}
                {r.desfazer && (
                  <button
                    onClick={() => {
                      r.desfazer?.();
                      setRecados((x) => x.filter((y) => y.id !== r.id));
                    }}
                    className="rounded-lg border border-current px-3 py-1.5 font-semibold"
                  >
                    Desfazer
                  </button>
                )}
                <button
                  onClick={() => setRecados((x) => x.filter((y) => y.id !== r.id))}
                  aria-label="fechar"
                  className="rounded-lg px-2 py-1.5 opacity-70"
                >
                  ✕
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </Ctx.Provider>
  );
}
