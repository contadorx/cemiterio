/**
 * OS MODELOS DE MENSAGEM — RESPOSTA PRONTA, CUSTO ZERO.
 *
 * ============================================================================
 * POR QUE ISTO EXISTE
 * ============================================================================
 *
 * Medido em 03/09/2026, sobre os 196 rascunhos que a IA escreveu antes do laço:
 *
 *     aprovados como estavam ....  4
 *     editados antes de enviar ..  6
 *     descartados .............. 155
 *
 * A IA acertava 5%. E o assunto que ela mais escrevia era o que menos servia:
 * `cobranca`, 170 rascunhos, 152 no lixo.
 *
 * Olhando o que a Sureya de fato mandou, a razão fica óbvia. As respostas dela
 * são curtas e repetidas — "Obrigada", "Deus abençoe", "Bom dia, obrigada pelo
 * envio!" — e a mensagem da foto da lavagem ela já escrevia À MÃO, cinco vezes
 * quase idêntica, mudando só o nome. Isso não é trabalho de modelo de
 * linguagem: é trabalho de formulário.
 *
 * Cada tema tem VÁRIAS versões. Não é enfeite: uma frase única, repetida em
 * sessenta famílias, deixa de soar como uma pessoa e passa a soar como um
 * sistema — que é exatamente o que a casa não quer parecer.
 *
 * NADA AQUI CHAMA MODELO NENHUM. Custo por mensagem: zero.
 * ============================================================================
 */

export interface DadosDaMensagem {
  /** Como a família é chamada: "Dona Carmen", "Sr. José", "Cris". */
  tratamento: string;
  valor?: number | null;
  /** Meses cobertos ou em aberto, já escritos: "08/2026", "07 e 08/2026". */
  meses?: string | null;
  /** Nome do jazigo/família, quando a frase pede. */
  jazigo?: string | null;
  /** Data de uma lavagem ou visita, já em dd/mm. */
  dia?: string | null;
}

export interface ModeloMensagem {
  chave: string;
  tema: string;
  /** Uma linha dizendo quando usar. Aparece na tela, não no WhatsApp. */
  quando: string;
  /** As versões. Índice 0 é a primeira oferecida. */
  versoes: ((d: DadosDaMensagem) => string)[];
}

const dinheiro = (v?: number | null) =>
  typeof v === "number" ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "";

/**
 * OS TEMAS.
 *
 * As frases saem do que a Sureya escreveu de verdade — inclusive os fechos
 * ("Deus abençoe", "Um abraço", 🌿) e o tamanho. Inventar um jeito novo de
 * falar aqui seria trocar a voz da casa pela minha.
 */
