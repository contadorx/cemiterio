"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A PORTA ÚNICA DE BUSCAR DADOS NA TELA.
 *
 * POR QUE ELA EXISTE
 *
 * Havia 144 `catch(() => null)` e 22 `catch(() => {})` no painel. Cada um
 * transforma uma falha de rede em lista vazia. A tela inicial era um deles: se
 * `/api/mes` caísse, a Sureya via "Nenhuma pendência neste mês. 🌿" — a mesma
 * frase de um mês realmente em dia. Ela fecharia o dia tranquila com o sistema
 * fora do ar.
 *
 * É o mesmo defeito que já mordeu o dinheiro duas vezes e que tem nome nesta
 * casa: VAZIO NÃO É ZERO. Ausência de medida não pode ser apresentada como
 * medida. Aqui ele estava solto na tela.
 *
 * OS QUATRO ESTADOS, e por que são quatro e não dois
 *
 *   carregando   ainda não sei
 *   erro         perguntei e não consegui saber — com o que fazer a respeito
 *   vazio        perguntei, soube, e a resposta é nenhum
 *   pronto       perguntei, soube, e é isto — desde tal hora
 *
 * "Vazio" e "erro" são a mesma tela em quase todo o painel hoje. São opostos:
 * um diz que não há trabalho, o outro que não dá para saber se há.
 *
 * O DADO VELHO NÃO É JOGADO FORA quando a atualização falha. Apagar a tela
 * castiga quem está olhando por um problema que não é dela. O que estava fica,
 * com o aviso de que não conseguiu atualizar e a hora em que aquilo era
 * verdade. Ver número velho SABENDO que é velho é melhor do que não ver nada,
 * e é muito melhor do que ver número velho achando que é de agora.
 */

export type Fase = "carregando" | "erro" | "pronto";

export interface Busca<T> {
  fase: Fase;
  /** O último resultado bom. Sobrevive a uma atualização que falhou. */
  dados: T | null;
  /** Frase pronta para a tela. Só existe quando `fase === "erro"`. */
  erro: string | null;
  /** Quando `dados` virou verdade. `null` enquanto nunca deu certo. */
  atualizadoEm: Date | null;
  recarregar: () => void;
}

/**
 * O erro é traduzido AQUI e não na tela: mensagem técnica em tela de trabalho
 * não ajuda quem lê e ainda assusta. Quem precisa do texto cru é o console.
 */
function frase(e: unknown): string {
  const m = String((e as any)?.message || e || "");
  if (/fetch|network|Failed to fetch|NetworkError/i.test(m)) {
    return "Não consegui falar com o sistema. Pode ser a internet daqui.";
  }
  if (/aborted|AbortError/i.test(m)) return "A busca demorou demais.";
  return "Não consegui carregar agora.";
}

/**
 * Busca uma rota do próprio app e devolve os quatro estados.
 *
 * NÃO ENGOLE NADA. Três coisas viram erro, e antes só a terceira nem isso:
 *   - o `fetch` estourar (rede, DNS, servidor fora)
 *   - o HTTP não ser 2xx
 *   - o corpo vir `{ ok: false }`
 *
 * O terceiro caso é o que mais passava batido: a rota respondia 200 dizendo
 * "não deu", o `.then` via `r.ok` falso, saía sem fazer nada, e a tela ficava
 * com o estado inicial — vazio.
 */
export function useBusca<T = any>(url: string | null, opts?: { intervalo?: number }): Busca<T> {
  const [fase, setFase] = useState<Fase>(url ? "carregando" : "pronto");
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  // Uma resposta velha que chega atrasada não pode sobrescrever a nova. Sem
  // isto, trocar de mês depressa mostra o mês anterior como se fosse o atual.
  const vez = useRef(0);

  const buscar = useCallback(async () => {
    if (!url) return;
    const minha = ++vez.current;
    setFase("carregando");
    setErro(null);
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const corpo = await r.json();
      if (corpo?.ok === false) throw new Error(corpo?.erro || "resposta_negativa");
      if (minha !== vez.current) return;
      setDados(corpo as T);
      setAtualizadoEm(new Date());
      setFase("pronto");
    } catch (e) {
      console.error(`[buscar] ${url}:`, e);
      if (minha !== vez.current) return;
      setErro(frase(e));
      setFase("erro");
    }
  }, [url]);

  useEffect(() => { buscar(); }, [buscar]);

  // Atualização de fundo é opcional e nunca é o padrão: tela que se mexe
  // sozinha enquanto alguém decide é tela que faz clicar no lugar errado.
  const intervalo = opts?.intervalo;
  useEffect(() => {
    if (!intervalo) return;
    const t = setInterval(() => { buscar(); }, intervalo);
    return () => clearInterval(t);
  }, [intervalo, buscar]);

  return { fase, dados, erro, atualizadoEm, recarregar: buscar };
}

/** "14:32" — a hora em que aquele número era verdade. */
export function horaCurta(d: Date | null): string {
  if (!d) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
