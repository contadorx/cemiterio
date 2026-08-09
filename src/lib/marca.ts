/**
 * Identidade da marca, num lugar só.
 * "Sureya" continua sendo o nome interno do sistema (código, envs, tabelas).
 * O que a FAMÍLIA vê é a marca: Zelo & Memória.
 */
export const MARCA = {
  nome: "Zelo & Memória",
  assinatura: "Por Dona Nadir · Desde 1990",
  desde: 1990,

  // ==========================================================================
  // OS CEMITÉRIOS QUE A GENTE ATENDE — a lista que o SITE mostra.
  //
  // Isto é a vitrine, não o banco: o painel e a agenda leem a tabela
  // `cemiterios`; aqui é o texto público, e ele fica num arquivo (e não numa
  // consulta) porque uma página de marketing não pode depender do banco estar
  // de pé para carregar.
  //
  // PARA ABRIR O SEGUNDO CEMITÉRIO:
  //   1. cadastre no painel (Config → Cemitérios), que é o que faz a AGENDA
  //      passar a existir para ele;
  //   2. acrescente um item aqui, com `slug` sem acento — a página
  //      /cemiterio/<slug> nasce sozinha, entra no sitemap e ganha ficha
  //      própria no Google.
  // O `ativo: false` deixa o cemitério pronto no código sem aparecer no site.
  // ==========================================================================
  cemiterios: [
    {
      slug: "da-saudade",
      nome: "Cemitério da Saudade",
      bairro: "Vila Vitória",
      cidade: "Mauá",
      uf: "SP",
      ativo: true,
      // "operando" = a gente já trabalha aqui há tempo, e o conhecimento do
      // lugar é o argumento. "chegando" = a gente está entrando agora, e aí a
      // página NÃO pode dizer que conhece quadra por quadra: seria mentira, e
      // a primeira família descobriria na primeira visita.
      status: "operando",
      desde: 1990,
      // uma frase que só é verdade NESTE lugar — é o que separa quem conhece o
      // cemitério de quem só tem um telefone na cidade
      conhecimento:
        "É o cemitério onde a Dona Nadir trabalha desde 1990. A gente conhece " +
        "quadra por quadra, e acha o jazigo pelo nome de quem está nele.",
      // a primeira limpeza por nossa conta vale só onde a gente está chegando
      primeiraGratis: false,
    },

    // ========================================================================
    // ⚠ O SEGUNDO CEMITÉRIO — FALTA UMA LINHA SUA: O NOME.
    //
    // Troque `nome`, `bairro` e `slug` (sem acento, com hífen) e mude
    // `ativo` para true. A página /cemiterio/<slug> nasce sozinha, entra no
    // sitemap e aparece na seção "Onde a gente atende" da home.
    //
    // Está com `ativo: false` de propósito: enquanto for false, ele não existe
    // para o visitante — nada de página no ar com "NOME DO CEMITÉRIO" escrito.
    //
    // O texto abaixo já é o de CHEGADA: honesto sobre ser novo no lugar, e
    // apoiado nos 30+ anos no Saudade, que é a prova que vocês realmente têm.
    // ========================================================================
    {
      slug: "segundo-cemiterio",          // <- troque (ex.: "municipal-de-maua")
      nome: "NOME DO CEMITÉRIO",          // <- troque
      bairro: "BAIRRO",                   // <- troque
      cidade: "Mauá",
      uf: "SP",
      ativo: false,                       // <- true quando for publicar
      status: "chegando",
      desde: null,
      conhecimento:
        "Estamos começando a atender aqui agora. Não vamos dizer que conhecemos " +
        "este cemitério de cor — ainda não conhecemos. O que temos são mais de " +
        "trinta anos cuidando de túmulos no Cemitério da Saudade, a mesma equipe " +
        "e o mesmo jeito de trabalhar: a gente mapeia as quadras antes, e você " +
        "recebe a foto do jazigo limpo a cada visita.",
      primeiraGratis: true,
    },
  ] as {
    slug: string; nome: string; bairro: string; cidade: string; uf: string;
    ativo: boolean; status: "operando" | "chegando"; desde: number | null;
    conhecimento: string; primeiraGratis: boolean;
  }[],

  // A REGIÃO. O hero fala daqui, não de um cemitério específico: assim o texto
  // do site continua verdadeiro no dia em que o segundo abrir, sem reescrita.
  regiao: "Mauá",

  // compatibilidade: o texto de um cemitério só, ainda usado no rodapé e no
  // e-mail. Quando houver dois, ele passa a dizer a região.
  cemiterio: "Cemitério da Saudade — Vila Vitória, Mauá",
  site: "zeloememoria.com.br",
  // O numero que recebe o clique de WhatsApp do site inteiro (so digitos, 55 na
  // frente). Estava com placeholder "5511999999999": os SEIS botoes de WhatsApp
  // da home apontavam para um numero que nao existe.
  whatsapp: "5511949749101",
  // O mesmo numero escrito para os olhos — a pessoa desconfiada quer VER o
  // telefone, nao so um botao azul.
  whatsappVisivel: "(11) 94974-9101",
  endereco: "Vila Vitoria, Maua - SP",
  // paleta do logo (escudo azul + ramo de oliveira dourado)
  cores: {
    navy: "#12284b",
    gold: "#c6a15b",
    cream: "#f7f3e9",
    linha: "#e7e0cf",
    suave: "#6b7280",
  },
} as const;

/** Selo curto para cabeçalhos: "🕊 Zelo & Memória" */
export const SELO = `🕊 ${MARCA.nome}`;


/** Só os cemitérios que aparecem no site, na ordem em que estão escritos. */
export const CEMITERIOS = MARCA.cemiterios.filter((c) => c.ativo);

/** "Cemitério da Saudade" · "Cemitério da Saudade e mais 1" — para frases curtas. */
export function cemiteriosEmTexto(): string {
  const nomes = CEMITERIOS.map((c) => c.nome);
  if (nomes.length <= 1) return nomes[0] || "";
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]}`;
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/** Onde a gente está chegando agora — é onde a primeira limpeza é por nossa conta. */
export const CEMITERIOS_CHEGANDO = CEMITERIOS.filter((c) => c.status === "chegando");

/** O cemitério pelo endereço da página (/cemiterio/<slug>). */
export function acharCemiterio(slug: string) {
  return CEMITERIOS.find((c) => c.slug === slug) || null;
}