export const MODELOS: ModeloMensagem[] = [
  {
    chave: "comprovante_recebido",
    tema: "Recebi o comprovante",
    quando: "a família mandou o Pix e você ainda não conferiu",
    versoes: [
      (d) => `Recebi sim, ${d.tratamento}, muito obrigada! Já fica registrado aqui.`
           + ` Deus abençoe 🌿`,
      (d) => `Bom dia, ${d.tratamento}, obrigada pelo envio!\nDeus abençoe ❤️`,
      (d) => `Chegou certinho, ${d.tratamento}${d.valor ? ` — ${dinheiro(d.valor)}` : ""}.`
           + ` Muito obrigada pela confiança! 🌿`,
    ],
  },
  {
    chave: "comprovante_conferido",
    tema: "Confirmei o pagamento",
    quando: "você já conferiu e quer dar a baixa para a família",
    versoes: [
      (d) => `${d.tratamento}, confirmei aqui o pagamento${d.meses ? ` de ${d.meses}` : ""}.`
           + ` Está tudo em dia. Obrigada! 🌿`,
      (d) => `Tudo certo, ${d.tratamento}! O pagamento${d.meses ? ` de ${d.meses}` : ""}`
           + ` já está registrado. Deus abençoe 🙏🏾`,
    ],
  },
  {
    chave: "foto_da_lavagem",
    tema: "Foto da lavagem",
    quando: "a limpeza foi feita e você vai mandar o registro",
    versoes: [
      // Esta é a frase que ela já escrevia à mão, cinco vezes.
      (d) => `Boa tarde ${d.tratamento}, tudo bem? Passando para compartilhar o registro`
           + ` da limpeza de hoje, para a senhora ter a tranquilidade de ver como ficou 🌿`,
      (d) => `${d.tratamento}, boa tarde! Aqui está o registro da lavagem`
           + `${d.dia ? ` de ${d.dia}` : " de hoje"}. Ficou tudo bem cuidado.`
           + `\nUm abraço meu e da Dona Nadir!`,
      (d) => `Passando para mostrar como ficou hoje, ${d.tratamento} 🌿`,
    ],
  },
  {
    chave: "memoria",
    tema: "Data de memória",
    quando: "aniversário, falecimento, Finados, Dia das Mães ou dos Pais",
    versoes: [
      (d) => `${d.tratamento}, hoje lembramos de quem a senhora ama.`
           + ` Deixamos o jazigo${d.jazigo ? ` da família ${d.jazigo}` : ""} preparado com carinho.`
           + `\nUm abraço meu e da Dona Nadir.`,
      (d) => `Bom dia, ${d.tratamento}. Passando só para dizer que hoje pensamos na sua família.`
           + ` Está tudo cuidado por lá 🌿`,
    ],
  },
  {
    chave: "cobranca_gentil",
    tema: "Lembrete de pagamento",
    quando: "há mês vencido — confira a régua da família antes",
    versoes: [
      (d) => `Bom dia, ${d.tratamento}! Passando só para lembrar`
           + `${d.meses ? ` de ${d.meses}` : ""}${d.valor ? `, ${dinheiro(d.valor)}` : ""}.`
           + ` Se já tiver feito o Pix, pode me mandar o comprovante que eu dou baixa. 🌿`,
      (d) => `${d.tratamento}, tudo bem? Consta aqui em aberto`
           + `${d.meses ? ` ${d.meses}` : ""}${d.valor ? ` — ${dinheiro(d.valor)}` : ""}.`
           + ` Qualquer dúvida me chama, sem pressa.`,
    ],
  },
  {
    chave: "vou_conferir",
    tema: "Vou conferir e retorno",
    quando: "você precisa de tempo — isto CRIA uma pendência sua",
    versoes: [
      (d) => `${d.tratamento}, deixa eu conferir isso aqui direitinho e já te falo.`,
      (d) => `Vou olhar com calma e te retorno ainda hoje, ${d.tratamento}. 🌿`,
    ],
  },
  {
    chave: "agradecer",
    tema: "Agradecer",
    quando: "a família agradeceu, elogiou ou mandou um carinho",
    versoes: [
      () => `Imagina, eu que agradeço!\nDeus abençoe 🙏🏾`,
      (d) => `Obrigada, ${d.tratamento}! Um abraço carinhoso 🌿`,
      () => `Que bom saber! Muito obrigada pela confiança 🌿`,
    ],
  },
];

/** Um tema pela chave, ou `null` — nunca um tema qualquer como consolo. */
export function modeloPorChave(chave: string): ModeloMensagem | null {
  return MODELOS.find((m) => m.chave === chave) || null;
}

/**
 * Monta uma versão. Fora do intervalo devolve `null` em vez da versão 0:
 * mandar outra frase que não a escolhida é o defeito que a caixa única
 * acabou de consertar, e ele não volta por aqui.
 */
export function montarMensagem(
  chave: string,
  versao: number,
  dados: DadosDaMensagem,
): string | null {
  const m = modeloPorChave(chave);
  if (!m) return null;
  const f = m.versoes[versao];
  if (!f) return null;
  const t = String(dados.tratamento || "").trim();
  // SEM TRATAMENTO NÃO SE MANDA. "Oi , tudo bem?" numa conversa sobre o jazigo
  // de um pai é pior que não responder.
  if (!t) return null;
  return f({ ...dados, tratamento: t }).trim();
}
