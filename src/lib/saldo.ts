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

/** Um mês da conta: o que ele cobra, o que já entrou nele, e o que falta. */
export interface MesDaConta {
  /** "AAAA-MM". */
  competencia: string;
  devido: number;
  pago: number;
  falta: number;
  quitado: boolean;
}

export interface MovimentoComMes extends Movimento {
  competencia?: string | null;
}

/**
 * A CONTA, MÊS A MÊS.
 *
 * `calcularSaldo` responde "quanto ela deve". Não responde a pergunta que se
 * faz olhando um comprovante no WhatsApp: *de qual mês é este pagamento, e
 * qual mês ainda falta?* Para responder isso a Sureya abria três telas — a
 * conversa, o comprovante e a ficha — e comparava de cabeça.
 *
 * NÃO HÁ REGRA NOVA AQUI, E ISSO É DE PROPÓSITO. Não se adivinha qual mês um
 * pagamento cobre: `competencia` é um campo declarado nas DUAS pontas, no
 * débito e no crédito, e medido em 02/09 os 230 lançamentos da casa têm todos
 * o seu. Esta função só AGRUPA por ele e soma. Inventar um casamento de
 * pagamento com mês seria uma segunda verdade sobre dinheiro, e este projeto
 * já sabe onde isso termina.
 *
 * Lançamento sem competência não é somado a mês nenhum — sai na chave vazia,
 * para quem chama decidir o que dizer. Empurrá-lo para o mês corrente seria
 * apresentar um palpite como se fosse o que está escrito.
 */
export function porCompetencia(movimentos: MovimentoComMes[]): MesDaConta[] {
  const meses = new Map<string, { devido: number; pago: number }>();
  for (const m of movimentos) {
    const comp = String(m.competencia || "").slice(0, 7);
    if (!comp) continue;
    const alvo = meses.get(comp) || { devido: 0, pago: 0 };
    if (m.tipo === "debito") alvo.devido += m.valor;
    else alvo.pago += m.valor;
    meses.set(comp, alvo);
  }
  return [...meses.entries()]
    .map(([competencia, v]) => ({
      competencia,
      devido: cent(v.devido),
      pago: cent(v.pago),
      falta: cent(v.devido - v.pago),
      // meio centavo de folga: o mesmo critério que `calcularSaldo` usa para
      // não chamar de devedora quem pagou tudo e sobrou arredondamento
      quitado: v.devido - v.pago <= 0.005,
    }))
    .sort((a, b) => (a.competencia < b.competencia ? -1 : 1));
}
