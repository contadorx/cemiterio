// Datas do plano a partir da periodicidade — para o vencimento não ser 100%
// manual. Antes, próxima cobrança e "pago até" só existiam se alguém digitasse
// jazigo a jazigo, e o alerta "falta data" acendia para todo mundo.

export const FUSO = "America/Sao_Paulo";

/**
 * O DIA DE HOJE da operação (AAAA-MM-DD), no fuso de São Paulo — nunca em UTC.
 *
 * Com `toISOString()` o dia virava às 21h de Brasília: das 21h à meia-noite a
 * Gestão pintava de VERMELHO cobrança que só vence amanhã, e o Mapa (que já
 * usava o fuso certo) dizia outra coisa. Uma função só, usada no servidor e no
 * navegador, para as duas telas nunca discordarem — mesmo padrão de /api/hoje.
 */
export function diaOperacao(deslocamentoDias = 0): string {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: FUSO });
  return deslocamentoDias ? somaDias(hoje, deslocamentoDias) : hoje;
}

/**
 * Soma dias a uma data AAAA-MM-DD sem passar pelo fuso da máquina.
 *
 * A versão antiga fazia `new Date(iso + "T12:00:00")` (meia-noite/meio-dia
 * LOCAL do servidor) e devolvia `toISOString()` (dia em UTC): dava certo só
 * porque a Vercel roda em UTC. Somando em UTC puro o resultado é o mesmo em
 * qualquer máquina — e o "+7 dias" da régua não muda de valor porque o
 * navegador do escritório está num fuso com horário de verão.
 */
export function somaDias(baseISO: string, dias: number): string {
  const d = new Date(baseISO.slice(0, 10) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Soma MESES de calendário, grudando no último dia quando o mês é mais curto
 * (31/01 + 1 mês = 28/02, não 03/03).
 *
 * Antes a renovação somava `meses * 30` dias, então um plano mensal andava para
 * trás no calendário (31/01 → 02/03 → 01/04 …) e cabiam 12 ciclos em 360 dias:
 * a cada ~6 anos a família levava uma cobrança extra e o vencimento já não caía
 * no dia combinado.
 */
export function somaMeses(baseISO: string, meses: number): string {
  const [a, m, d] = baseISO.slice(0, 10).split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1, 12, 0, 0));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0, 12, 0, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

export const MESES_CADENCIA: Record<string, number> = {
  mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12, avulso: 0, por_data: 0,
};

// Cobrança do ciclo = valor mensal × meses da cadência (uma verdade só).
export function valorDoCiclo(cadencia: string, valorMensal: number): number {
  const meses = MESES_CADENCIA[cadencia] ?? 1;
  const v = Number(valorMensal) || 0;
  return meses > 0 ? Math.round(v * meses * 100) / 100 : v;
}

/**
 * VALOR MENSAL de um plano, incluindo os planos antigos.
 *
 * `valor_mensal` entrou depois (migrations/0017, sem backfill), entao plano
 * antigo tem a coluna NULL e so `valor_vigente`. Esta funcao existe para que
 * TODA a leitura desse caso passe por um lugar so.
 *
 * E ela NAO divide o valor_vigente pela cadencia — de proposito. Cheguei a
 * escrever a divisao ("valor_vigente e o valor do ciclo, anual = 12 meses de
 * uma vez") e ela estava errada: valor_vigente nasceu documentado como PRECO
 * POR LIMPEZA (migrations/0001 linha 123 e o comment de 0002), e e assim que o
 * servidor ainda o le hoje — src/lib/agenda.ts grava `valor: valor_vigente` em
 * cada servico e /api/servico/concluir debita esse numero; src/lib/proativo.ts
 * multiplica por qtd_por_passagem. Quem escreveu as linhas que tem valor_mensal
 * NULL (o importador de CSV, o seed, o schema antigo) tambem gravou ali o valor
 * de UMA cobranca, nao de um ciclo. Dividir teria transformado um plano
 * bimestral de R$ 45 em "R$ 22,50/mes" na tela e no banco, no primeiro Salvar.
 *
 * O que EXISTE de conflito: o codigo novo (valorDoCiclo, POST /api/planos)
 * escreve valor_vigente = mensal x meses da cadencia, ou seja atribui a mesma
 * coluna um terceiro significado. Isso e uma decisao de cobranca, nao de
 * codigo, e esta na carta de entrega para o Leandro decidir — junto com o
 * diagnostico em migrations/0027. Enquanto nao houver decisao, esta funcao faz
 * o minimo defensavel: mostra o numero que esta no banco, sem inventar conta.
 */
export function valorMensalDoPlano(
  _cadencia: string,
  valorMensal: number | null | undefined,
  valorVigente: number | null | undefined,
): number {
  if (valorMensal != null) return Number(valorMensal) || 0;
  return Number(valorVigente) || 0;
}

/**
 * Datas iniciais do plano no cadastro:
 *  - proximo_servico  = data da 1ª lavagem (o gerador de agenda parte daqui);
 *  - proxima_cobranca = quando cobrar da 1ª vez (na 1ª lavagem, por padrão);
 *  - pago_ate         = null (nada pago ainda).
 * Recorrente sem datas → o alerta "falta data" some sozinho. Avulso fica sem
 * datas de propósito (só entra quando pedirem).
 */
export function vencimentosIniciais(cadencia: string, inicioISO?: string): {
  proximo_servico: string | null;
  proxima_cobranca: string | null;
  pago_ate: string | null;
} {
  const meses = MESES_CADENCIA[cadencia] ?? 0;
  if (!meses) return { proximo_servico: null, proxima_cobranca: null, pago_ate: null };
  const base = (inicioISO || diaOperacao()).slice(0, 10);
  return { proximo_servico: base, proxima_cobranca: base, pago_ate: null };
}

// Avança uma data por um período de cadência (para renovar cobrança depois de paga).
export function proximaData(cadencia: string, aPartirISO: string): string | null {
  const meses = MESES_CADENCIA[cadencia] ?? 0;
  if (!meses) return null;
  return somaMeses(aPartirISO, meses);
}
