import { MARCA } from "./marca";

/**
 * TODO O TEXTO DO SITE, NUM ARQUIVO SÓ.
 *
 * A página (src/app/page.tsx) não tem texto escrito dentro dela: ela lê daqui.
 * Assim você muda uma frase, um preço ou uma pergunta do FAQ sem abrir código
 * de layout e sem risco de quebrar a tela.
 *
 * O QUE VOCÊ PRECISA TROCAR ANTES DE PUBLICAR (está tudo marcado com ⚠):
 *   1. o WhatsApp, em src/lib/marca.ts
 *   2. o PRECO_A_PARTIR_DE, logo abaixo
 *   3. as fotos do antes/depois (public/site/antes-1.jpg etc.)
 */

// ---------------------------------------------------------------------------
// ⚠ PREÇO — o único número que a página mostra.
//
// Você escolheu mostrar "a partir de". Eu NÃO inventei o valor: 40 é o padrão
// que está no banco (planos.valor_vigente), e ele pode não ser o que você
// cobra hoje. Troque pelo seu menor preço real — o "a partir de" precisa ser
// verdade, senão a conversa começa com uma correção.
//
// `unidade` é a palavra que aparece depois do número. Enquanto você não decidir
// se o valor é por limpeza ou por mês, deixe "por limpeza" — é o que o cliente
// entende sem explicação.
// ---------------------------------------------------------------------------
export const PRECO_A_PARTIR_DE = 40;
export const PRECO_UNIDADE = "por limpeza";

const tel = MARCA.whatsapp;

/** Link de WhatsApp já com a primeira frase escrita. */
export function linkWhats(texto?: string) {
  const t = texto || "Ola! Vi o site e queria saber sobre o cuidado do jazigo da minha familia.";
  return `https://wa.me/${tel}?text=${encodeURIComponent(t)}`;
}

