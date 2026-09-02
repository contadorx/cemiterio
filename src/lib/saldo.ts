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
  /** O vencimento mais antigo deste mês. Nulo quando o mês só tem crédito. */
  vence: string | null;
  /** Falta pagar E o prazo já passou. É isto que é atraso. */
  atrasado: boolean;
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
export function porCompetencia(
  movimentos: MovimentoComMes[],
  hoje = diaOperacao(),
): MesDaConta[] {
  const meses = new Map<string, { devido: number; pago: number; vence: string | null }>();
  for (const m of movimentos) {
    const comp = String(m.competencia || "").slice(0, 7);
    if (!comp) continue;
    const alvo = meses.get(comp) || { devido: 0, pago: 0, vence: null as string | null };
    if (m.tipo === "debito") {
      alvo.devido += m.valor;
      // `data` É O VENCIMENTO desde a 0114. O mais ANTIGO manda: um mês com
      // duas cobranças está atrasado desde a primeira que venceu, não desde a
      // última — dizer o contrário faria o atraso parecer mais novo do que é.
      if (!alvo.vence || m.data < alvo.vence) alvo.vence = m.data;
    } else {
      alvo.pago += m.valor;
    }
    meses.set(comp, alvo);
  }
  return [...meses.entries()]
    .map(([competencia, v]) => {
      // meio centavo de folga: o mesmo critério que `calcularSaldo` usa para
      // não chamar de devedora quem pagou tudo e sobrou arredondamento
      const quitado = v.devido - v.pago <= 0.005;
      return {
        competencia,
        devido: cent(v.devido),
        pago: cent(v.pago),
        falta: cent(v.devido - v.pago),
        quitado,
        vence: v.vence,
        // ==================================================================
        // EM ABERTO NÃO É ATRASADO
        // ==================================================================
        //
        // Medido em 02/09: 158 meses com saldo em aberto na casa. Destes,
        // apenas 55 estavam de fato vencidos — os outros 103 são cobranças
        // cujo prazo ainda não chegou. Uma tela que chama os 158 de "falta"
        // faz 21 famílias em atraso parecerem 71, e transforma a pergunta
        // "este pagamento é de atrasados?" num palpite.
        //
        // O critério é o mesmo de `calcularSaldo`: venceu quando `data` já
        // passou do DIA DA OPERAÇÃO. Mês sem débito nenhum nunca é atraso.
        atrasado: !quitado && !!v.vence && v.vence <= hoje,
      };
    })
    .sort((a, b) => (a.competencia < b.competencia ? -1 : 1));
}

/**
 * A FRASE QUE RESPONDE "ESTE PAGAMENTO É DE ATRASADOS?".
 *
 * Escrita para ser lida de relance, ao lado do comprovante que a família
 * acabou de mandar. Diz os meses em atraso pelo nome; quando não há atraso,
 * diz isso e diz quando vence o próximo — porque "nada atrasado" sozinho
 * deixa a pessoa sem saber se pode cobrar ou não.
 */
export function frasearAtraso(meses: MesDaConta[], hoje = diaOperacao()): string {
  const mm = (c: string) => c.slice(5) + "/" + c.slice(0, 4);
  const atrasados = meses.filter((m) => m.atrasado);
  if (atrasados.length) {
    const nomes = atrasados.map((m) => mm(m.competencia));
    const lista = nomes.length === 1 ? nomes[0]
      : nomes.slice(0, -1).join(", ") + " e " + nomes[nomes.length - 1];
    const total = atrasados.reduce((s, m) => s + m.falta, 0);
    return `Em atraso: ${lista} · ${dinheiro(cent(total))}`;
  }
  const proximo = meses.find((m) => !m.quitado && m.vence && m.vence > hoje);
  if (proximo) {
    const [a, m2, d] = String(proximo.vence).split("-");
    return `Nada atrasado — o próximo vence ${d}/${m2}/${a}`;
  }
  return "Nada atrasado, nada em aberto";
}
