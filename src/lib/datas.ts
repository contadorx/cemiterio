/**
 * DIAS EM DIA CHEIO — a conta que a pessoa faz de cabeça.
 *
 * Nasceu da linha "última foto para esta família" na fila de liberação
 * (migration 0087). A diferença crua de milissegundos dá a resposta errada no
 * caso que mais aparece: uma foto enviada ONTEM às 23h e olhada hoje às 8h tem
 * nove horas de diferença, e `Math.floor(9h / 24h)` é ZERO. A tela diria "há 0
 * dias" para uma coisa que a Sureya sabe que foi ontem — e uma tela que discorda
 * do que a pessoa lembra deixa de ser consultada.
 *
 * A conta é feita sobre a DATA, não sobre o instante: quantas viradas de
 * meia-noite houve entre uma e outra.
 */

/** Meia-noite local da data, em milissegundos — o que torna a conta por dia. */
function meiaNoite(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Dias cheios desde `iso` até hoje. `null` quando não há data ou ela é inválida
 * — nunca zero: "não sei quando" e "foi hoje" são respostas diferentes, e
 * confundir as duas é o que faria a tela dizer que a família recebeu foto hoje
 * quando ela nunca recebeu nenhuma.
 */
export function diasDesde(iso: string | null | undefined, agora = new Date()): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // `round`, não `floor`: em fuso com horário de verão a diferença entre duas
  // meia-noites não é exatamente 86400000, e o floor perderia um dia.
  return Math.max(0, Math.round((meiaNoite(agora) - meiaNoite(d)) / 86400000));
}

/** "hoje", "ontem", "há 8 dias" — o jeito que se fala, não "há 1 dias". */
export function faz(dias: number): string {
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}
