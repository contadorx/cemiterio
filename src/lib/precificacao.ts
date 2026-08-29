import { diaOperacao } from "./vencimento";

/**
 * A CONTA DA PRECIFICAÇÃO — uma regra só, testável, sem banco.
 *
 * ---------------------------------------------------------------------------
 * A ARMADILHA QUE ESTA TELA EXISTE PARA NÃO CAIR
 * ---------------------------------------------------------------------------
 * "Quanto custa uma lavagem?" tem DUAS respostas certas, e usar uma no lugar
 * da outra custa dinheiro nos dois sentidos:
 *
 *   CUSTO CHEIO      o pagamento da ajudante dividido pelas lavagens que ela
 *                    de fato faz hoje. É o número que responde "este contrato
 *                    paga o próprio custo?".
 *
 *   CUSTO DE MAIS UM o que a próxima lavagem acrescenta de verdade. Enquanto
 *                    houver folga na agenda, a ajudante já está paga e já está
 *                    no cemitério: a lavagem a mais custa material e o tempo
 *                    dela, não um salário novo.
 *
 * Trocar os dois erra assim:
 *   usar o cheio como marginal   →  recusa cliente a R$ 12 que ADICIONARIA
 *                                   dinheiro, porque a agenda está com folga.
 *   usar o marginal como cheio   →  acha que tudo dá lucro, nunca sobe o piso,
 *                                   e o dia em que a agenda encher a conta não
 *                                   fecha.
 *
 * Por isso a função devolve OS DOIS, sempre, com nome. Nenhuma tela deste
 * sistema pode mostrar um e chamar de "o custo".
 *
 * ---------------------------------------------------------------------------
 * SEMANAS NO MÊS
 * ---------------------------------------------------------------------------
 * 4,345 = 365,25 / 7 / 12. Usar 4 subestimaria a carga semanal em 8%, e é
 * justamente na periodicidade semanal que os contratos mais baratos estão.
 */
export const SEMANAS_MES = 4.345;

/** Quantas lavagens por mês cada periodicidade consome. */
export function lavagensPorMes(periodicidade: string | null): number | null {
  switch ((periodicidade || "").toLowerCase()) {
    case "semanal":   return SEMANAS_MES;
    case "quinzenal": return 2;
    case "mensal":    return 1;
    // PERIODICIDADE DESCONHECIDA NÃO VIRA ZERO. Zero faria o contrato parecer
    // trabalho de graça — margem infinita — e ele subiria para o topo da lista
    // de "melhores contratos". Ausência não é medida.
    default: return null;
  }
}

export type Contrato = {
  id: string;
  familia: string | null;
  codigo: string | null;
  periodicidade: string | null;
  valorMensal: number | null;
};

export type Custos = {
  /** O que sai por mês independentemente de quantas lavagens acontecem. */
  ajudanteMes: number;
  /** O que cada lavagem consome de material (balde, pano, produto). */
  materialPorLavagem: number;
  /** Transporte por lavagem — condução, combustível. */
  transportePorLavagem: number;
  /** Sistema, IA, telefone: fixo do mês. */
  sistemaMes: number;
};

export type LinhaContrato = Contrato & {
  lavagensMes: number | null;
  porLavagem: number | null;
  /** Sobra por mês DESTE contrato, pelo custo cheio. */
  sobraMes: number | null;
  situacao: "abaixo do custo" | "apertado" | "saudavel" | "nao da para dizer";
};

export type Precificacao = {
  contratos: number;
  semPeriodicidade: number;
  lavagensMes: number;
  receitaMes: number;
  receitaPorLavagem: number | null;

  capacidadeMes: number | null;
  utilizacao: number | null;

  custoFixoMes: number;
  custoVariavelPorLavagem: number;
  /** Fixo rateado pelas lavagens que EXISTEM + variável. */
  custoCheioPorLavagem: number | null;
  /** Só o variável: o que a próxima lavagem acrescenta com a agenda com folga. */
  custoDeMaisUm: number;

  sobraMes: number;
  /** Quantas lavagens pagam o fixo, ao preço médio de hoje. */
  equilibrioLavagens: number | null;
  /** Quantas ainda cabem na agenda. */
  folgaLavagens: number | null;

  linhas: LinhaContrato[];
  abaixoDoCusto: number;
  apertados: number;
  em: string;
};

