/**
 * OS DIAS EM QUE SE TRABALHA — UM LUGAR SÓ.
 *
 * Existiam DUAS respostas para "quantos dias por semana a casa trabalha":
 *   · `orgs.dias_semana`             — a LISTA de dias, que o alocador usa;
 *   · `orgs.dias_trabalhados_semana` — um NÚMERO solto, que a precificação usa.
 * O comentário da precificação dizia, com todas as letras, que a capacidade
 * vinha "da mesma configuração que o alocador usa". Vinha de outra coluna.
 * Tirar o sábado da lista não mexia no número, e as duas telas discordavam
 * sobre quantas lavagens cabem no mês — cada uma certa segundo a própria conta.
 * É o mesmo defeito de forma de sempre: duas implementações de uma regra só.
 *
 * Agora quem quiser saber os dias da casa pergunta AQUI. O número solto virou
 * o que sempre deveria ter sido: um plano B para quando a lista não existir.
 */
export const DIAS_PADRAO = [1, 2, 3, 4, 5, 6];

/** 0=dom … 6=sáb. Sempre devolve pelo menos um dia. */
export function diasDaCasa(orgRow: unknown): number[] {
  const bruto = (orgRow as { dias_semana?: unknown } | null)?.dias_semana;
  if (Array.isArray(bruto) && bruto.length) {
    const limpos = bruto
      .map((x) => Number(x))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
    if (limpos.length) return [...new Set(limpos)].sort((a, b) => a - b);
  }
  const n = Number((orgRow as { dias_trabalhados_semana?: unknown } | null)?.dias_trabalhados_semana);
  return Number.isFinite(n) && n > 0 && n <= 7 ? DIAS_PADRAO.slice(0, n) : DIAS_PADRAO;
}

/**
 * OS DIAS QUE UM CEMITÉRIO REALMENTE RENDE.
 *
 * O alocador só monta rota num dia que sirva à casa E ao cemitério. Quando o
 * cemitério não marca dia nenhum, ele herda a casa inteira — esse é o padrão.
 * Quando marca, o que vale é a INTERSEÇÃO, e ela pode ser VAZIA: Santa Lídia
 * aberto só sábado e domingo, com a casa trabalhando de segunda a sexta, dá
 * zero dias. O alocador então não agenda nada ali, para sempre, sem reclamar.
 *
 * Vazio não é zero: essa lista existe para que a tela possa DIZER isso, em vez
 * de mostrar um cemitério calado que nunca aparece na agenda.
 */
export function diasQueRendem(casa: number[], doCemiterio: number[] | null | undefined): number[] {
  if (!Array.isArray(doCemiterio) || !doCemiterio.length) return casa;
  return casa.filter((d) => doCemiterio.includes(d));
}
