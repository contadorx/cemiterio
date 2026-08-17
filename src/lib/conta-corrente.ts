/**
 * CONTA CORRENTE DA FAMÍLIA
 *
 * A regra, em uma linha:
 *   LAVAGEM LANÇA DÉBITO. PAGAMENTO LANÇA CRÉDITO. O SALDO DIZ SE ESTÁ EM DIA.
 *
 * POR QUE POR COMPETÊNCIA, E NÃO POR EXECUÇÃO
 * A lavagem pode falhar de várias maneiras honestas: a foto não sobe, o
 * celular fica sem sinal no cemitério, a Nina esquece de tocar no botão.
 * Se o débito nascesse do registro do serviço, cada uma dessas falhas viraria
 * dinheiro perdido — e perdido em silêncio, que é o pior tipo.
 *
 * Por isso o débito nasce do PERÍODO DEVIDO (a competência), não do serviço
 * executado. O financeiro deixa de ser refém do operacional.
 *
 * O vínculo entre o débito e a lavagem específica pode vir depois, se um dia
 * fizer falta. No começo, não amarra.
 */

export type Periodicidade =
  | "semanal" | "quinzenal" | "mensal" | "bimestral" | "trimestral" | "semestral" | "anual";

export type FreqPagamento = "mensal" | "trimestral" | "semestral" | "anual";

export type BaseValor = "mes" | "lavagem";

export interface TumuloCobranca {
  tumuloId: string;
  familiaId: string;
  contratado: boolean;
  valorLavagem: number;
  /**
   * O QUE O VALOR SIGNIFICA.
   *
   *   "mes"      -> é o valor do MÊS, não importa quantas limpezas cabem nele.
   *                 É como a Sureya vende: "R$ 40 por mês, e eu vou toda semana".
   *   "lavagem"  -> é o preço de CADA limpeza; o mês é ele vezes a periodicidade.
   *
   * Sem este campo o sistema supunha "lavagem" e multiplicava: um contrato de
   * R$ 40 por mês com limpeza semanal virava R$ 160. Quatro vezes o combinado,
   * numa cobrança que a família não reconheceria.
   */
  valorBase?: BaseValor;
  periodicidade: Periodicidade | null;
  freqPagamento: FreqPagamento | null;
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

/** Quantas lavagens cabem em um mês, conforme a periodicidade. */
const LAVAGENS_POR_MES: Record<Periodicidade, number> = {
  semanal: 4,        // 4 e não 4,33: cobrar a mais gera atrito com a família
  quinzenal: 2,
  mensal: 1,
  bimestral: 0.5,
  trimestral: 1 / 3,
  semestral: 1 / 6,
  anual: 1 / 12,
};

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
 * O VALOR DE UM MÊS de um túmulo contratado.
 * valor da lavagem x quantas lavagens aquele mês tem.
 */
export function valorMensal(t: TumuloCobranca): number {
  if (!t.contratado || !t.periodicidade) return 0;
  // O padrão é "mes" porque é assim que o contrato é fechado. Supor
  // "lavagem" multiplicaria um valor que já é mensal.
  if ((t.valorBase ?? "mes") === "mes") return centavos(t.valorLavagem);
  return centavos(t.valorLavagem * LAVAGENS_POR_MES[t.periodicidade]);
}

/**
 * O débito de uma competência.
 *
 * A frequência de PAGAMENTO decide quando cobrar; a periodicidade da LIMPEZA
 * decide quanto. Um túmulo semanal pago por trimestre gera um lançamento a
 * cada três meses, no valor de três meses de lavagem semanal.
 *
 * Devolve null quando o mês não fecha ciclo — aí não há o que cobrar.
 */
export function debitoDaCompetencia(
  t: TumuloCobranca,
  competencia: string,
  mesInicial = 1
): Lancamento | null {
  if (!t.contratado || !t.periodicidade || !t.freqPagamento) return null;

  const mes = Number(competencia.slice(5, 7));
  const passo = MESES_DO_CICLO[t.freqPagamento];

  // O ciclo fecha a cada `passo` meses, contados a partir do mês inicial do
  // contrato. Um plano anual assinado em março cobra em março, não em janeiro.
  const desde = (mes - mesInicial + 12) % 12;
  if (desde % passo !== 0) return null;

  const valor = centavos(valorMensal(t) * passo);
  if (valor <= 0) return null;

  const rotulo: Record<FreqPagamento, string> = {
    mensal: "1 mês", trimestral: "3 meses", semestral: "6 meses", anual: "12 meses",
  };


  return {
    familiaId: t.familiaId,
    tumuloId: t.tumuloId,
    tipo: "debito",
    origem: "competencia",
    competencia,
    valor,
    descricao: `Manutenção · ${rotulo[t.freqPagamento]} · limpeza ${t.periodicidade}`,
  };
}

/**
 * SERVIÇO AVULSO — o túmulo sem plano.
 *
 * Família cadastrada, túmulo cadastrado, nenhum serviço contratado. A lavagem
 * entra como débito único, sem competência, sem recorrência. É a mesma conta
 * corrente: por isso o modelo acomoda o avulso sem inventar estrutura nova.
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
 * único (tumulo_id, competencia) da 0049. Se este código rodar duas vezes no
 * mesmo mês, o segundo insert é recusado pelo Postgres. Regra de dinheiro se
 * garante no banco, não na tela.
 */
export function gerarCompetenciaDoMes(
  tumulos: TumuloCobranca[],
  competencia: string,
  mesInicialPorTumulo: Record<string, number> = {}
): Lancamento[] {
  return tumulos
    .map((t) => debitoDaCompetencia(t, competencia, mesInicialPorTumulo[t.tumuloId] ?? 1))
    .filter((l): l is Lancamento => l !== null);
}