function cent(n: number): number { return Math.round(n * 100) / 100; }

export function precificar(
  contratos: Contrato[],
  custos: Custos,
  capacidadeMes: number | null,
  hoje = diaOperacao(),
): Precificacao {
  const custoFixoMes = (custos.ajudanteMes || 0) + (custos.sistemaMes || 0);
  const custoVar = (custos.materialPorLavagem || 0) + (custos.transportePorLavagem || 0);

  let lavagensMes = 0;
  let receitaMes = 0;
  let semPeriodicidade = 0;

  const parciais = contratos.map((c) => {
    const lav = lavagensPorMes(c.periodicidade);
    const v = typeof c.valorMensal === "number" ? c.valorMensal : null;
    if (lav === null || v === null) semPeriodicidade++;
    else { lavagensMes += lav; receitaMes += v; }
    return { c, lav, v };
  });

  const receitaPorLavagem = lavagensMes > 0 ? receitaMes / lavagensMes : null;
  // O FIXO SÓ SE RATEIA SE HOUVER SOBRE O QUE. Dividir por zero lavagens daria
  // Infinity, e Infinity numa tela de dinheiro é pior que uma tela vazia.
  const custoCheioPorLavagem = lavagensMes > 0 ? custoFixoMes / lavagensMes + custoVar : null;

  const linhas: LinhaContrato[] = parciais.map(({ c, lav, v }) => {
    if (lav === null || v === null || custoCheioPorLavagem === null) {
      return { ...c, lavagensMes: lav, porLavagem: null, sobraMes: null,
               situacao: "nao da para dizer" };
    }
    const porLavagem = v / lav;
    const sobraMes = cent(lav * (porLavagem - custoCheioPorLavagem));
    const situacao: LinhaContrato["situacao"] =
      porLavagem < custoCheioPorLavagem ? "abaixo do custo"
      : porLavagem < custoCheioPorLavagem * 1.5 ? "apertado"
      : "saudavel";
    return { ...c, lavagensMes: lav, porLavagem: cent(porLavagem), sobraMes, situacao };
  });

  return {
    contratos: contratos.length,
    semPeriodicidade,
    lavagensMes: Math.round(lavagensMes * 10) / 10,
    receitaMes: cent(receitaMes),
    receitaPorLavagem: receitaPorLavagem === null ? null : cent(receitaPorLavagem),
    capacidadeMes,
    utilizacao: capacidadeMes && capacidadeMes > 0
      ? Math.round((lavagensMes / capacidadeMes) * 1000) / 10 : null,
    custoFixoMes: cent(custoFixoMes),
    custoVariavelPorLavagem: cent(custoVar),
    custoCheioPorLavagem: custoCheioPorLavagem === null ? null : cent(custoCheioPorLavagem),
    custoDeMaisUm: cent(custoVar),
    sobraMes: cent(receitaMes - custoFixoMes - lavagensMes * custoVar),
    equilibrioLavagens: receitaPorLavagem && receitaPorLavagem > custoVar
      ? Math.round((custoFixoMes / (receitaPorLavagem - custoVar)) * 10) / 10 : null,
    folgaLavagens: capacidadeMes === null ? null
      : Math.round((capacidadeMes - lavagensMes) * 10) / 10,
    linhas,
    abaixoDoCusto: linhas.filter((l) => l.situacao === "abaixo do custo").length,
    apertados: linhas.filter((l) => l.situacao === "apertado").length,
    em: hoje,
  };
}
