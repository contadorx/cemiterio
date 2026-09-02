/**
 * O NOME DO LUGAR TEM UMA FORMA SÓ.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO EXISTE
 * ---------------------------------------------------------------------------
 * A rota de cadastro de jazigo já traz a lição escrita:
 *
 *   "Antes esta rota criava a quadra quando o código não existia. Parecia
 *    gentil e foi o que produziu treze quadras para um cemitério de quatro:
 *    'QD 1', 'Q1', 'Qd 1', 'Q01' e 'Quadra 1' eram o mesmo lugar do mundo real
 *    em cinco registros diferentes — e o roteiro do dia se perdia no meio."
 *
 * A resposta de lá foi proibir criar por texto livre. Mas alguém tem de criar
 * a primeira quadra de um cemitério novo — e é aí que a digitação volta. Se a
 * tela de criar aceitasse qualquer forma, as treze quadras nasceriam de novo,
 * só que uma tela adiante.
 *
 * Então a forma é decidida aqui, num lugar só, e a mesma função responde
 * "isto já existe?" antes de gravar.
 */

/** Espaços colapsados, sem acento perdido, sem sobra nas pontas. */
function limpo(s: string): string {
  return String(s || "").replace(/\s+/g, " ").trim();
}

/**
 * A QUADRA: `Q` + número, sempre.
 *
 * "QD 1", "Q1", "Qd 1", "Q01", "Quadra 1" e "quadra 01" viram todos **Q1**.
 * O zero à esquerda cai de propósito: "Q01" e "Q1" são o mesmo lugar, e mantê-
 * los diferentes é exatamente o defeito.
 *
 * O que NÃO for reconhecido volta em maiúsculas e sem espaço duplo, em vez de
 * virar um `Q` inventado — quadra chamada "FUNDOS" existe, e forçá-la a virar
 * "Q0" seria pior que aceitar o nome dela.
 */
export function formaDaQuadra(bruto: string): string {
  const s = limpo(bruto);
  if (!s) return "";
  const m = s.match(/^(?:q|qd|quadra)\s*\.?\s*0*(\d+)$/i);
  return m ? `Q${Number(m[1])}` : s.toUpperCase();
}

/**
 * A RUA: `RUA` + número, ou o nome próprio em maiúsculas.
 *
 * "R5", "rua 5", "RUA 05" e "Rua5" viram **RUA 5**. Nome sem número —
 * "PRINCIPAL", "CENTRAL" — sobrevive como está.
 */
export function formaDaRua(bruto: string): string {
  const s = limpo(bruto);
  if (!s) return "";
  const m = s.match(/^(?:r|rua)\s*\.?\s*0*(\d+)$/i);
  return m ? `RUA ${Number(m[1])}` : s.toUpperCase();
}

/**
 * DUAS FORMAS SÃO O MESMO LUGAR?
 *
 * Usada antes de gravar. O índice único do banco (cemiterio_id, codigo) só
 * pega a colisão EXATA — "Q1" contra "Q1". "QD 1" passaria por ele e criaria a
 * décima quarta quadra.
 */
export function mesmoLugar(a: string, b: string, tipo: "quadra" | "rua"): boolean {
  const f = tipo === "quadra" ? formaDaQuadra : formaDaRua;
  return f(a) === f(b) && f(a) !== "";
}
