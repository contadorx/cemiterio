/**
 * CONTA CORRENTE DA FAMÍLIA
 *
 * A regra, em uma linha:
 *   LAVAGEM LANÇA DÉBITO. PAGAMENTO LANÇA CRÉDITO. O SALDO DIZ SE ESTÁ EM DIA.
 *
 * ONDE MORA O CONTRATO
 * A Sureya combina UM valor com a família, mesmo que ela tenha dois túmulos —
 * mas cada túmulo pode ser limpo num ritmo diferente. Por isso:
 *
 *   familia -> valor_mensal, freq_pagamento, inicio_cobranca   (o contrato)
 *   tumulo  -> periodicidade                                    (o trabalho)
 *
 * Isto já esteve todo no túmulo, e com dois túmulos na mesma família gerava
 * DUAS cobranças onde existe uma só: a família receberia o dobro.
 *
 * POR QUE POR COMPETÊNCIA, E NÃO POR EXECUÇÃO
 * A lavagem falha de maneiras honestas: a foto não sobe, o celular fica sem
 * sinal, a Nina esquece de tocar no botão. Se o débito nascesse do registro do
 * serviço, cada falha viraria dinheiro perdido — e em silêncio, que é o pior
 * tipo.
 */

export type Periodicidade =
  | "semanal" | "quinzenal" | "mensal" | "bimestral" | "trimestral" | "semestral" | "anual";

export type FreqPagamento = "mensal" | "trimestral" | "semestral" | "anual";

export interface FamiliaCobranca {
  familiaId: string;
  contratado: boolean;
  /** O valor combinado. Um só, mesmo com vários túmulos. */
  valorMensal: number;
  /**
   * O QUE O VALOR SIGNIFICA.
   *
   *   "mes"      -> é o valor de UM MÊS; a cobrança é ele vezes os meses do
   *                 ciclo. R$ 100/mês pago por semestre cobra R$ 600.
   *   "cobranca" -> é o valor de CADA COBRANÇA, exatamente como sai. Existe
   *                 combinado dito assim ("R$ 600 por semestre"), e obrigar a
   *                 Sureya a dividir de cabeça é pedir erro.
   */
  valorBase?: "mes" | "cobranca";
  freqPagamento: FreqPagamento | null;
  /** "2026-03-01" — ancora o ciclo e barra competência anterior. */
  inicioCobranca?: string | null;
}

export interface Lancamento {
  familiaId: string;
  tumuloId: string | null;
  tipo: "debito" | "credito";
  origem: "competencia" | "avulso" | "pagamento" | "ajuste";
  competencia: string | null;     // "2026-03-01"
  valor: number;
  descricao: string;
}

const MESES_DO_CICLO: Record<FreqPagamento, number> = {
  mensal: 1, trimestral: 3, semestral: 6, anual: 12,
};

/** Primeiro dia do mês, no formato de competência. */
export function competenciaDe(data: Date): string {
  const a = data.getFullYear();
  const m = String(data.getMonth() + 1).padStart(2, "0");
  return `${a}-${m}-01`;
}

/** Arredonda para centavos — evita centavo fantasma no extrato da família. */
const centavos = (v: number) => Math.round(v * 100) / 100;

/**
 * O débito de uma competência.
 *
 * A frequência de pagamento decide QUANDO cobrar; o valor mensal decide
 * QUANTO. Uma família de R$ 40 por mês que paga por trimestre recebe um
 * lançamento a cada três meses, de R$ 120.
 *
 * Devolve null quando o mês não fecha ciclo — aí não há o que cobrar.
 */
export function debitoDaCompetencia(
  f: FamiliaCobranca,
  competencia: string
): Lancamento | null {
  if (!f.contratado || !f.freqPagamento || !(f.valorMensal > 0)) return null;

  // ANTES DO INÍCIO NÃO SE COBRA. Sem esta trava, rodar o fechamento de um mês
  // passado geraria débito para quem ainda nem era cliente.
  if (f.inicioCobranca && competencia < f.inicioCobranca.slice(0, 10)) return null;

  const passo = MESES_DO_CICLO[f.freqPagamento];
  const mes = Number(competencia.slice(5, 7));

  // O ciclo fecha a cada `passo` meses, contados do mês em que a cobrança
  // começou: um plano anual que começa em março cobra em março, não em janeiro.
  const ancora = f.inicioCobranca ? Number(f.inicioCobranca.slice(5, 7)) : 1;
  if (((mes - ancora + 12) % 12) % passo !== 0) return null;

  const valor = centavos(
    (f.valorBase ?? "mes") === "cobranca" ? f.valorMensal : f.valorMensal * passo
  );
  if (valor <= 0) return null;

  const rotulo: Record<FreqPagamento, string> = {
    mensal: "1 mês", trimestral: "3 meses", semestral: "6 meses", anual: "12 meses",
  };

  return {
    familiaId: f.familiaId,
    tumuloId: null,          // o contrato é da família, não de uma pedra
    tipo: "debito",
    origem: "competencia",
    competencia,
    valor,
    descricao: `Manutenção · ${rotulo[f.freqPagamento]}`,
  };
}

/**
 * SERVIÇO AVULSO — a família sem plano.
 *
 * Família cadastrada, túmulo cadastrado, nenhum serviço contratado. A lavagem
 * entra como débito único, sem competência. É a mesma conta corrente: por isso
 * o modelo acomoda o avulso sem inventar estrutura nova.
 */
export function debitoAvulso(
  familiaId: string,
  tumuloId: string | null,
  valor: number,
  descricao: string
): Lancamento {
  return {
    familiaId, tumuloId,
    tipo: "debito", origem: "avulso",
    competencia: null,
    valor: centavos(valor),
    descricao,
  };
}

/** Pagamento recebido. */
export function credito(
  familiaId: string,
  valor: number,
  descricao = "Pagamento recebido"
): Lancamento {
  return {
    familiaId, tumuloId: null,
    tipo: "credito", origem: "pagamento",
    competencia: null,
    valor: centavos(valor),
    descricao,
  };
}

/** Saldo: positivo = a família deve. Negativo = crédito a favor dela. */
export function saldo(lancamentos: Lancamento[]): number {
  return centavos(
    lancamentos.reduce((s, l) => s + (l.tipo === "debito" ? l.valor : -l.valor), 0)
  );
}

export interface SituacaoFamilia {
  saldo: number;
  emDia: boolean;
  temCredito: boolean;
  frase: string;
}

/**
 * A frase que a Sureya lê na ficha. Escrita para ser dita ao telefone sem
 * tradução: nada de "saldo devedor" ou "inadimplente".
 */
export function situacao(lancamentos: Lancamento[]): SituacaoFamilia {
  const s = saldo(lancamentos);
  const dinheiro = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (Math.abs(s) < 0.01) return { saldo: 0, emDia: true, temCredito: false, frase: "Em dia" };
  if (s < 0)
    return { saldo: s, emDia: true, temCredito: true, frase: `Pago adiantado · ${dinheiro(-s)} a favor` };
  return { saldo: s, emDia: false, temCredito: false, frase: `Em aberto · ${dinheiro(s)}` };
}

/**
 * O gerador mensal, chamado pelo cron do dia 1.
 *
 * A trava contra cobrar duas vezes NÃO está aqui — está no banco, no índice
 * único (familia_id, competencia). Regra de dinheiro se garante no banco, não
 * na tela.
 */
export function gerarCompetenciaDoMes(
  familias: FamiliaCobranca[],
  competencia: string
): Lancamento[] {
  return familias
    .map((f) => debitoDaCompetencia(f, competencia))
    .filter((l): l is Lancamento => l !== null);
}
