import { diaOperacao } from "./vencimento";

/**
 * O SALDO DA FAMÍLIA — a regra, num lugar só.
 *
 * POR QUE ELA SAIU DA ROTA
 *
 * Ela nasceu dentro de `/api/conta-corrente` e agora é lida em dois lugares: a
 * ficha da família e a conferência. Recalcular na segunda tela seria a segunda
 * conta sobre os mesmos fatos — o defeito que este projeto mais repete (0092,
 * 0105, 0106, 0115, 0137). Duas contas começam iguais e terminam discordando,
 * e quando discordam sobre dinheiro alguém liga para uma família cobrando o
 * que ela já pagou.
 *
 * DUAS CONTAS, NÃO UMA (0114). `vencido` é o que já era devido e não foi pago —
 * é disso que se cobra. `aVencer` é competência já prestada com o vencimento lá
 * na frente: a Anninha tem seis meses lançados e não deve nada até 10/12.
 * Dizer "Em aberto · R$ 240" para ela seria falso, e dizer só "Em dia"
 * esconderia os R$ 240 que vão entrar.
 */
export interface Movimento {
  tipo: string;
  valor: number;
  /** `data` É O VENCIMENTO desde a 0114, e não o dia do lançamento. */
  data: string;
}

export interface Saldo {
  saldo: number;
  vencido: number;
  aVencer: number;
  frase: string;
  emDia: boolean;
}

const cent = (v: number) => Math.round(v * 100) / 100;

const dinheiro = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Frase escrita para ser dita ao telefone, sem tradução. Nada de "inadimplente". */
export function frasearSaldo(vencido: number, aVencer: number): string {
  const futuro = aVencer > 0.005 ? ` · ${dinheiro(aVencer)} a vencer` : "";
  if (vencido < -0.005) return `Pago adiantado · ${dinheiro(-vencido)} a favor${futuro}`;
  if (vencido > 0.005) return `Em aberto · ${dinheiro(vencido)}${futuro}`;
  return aVencer > 0.005 ? `Em dia${futuro}` : "Em dia";
}

/**
 * A LAVAGEM CONTA, quando tem valor.
 *
 * No modo consumo cada limpeza debita o que vale, e é isso que faz o saldo
 * mostrar a sobra. No modo competência ela vem com valor zero e não altera
 * nada — somar tudo funciona nos dois casos, sem precisar saber o modo aqui.
 *
 * `hoje` entra por parâmetro para quem já o calculou não pedir duas vezes; o
 * padrão é o DIA DA OPERAÇÃO, nunca o de UTC. Com `toISOString()` o dia virava
 * às 21h de Brasília e, das 21h à meia-noite, uma competência que vence hoje
 * já entrava como dívida.
 */
export function calcularSaldo(movimentos: Movimento[], hoje = diaOperacao()): Saldo {
  const soma = (filtro: (m: Movimento) => boolean) =>
    movimentos.reduce(
      (s, m) => s + (filtro(m) ? (m.tipo === "debito" ? m.valor : -m.valor) : 0), 0);

  const saldo = soma(() => true);
  const vencido = soma((m) => m.data <= hoje);
  const aVencer = movimentos.reduce(
    (s, m) => s + (m.tipo === "debito" && m.data > hoje ? m.valor : 0), 0);

  return {
    saldo: cent(saldo),
    vencido: cent(vencido),
    aVencer: cent(aVencer),
    frase: frasearSaldo(vencido, aVencer),
    // "Em dia" significa "nada VENCIDO em aberto", que é a pergunta que a
    // Sureya faz antes de ligar. Antes significava "nada lançado".
    emDia: vencido <= 0.005,
  };
}