export const SITE = {
  // -------------------------------------------------------------------------
  // TOPO — a promessa em uma frase.
  //
  // A frase fala do RESULTADO que a pessoa não consegue ter sozinha (o túmulo
  // cuidado quando ela não pode ir), e não do serviço ("limpeza de jazigos").
  // Quem procura isso não está comprando limpeza: está comprando o alívio de
  // não estar deixando o pai, a mãe ou o filho no abandono.
  // -------------------------------------------------------------------------
  hero: {
    olho: MARCA.cemiterio,
    titulo: "O túmulo da sua família cuidado — mesmo quando você não pode ir.",
    texto:
      "Limpeza e conservação de jazigos no Cemitério da Saudade, em Mauá. " +
      "A cada visita você recebe no WhatsApp a foto de antes e a de depois. " +
      "Sem precisar acreditar: dá para ver.",
    cta: "Falar no WhatsApp",
    cta2: "Pedir um orçamento",
  },

  // -------------------------------------------------------------------------
  // A SITUAÇÃO — dita sem drama.
  //
  // Aqui não se usa culpa. Quem chega nesta página já sente o suficiente; a
  // página que aperta a ferida vende uma vez e queima o nome. O tom é: isso
  // acontece com quase todo mundo, e tem solução simples.
  // -------------------------------------------------------------------------
  dor: {
    titulo: "Quase todo mundo passa por isso",
    itens: [
      {
        t: "A distância",
        d: "Você mudou de cidade, ou o trânsito de sábado come o dia. A visita vai ficando para o mês que vem — e o mês que vem vira ano.",
      },
      {
        t: "O tempo faz o serviço dele",
        d: "Lápide escurece, mato cresce na junta, flor seca acumula, a placa perde a letra. Seis meses sem ninguém e o jazigo já não parece o mesmo.",
      },
      {
        t: "A data que chega",
        d: "Aniversário, data do falecimento, Finados. É quando a família se junta lá — e é justamente quando ninguém quer chegar e encontrar aquilo.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // COMO FUNCIONA — três passos, sem letra miúda.
  // -------------------------------------------------------------------------
  passos: {
    titulo: "Como funciona",
    itens: [
      {
        n: "1",
        t: "Você diz qual é o jazigo",
        d: "Pelo WhatsApp. Quadra e número, ou só o nome de quem está lá — a gente localiza. Se você não souber, a gente procura e manda a foto para você confirmar.",
      },
      {
        n: "2",
        t: "A gente cuida na frequência combinada",
        d: "Mensal, a cada dois meses ou só nas datas importantes. Lavagem da lápide, limpeza em volta, retirada de flores secas e do mato. Flores novas, se você quiser.",
      },
      {
        n: "3",
        t: "Você recebe a foto",
        d: "Do mesmo ângulo, antes e depois, no dia do serviço. Sem foto do depois, o serviço não é dado como feito nem cobrado.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // O QUE ESTÁ INCLUSO — o que se compra por aquele dinheiro.
  // -------------------------------------------------------------------------
  incluso: {
    titulo: "O que entra em cada visita",
    itens: [
      "Lavagem da lápide e da estrutura, com produto que não ataca o granito nem o mármore",
      "Limpeza do entorno: mato, folhas, terra levantada pela chuva",
      "Retirada das flores secas e dos vasos quebrados",
      "Conferência da placa e da inscrição — se estiver soltando ou apagando, você fica sabendo",
      "Foto do antes e do depois, do mesmo ângulo, no WhatsApp",
      "Aviso quando o cemitério mexer em alguma coisa perto do jazigo",
    ],
    extras: {
      titulo: "Sob pedido",
      itens: [
        "Flores novas na data que você escolher",
        "Limpeza reforçada para jazigo que ficou muito tempo sem cuidado",
        "Preparo antes de uma visita da família ou de uma missa",
      ],
    },
  },

  // -------------------------------------------------------------------------
  // DATAS — o motivo pelo qual as pessoas ficam.
  //
  // Isto não é enfeite de página: o sistema guarda as datas e avisa (é a tabela
  // de gatilhos). Vale dizer em voz alta, porque é a parte que ninguém mais faz.
  // -------------------------------------------------------------------------
  datas: {
    titulo: "A gente lembra das datas por você",
    texto:
      "Você nos diz a data do falecimento e o aniversário. Alguns dias antes, " +
      "a gente avisa e deixa o jazigo pronto — para quando a família chegar, " +
      "estar como tem que estar. Em Finados, o preparo é feito com antecedência: " +
      "no dia, não dá para fazer nada direito.",
  },

  // -------------------------------------------------------------------------
  // PROVA — quem cuida, e desde quando.
  // -------------------------------------------------------------------------
  prova: {
    titulo: `Quem cuida, desde ${MARCA.desde}`,
    texto:
      "O trabalho é da Dona Nadir e da equipe dela, no Cemitério da Saudade, " +
      "em Vila Vitória. Mais de trinta anos no mesmo cemitério, cuidando dos " +
      "túmulos das mesmas famílias — muitas hoje já na segunda geração. " +
      "Não somos uma empresa que atende a cidade inteira: conhecemos este " +
      "cemitério quadra por quadra, e é por isso que a gente acha o seu jazigo " +
      "pelo nome de quem está nele.",
    // ⚠ AS FOTOS DE ANTES E DEPOIS.
    //
    // Enquanto `mostrarFotos` for false, a página NÃO mostra este bloco — nada
    // de quadrado cinza escrito "imagem". Melhor sem prova do que com prova
    // fingida: quem chega aqui já desconfia de promessa bonita.
    //
    // Para ligar: coloque os arquivos em public/site/, confira os nomes abaixo
    // e troque para true. Use fotos do MESMO ângulo — é o par que convence,
    // não a foto bonita.
    mostrarFotos: false,
    fotos: [
      { antes: "/site/antes-1.jpg", depois: "/site/depois-1.jpg", legenda: "Quadra e número, jazigo sem visita há oito meses" },
    ],
  },

  // -------------------------------------------------------------------------
  // FAQ — as perguntas que travam a decisão.
  // -------------------------------------------------------------------------
  faq: {
    titulo: "Perguntas que sempre fazem",
    itens: [
      {
        p: "Como eu sei que o serviço foi feito mesmo?",
        r: "Pela foto do depois, tirada no jazigo, no dia. É a regra da casa: sem a foto do depois, o serviço não fecha e não é cobrado. Você compara com a do antes e decide sozinho se ficou bom.",
      },
      {
        p: "Preciso assinar contrato ou ficar preso por algum tempo?",
        r: "Não. É mês a mês e você avisa quando quiser parar. Quem fica, fica porque quer.",
      },
      {
        p: "Vocês atendem outros cemitérios?",
        r: "Hoje o trabalho é no Cemitério da Saudade, em Mauá. É o cemitério que a gente conhece de verdade. Se o seu jazigo for em outro, fale com a gente mesmo assim — a resposta pode ser não, mas vai ser honesta.",
      },
      {
        p: "E se eu não souber onde fica o jazigo?",
        r: "Acontece muito, principalmente quando quem cuidava faleceu. Com o nome e uma data aproximada a gente localiza, tira a foto e manda para você confirmar antes de começar qualquer coisa.",
      },
      {
        p: "Quanto custa?",
        r: `Depende do tamanho do jazigo, de como ele está hoje e da frequência. Começa em R$ ${PRECO_A_PARTIR_DE} ${PRECO_UNIDADE}. Um jazigo que ficou anos sem cuidado precisa de uma primeira limpeza mais pesada, cobrada à parte — e a gente diz o valor antes, nunca depois.`,
      },
      {
        p: "Posso pedir só para uma data específica?",
        r: "Pode. Tem família que contrata só para o aniversário e Finados. A gente combina a data e faz a visita alguns dias antes.",
      },
      {
        p: "Como eu pago?",
        r: "Pix ou boleto, depois do serviço feito. Você recebe o comprovante com as fotos do período.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // FORMULÁRIO — para quem não quer conversar agora.
  // -------------------------------------------------------------------------
  form: {
    titulo: "Prefere que a gente ligue?",
    texto:
      "Deixe seu nome e telefone. A gente responde no mesmo dia, em horário comercial. " +
      "Sem robô de ligação e sem insistência: se você não responder, a gente não fica atrás.",
    ok: "Recebemos. A gente entra em contato hoje mesmo, em horário comercial.",
  },

  lgpd:
    "Seus dados são usados só para responder ao seu contato. Não vendemos e não " +
    "compartilhamos com ninguém. Se quiser que a gente apague, é só pedir.",
};
