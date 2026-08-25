/**
 * OS TEXTOS DO WHATSAPP — modelos fixos, sem IA.
 *
 * São os quatro textos que a Sureya já usava, com as variáveis preenchidas
 * pelo sistema. Nenhum modelo de linguagem é chamado aqui: o texto é sempre
 * o mesmo, previsível, e ela pode editar antes de enviar.
 *
 * O TOM foi escrito para um público idoso que valoriza atenção:
 *   · a foto vem como gesto espontâneo, nunca como comprovante de tarefa —
 *     "aproveitei", "fiz questão de compartilhar". Isso tira da Sureya a
 *     obrigação de fotografar toda limpeza.
 *   · a cobrança vem SEMPRE depois da entrega do valor, nunca antes.
 *   · o lembrete é tratado como atualização de cadastro, não como cobrança
 *     dura — o idoso costuma ter esquecido, não estar fugindo.
 */

export type TipoMensagem = "foto" | "cobranca" | "lembrete" | "agradecimento";

export interface DadosMensagem {
  nome: string;                 // primeiro nome de quem recebe
  periodo?: string;             // "março de 2026"
  valor?: number;
  chavePix?: string;
}

const dinheiro = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function montarTexto(tipo: TipoMensagem, d: DadosMensagem): string {
  const valor = d.valor != null ? dinheiro(d.valor) : "___";
  const pix = d.chavePix || "___";
  const periodo = d.periodo || "___";

  switch (tipo) {
    case "foto":
      return (
        `Olá, ${d.nome}, tudo bem? Aproveitei nossa rotina de cuidados de hoje no ` +
        `cemitério para fazer um registro de como o jazigo da família está limpo e ` +
        `bem cuidado, e fiz questão de compartilhar com o(a) senhor(a). Seguimos por ` +
        `aqui zelando por tudo com o carinho e o respeito de sempre. Um abraço meu e ` +
        `da Dona Nadir!`
      );

    case "cobranca":
      return (
        `Olá, ${d.nome}, como o(a) senhor(a) está? Espero que bem! Passando para ` +
        `informar que concluímos as manutenções no jazigo da família referentes ao ` +
        `período de ${periodo}. Seguimos cuidando de tudo com muito respeito, mantendo ` +
        `o padrão da Dona Nadir. O valor da nossa manutenção é ${valor}. Quando for ` +
        `possível, segue a nossa chave Pix para o acerto: ${pix}. Muito obrigada pela ` +
        `confiança de sempre!`
      );

    case "lembrete":
      return (
        `Olá, ${d.nome}, bom dia! Tudo bem com o(a) senhor(a)? Estou passando ` +
        `rapidinho só para atualizar a nossa ficha de controles referente ao período ` +
        `de ${periodo}. O(a) senhor(a) chegou a fazer o Pix dessa manutenção? Se sim, ` +
        `poderia me enviar o comprovante por aqui, por favor? Assim eu já deixo tudo ` +
        `certinho na ficha da família. Caso ainda não tenha feito, não se preocupe, a ` +
        `nossa chave Pix é: ${pix}. Agradeço muito a atenção!`
      );

    case "agradecimento":
      return (
        `Olá, ${d.nome}! Recebi o comprovante referente ao período de ${periodo}. ` +
        `Muito obrigada! Já dei baixa aqui nos nossos controles. Agradeço imensamente ` +
        `pela confiança de sempre no nosso trabalho. Um abraço carinhoso da nossa ` +
        `família para a sua!`
      );
  }
}

export interface RascunhoFila {
  familiaId: string;
  clienteId: string | null;
  tumuloId: string | null;
  servicoId: string | null;
  tipo: TipoMensagem;
  texto: string;
  fotos: string[];
}

