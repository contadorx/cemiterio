/**
 * AS CINCO PALAVRAS DO DINHEIRO.
 *
 * O QUE ESTAVA ERRADO
 *
 * Contado em 27/08, só no painel: "em aberto" 41 vezes, "saldo" 61, "recebido"
 * 22, "devendo" 21, "atrasado" 27, "falta pagar" 5, "a receber" 2. Sete
 * palavras para três ideias, sem nenhum lugar dizendo qual é qual.
 *
 * O risco não é estético. "Saldo" pode ser o que a família deve, o que ela tem
 * a favor, ou o caixa do mês — e as três coisas apareciam com o mesmo nome, em
 * telas vizinhas. Ler "saldo R$ 2.315" e entender "temos isso no caixa" quando
 * é "isso está na rua" é uma decisão errada com dinheiro na mesa.
 *
 * A ESCOLHA (o Leandro delegou em 27/08: "voce escolhe")
 *
 *   a receber        lançado na conta da família e ainda não entrou
 *   recebido         entrou e já está na conta dela
 *   a identificar    caiu no banco e ainda não se sabe de quem é
 *   conferido        alguém olhou e confirmou que está certo
 *   saldo da família a posição dela hoje: a receber, ou a favor dela
 *
 * ONDE EU DISCORDO DA AUDITORIA
 *
 * Ela propunha `conciliado`. Escolho **conferido**, por três razões medidas:
 *
 *   1. O BANCO JÁ FALA ASSIM. `comprovantes.status` tem o valor `a_conferir`, e
 *      `conta_corrente` tem `conferido_em`, `conferido_por` e
 *      `nota_conferencia`. Adotar "conciliado" custaria renomear um enum em
 *      produção para trocar uma palavra que funciona por uma que não.
 *   2. A TELA JÁ FALA ASSIM: "conferir" aparece 52 vezes no painel, contra 4 de
 *      "conciliar" e 1 de "conciliação".
 *   3. "Conciliação" é palavra de contabilidade, e quem usa isto não é
 *      contadora. "Conferir" é literalmente o que ela faz: olha o comprovante e
 *      diz se está certo.
 *
 * COMO USAR
 *
 * Toda tela que fala de dinheiro importa daqui. Não é para economizar letra —
 * é para que trocar uma palavra amanhã seja trocar uma linha, e não sair
 * caçando 41 ocorrências de "em aberto" com a esperança de achar todas.
 */

export const DINHEIRO = {
  /** O que foi lançado na conta da família e ainda não entrou. */
  aReceber: "a receber",
  /** Dinheiro que entrou e já está na conta da família. */
  recebido: "recebido",
  /** Caiu no banco e ainda não se sabe de quem é. */
  aIdentificar: "a identificar",
  /** Chegou com dono, mas ninguém olhou ainda. */
  aConferir: "a conferir",
  /** Alguém olhou e confirmou. */
  conferido: "conferido",
  /** A posição corrente da família. */
  saldoDaFamilia: "saldo da família",
} as const;

/**
 * O SALDO DITO POR EXTENSO, sempre pela mesma boca.
 *
 * A convenção de sinal do sistema é `negativo = a receber`, e ela já foi
 * invertida por engano três vezes em rotas diferentes (0105, 0106, 0122). Esta
 * função existe para que nenhuma tela precise lembrar do sinal: passa o número
 * e recebe a frase.
 */
export function frasedoSaldo(saldo: number): { texto: string; tom: "bom" | "atencao" | "neutro" } {
  const v = Math.round(saldo * 100) / 100;
  if (v < -0.005) return { texto: `${DINHEIRO.aReceber} ${reais(-v)}`, tom: "atencao" };
  if (v > 0.005) return { texto: `${reais(v)} a favor dela`, tom: "bom" };
  return { texto: "em dia", tom: "bom" };
}

export const reais = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * O FUNIL DO DINHEIRO — a ordem em que ele anda (CA-09).
 *
 * O Financeiro tinha uma porta só no menu, e dentro dela abas, subabas,
 * entrada, fechamento, equipe, reajustes, remuneração, gestão, jazigos e
 * conferência bancária. A consolidação do menu tinha empurrado a complexidade
 * para dentro da página.
 *
 * O funil não é enfeite: é o vocabulário acima posto em ordem. Cada etapa é
 * uma pergunta que só faz sentido depois da anterior ter resposta.
 */
export const FUNIL = [
  {
    chave: "identificar",
    titulo: "A identificar",
    pergunta: "Caiu no banco. De quem é?",
    onde: "/painel/financeiro?aba=entradas",
  },
  {
    chave: "conferir",
    titulo: "A conferir",
    pergunta: "Chegou com dono. Está certo?",
    onde: "/painel/financeiro?aba=conferir",
  },
  {
    chave: "receber",
    titulo: "A receber",
    pergunta: "Está lançado e não entrou. Quem falta?",
    onde: "/painel/clientes?atalho=em_aberto",
  },
  {
    chave: "fechar",
    titulo: "Fechar o mês",
    pergunta: "Tudo conferido? Então dá para fechar.",
    onde: "/painel/financeiro?aba=fechamento",
  },
] as const;