/**
 * O rascunho que nasce quando a Nina termina uma lavagem.
 *
 * Entra na fila como 'aguardando' e FICA PARADO. Não existe cron nem gatilho
 * que o envie: a única saída é a Sureya aprovar na tela.
 *
 * A foto do antes só entra se existir. A do depois é a que importa — é ela
 * que mostra o cuidado.
 */
export function rascunhoDaLavagem(p: {
  familiaId: string;
  clienteId: string | null;
  tumuloId: string;
  servicoId: string;
  nome: string;
  fotoAntes?: string | null;
  fotoDepois?: string | null;
}): RascunhoFila {
  const fotos = [p.fotoAntes, p.fotoDepois].filter((f): f is string => !!f);
  return {
    familiaId: p.familiaId,
    clienteId: p.clienteId,
    tumuloId: p.tumuloId,
    servicoId: p.servicoId,
    tipo: "foto",
    texto: montarTexto("foto", { nome: primeiroNome(p.nome) }),
    fotos,
  };
}

/** Rascunho de cobrança, montado no fechamento do ciclo do túmulo. */
export function rascunhoDeCobranca(p: {
  familiaId: string;
  clienteId: string | null;      // responsável financeiro
  tumuloId: string | null;
  nome: string;
  periodo: string;
  valor: number;
  chavePix: string;
}): RascunhoFila {
  return {
    familiaId: p.familiaId,
    clienteId: p.clienteId,
    tumuloId: p.tumuloId,
    servicoId: null,
    tipo: "cobranca",
    texto: montarTexto("cobranca", {
      nome: primeiroNome(p.nome),
      periodo: p.periodo,
      valor: p.valor,
      chavePix: p.chavePix,
    }),
    fotos: [],
  };
}

/**
 * O NOME QUE VAI NA MENSAGEM: SÓ O PRIMEIRO.
 *
 * "Sr. João Batista da Silva" -> "Sr. João".
 *
 * ESTA É A ÚNICA IMPLEMENTAÇÃO EM TypeScript. Havia seis — aqui, em
 * `ativacao.ts`, em `servico.ts`, em `campanha.ts`, na tela dos contatos do
 * site e nas duas rotas do campo — e elas já discordavam: as cinco outras
 * cortavam no primeiro espaço e devolviam "Sr." como saudação.
 *
 * A gêmea no banco é `sureya_primeiro_nome`, e as duas têm de responder igual:
 * a prévia que a Sureya lê é renderizada pelo banco, e o envio passa por aqui.
 * `testes/nome_proprio.sql` guarda a igualdade caso a caso.
 *
 * POR QUE ISTO IMPORTA MAIS DO QUE PARECE: o campo `nome` guarda a referência
 * que acha a pessoa no cemitério — "Paulo Primo Da Maria Japonesa", "Idalina
 * Na Frente Do Bozato". Mandar o nome inteiro numa mensagem seria
 * constrangedor. Vai só "Paulo".
 */
export function primeiroNome(completo: string): string {
  const partes = String(completo || "").trim().split(/\s+/);
  // com ou sem ponto: em produção há "Sr." e "Sr", "Dra" e "Dona" — a regra
  // que só conhecia a forma com ponto deixava metade dos casos virar "Ola, Sr"
  const tratamentos = ["sr", "sra", "dona", "dr", "dra", "seu", "pe", "padre", "irma", "irmao"];
  const primeiro = (partes[0] || "").toLowerCase().replace(/\.+$/, "");
  if (partes.length >= 2 && tratamentos.includes(primeiro)) {
    return `${partes[0]} ${partes[1]}`;
  }
  return partes[0] || String(completo || "");
}

/** "2026-03-01" -> "março de 2026" */
export function nomearPeriodo(competencia: string): string {
  const meses = ["janeiro","fevereiro","março","abril","maio","junho",
                 "julho","agosto","setembro","outubro","novembro","dezembro"];
  const ano = competencia.slice(0, 4);
  const mes = Number(competencia.slice(5, 7)) - 1;
  return `${meses[mes]} de ${ano}`;
}
