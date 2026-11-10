import { textoDoPdf } from "./pdf-texto";
import { tocaONome } from "./triangulacao";
import type { DadosComprovante } from "./comprovante";

/**
 * LER UM COMPROVANTE DE PIX EM PDF, SEM IA E SEM DEPENDÊNCIA NOVA.
 *
 * ============================================================================
 * POR QUE ISTO EXISTE
 * ============================================================================
 *
 * MEDIDO em 08/11/2026: das 25 mídias que as famílias mandaram, SEIS são PDF.
 * E desde que a chave da IA foi desligada, ZERO comprovantes foram
 * registrados — cada um deles virou trabalho manual.
 *
 * Mas um comprovante em PDF não é uma foto: ele TEM TEXTO DENTRO. O banco
 * escreveu "R$ 40,00", "07/11/2026" e o E2E ali, em caracteres. Mandar isso
 * para um modelo de visão é pagar para alguém ler em voz alta o que já está
 * escrito.
 *
 * É a mesma decisão da 0161, quando o extrato do Bradesco deixou de ir para a
 * IA: `textoDoPdf` tira o texto com o zlib do Node, e a IA vira plano B para o
 * que não tem texto — PDF escaneado, que é imagem com capa de PDF.
 *
 * ============================================================================
 * O QUE ESTE LEITOR NÃO FAZ
 * ============================================================================
 *
 * NÃO LÊ FOTO. Print de celular, JPEG, PNG: não há texto para extrair, e OCR
 * seria dependência nova num projeto que tem dez. Esses continuam indo para a
 * IA, ou para a mão de uma pessoa.
 *
 * E NÃO INVENTA CONFIANÇA. Valor sem data nem identificador é "baixa", e
 * confiança baixa não preenche campo de dinheiro — a regra é a mesma de
 * `decidirLeitura` desde sempre. Um valor errado pré-preenchido é pior que
 * campo vazio: o vazio obriga a olhar o papel, o preenchido convida a
 * confiar e apertar "Lançar".
 */

/**
 * O E2E DO PIX tem forma fixa, definida pelo Banco Central:
 *
 *     E + 8 dígitos (ISPB do banco) + 12 dígitos (AAAAMMDDHHMM) + 11 livres
 *
 * 32 caracteres ao todo. Exigir a forma inteira é o que separa o E2E de
 * qualquer outro código que apareça no papel — "autenticação", "protocolo",
 * número do documento. Casar frouxo aqui plantaria um identificador falso, e
 * o identificador é a chave mais forte da conciliação: errado, ele casa o
 * pagamento de uma família com o de outra com cara de certeza.
 */
const E2E = /\bE\d{8}\d{12}[A-Za-z0-9]{11}\b/;

/** R$ 1.234,56 — e também "1.234,56" solto, quando o rótulo já diz que é valor. */
const DINHEIRO = /R\$\s*([\d.]{1,12},\d{2})/g;
const DATA = /\b(\d{2})\/(\d{2})\/(\d{4})\b/g;

/**
 * AS PALAVRAS QUE DIZEM "AQUI VEM O PAGADOR" — e as que dizem o contrário.
 *
 * Trocar pagador por recebedor é o erro mais caro possível neste leitor: TODO
 * comprovante que a família manda tem a Sureya como recebedora, então um
 * leitor confuso devolveria o nome dela em cima de cada pagamento, e a
 * triangulação passaria a casar tudo com tudo.
 */
//
// AS BORDAS DE PALAVRA NÃO SÃO ENFEITE. Sem elas, "de" casava dentro de
// "Vali(de):" e de "Da(dos de) quem pagou" — e o leitor devolvia o RÓTULO como
// se fosse o nome de quem pagou ("quem pagou", "Assinatura do responsavel").
// Foi o teste contra os PDFs de verdade que mostrou isso; lendo o código, a
// linha parecia certa.
const ROTULO_PAGADOR =
  /(\bpagador\b|\borigem\b|\bdebitado\b|quem pagou|\bde\s*:)/i;
const ROTULO_RECEBEDOR =
  /(\brecebedor\b|\bbenefici[áa]ri[oa]\b|\bfavorecido\b|\bdestino\b|\bcreditado\b|quem recebeu|\bpara\s*:)/i;
const ROTULO_VALOR = /(valor|total)/i;
const ROTULO_DATA = /(data|realizad|efetuad|pagamento em)/i;

/** Linhas que são rótulo, cabeçalho ou rodapé, nunca um nome de pessoa. */
const NAO_E_NOME =
  /(comprovante|transfer|pix|banco|ag[êe]ncia|conta|cpf|cnpj|institui|tipo|chave|descri|identificador|autentica|protocolo|valor|data|hor[áa]rio|R\$|\d{3}\.\d{3}|quem pagou|quem recebeu|dados de|assinatura|respons[áa]vel|validade|or[çc]amento|saldo|tarifa)/i;

function soLetras(s: string): string {
  return s.replace(/[^A-Za-zÀ-ÿ ]/g, " ").replace(/\s+/g, " ").trim();
}

function paraNumero(br: string): number {
  return Number(br.replace(/\./g, "").replace(",", "."));
}

function paraIso(d: string, m: string, a: string): string {
  return `${a}-${m}-${d}`;
}

/**
 * O NOME DE QUEM PAGOU.
 *
 * Procura o rótulo do pagador e pega o primeiro texto de cara de nome DEPOIS
 * dele — e para antes de chegar ao bloco do recebedor. Sem rótulo de pagador
 * no papel, devolve `null` em vez de chutar a primeira linha com letras: o
 * nome errado aqui não deixa um campo vazio, ele DESCARTA o comprovante certo
 * na conciliação do mês seguinte, calado.
 */
function acharPagador(linhas: string[]): string | null {
  const iPag = linhas.findIndex((l) => ROTULO_PAGADOR.test(l) && !ROTULO_RECEBEDOR.test(l));
  if (iPag < 0) return null;

  for (let i = iPag; i < Math.min(linhas.length, iPag + 6); i++) {
    // Chegou no bloco do recebedor: o pagador não estava ali.
    if (i > iPag && ROTULO_RECEBEDOR.test(linhas[i])) return null;

    // O nome pode vir na MESMA linha do rótulo ("Pagador: Katia F dos Santos")
    // ou na seguinte, às vezes atrás de um segundo rótulo ("Nome: Katia…").
    // Os três formatos existem, e os três são comuns.
    let candidato = linhas[i];
    if (i === iPag) {
      candidato = candidato.replace(
        /^.*?(\bpagador\b|\borigem\b|\bdebitado\b|quem pagou|\bde)\s*:?\s*/i, "");
    }
    candidato = candidato.replace(/^\s*(nome|titular|cliente)\s*:\s*/i, "");

    const limpo = soLetras(candidato);
    if (limpo.length < 6) continue;
    if (NAO_E_NOME.test(candidato)) continue;
    // Nome é duas palavras, no mínimo — pela mesma razão de `mesmoPagador`.
    if (limpo.split(" ").filter((p) => p.length > 1).length < 2) continue;
    return limpo;
  }
  return null;
}

/**
 * QUEM PAGOU, QUANDO O PAPEL NÃO TEM RÓTULO — pela casa que recebeu.
 *
 * MEDIDO em 08/11/2026, passando OCR numa FOTO de tela de celular: o valor, a
 * data e os dois nomes saem certos, e os RÓTULOS somem. "PAGADOR" e
 * "RECEBEDOR" são escritos em cinza pequeno, e é justamente isso que não
 * sobrevive ao brilho, ao moiré e à compressão do WhatsApp.
 *
 * Sem rótulo, "Katia Ferreira dos Santos" e "Sureya Serviços de Limpeza" são
 * dois nomes e nada mais. Escolher o primeiro poria o nome da casa em cima de
 * metade dos pagamentos — e a triangulação passaria a casar tudo com tudo.
 *
 * MAS A CASA A GENTE CONHECE. Ela recebe TODO comprovante que chega aqui.
 * Então tiro o nome dela dos candidatos; se sobrar exatamente UM, foi ele quem
 * pagou. Sobrando zero ou mais de um, devolvo `null` — dedução que precisa
 * escolher entre dois já não é dedução.
 *
 * Isto nunca produz confiança "alta": é raciocínio por eliminação, não leitura.
 */
function deduzirPagador(linhas: string[], nomeDaCasa?: string | null): string | null {
  if (!nomeDaCasa) return null;

  const candidatos: string[] = [];
  for (const l of linhas) {
    if (NAO_E_NOME.test(l)) continue;
    // NOME DE GENTE NÃO TEM NÚMERO — e aqui não há rótulo para ancorar nada,
    // então a linha tem de se defender sozinha. Sem isto, "07 de novembro de
    // 2026 - 14:32" virava candidato ("de novembro de" são três palavras com
    // letras suficientes), ficavam DOIS candidatos, e a dedução desistia de
    // um caso que ela resolvia. Foi o OCR da foto torta que mostrou.
    if (/\d/.test(l)) continue;
    const limpo = soLetras(l);
    if (limpo.length < 8) continue;
    // DUAS PALAVRAS DE TRÊS LETRAS, no mínimo.
    //
    // Nome de gente tem nome e sobrenome. "io DA TRANSA" — o que sobrou de
    // "ID DA TRANSACAO" depois do OCR numa foto torta — também tem três
    // "palavras", e virava um segundo candidato: a dedução via dois nomes e
    // desistia de um caso que ela resolvia. Exigir três letras separa pessoa
    // de cisco, sem precisar listar cada jeito de o OCR errar.
    if (limpo.split(" ").filter((p) => p.length >= 3).length < 2) continue;
    // `tocaONome` é a mesma regra que a triangulação usa para reconhecer uma
    // família pelo sobrenome. Uma segunda cópia dela discordaria sobre quem é
    // a casa, e aí o nome dela passaria por pagador.
    if (tocaONome(nomeDaCasa, limpo)) continue;
    if (!candidatos.includes(limpo)) candidatos.push(limpo);
  }
  return candidatos.length === 1 ? candidatos[0] : null;
}

/**
 * O VALOR.
 *
 * Um comprovante tem vários "R$" — valor, tarifa, saldo. Prefiro o que está
 * numa linha com rótulo de valor; sem rótulo nenhum, o MAIOR, porque tarifa e
 * saldo restante não costumam passar o valor pago. É uma escolha, não uma
 * certeza — e por isso valor sem data nem E2E não chega a "alta".
 */
function acharValor(linhas: string[]): number | null {
  const comRotulo: number[] = [];
  const todos: number[] = [];

  for (const l of linhas) {
    const achados = [...l.matchAll(DINHEIRO)].map((m) => paraNumero(m[1]));
    if (!achados.length) continue;
    todos.push(...achados);
    if (ROTULO_VALOR.test(l)) comRotulo.push(...achados);
  }

  const fonte = comRotulo.length ? comRotulo : todos;
  const validos = fonte.filter((v) => v > 0);
  if (!validos.length) return null;
  return comRotulo.length ? validos[0] : Math.max(...validos);
}

/**
 * A DATA.
 *
 * O E2E carrega a data dele (posições 10 a 17: AAAAMMDD), e ela é a mais
 * confiável que existe no papel — foi o Banco Central que a escreveu. Uso-a
 * quando o E2E está lá; senão, a data com rótulo; senão, a primeira do texto.
 */
function acharData(linhas: string[], e2e: string | null): string | null {
  if (e2e) {
    const a = e2e.slice(9, 13), m = e2e.slice(13, 15), d = e2e.slice(15, 17);
    const iso = `${a}-${m}-${d}`;
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) return iso;
  }
  for (const l of linhas) {
    if (!ROTULO_DATA.test(l)) continue;
    const m = [...l.matchAll(DATA)][0];
    if (m) return paraIso(m[1], m[2], m[3]);
  }
  for (const l of linhas) {
    const m = [...l.matchAll(DATA)][0];
    if (m) return paraIso(m[1], m[2], m[3]);
  }
  return null;
}

/**
 * Devolve `null` quando o PDF não tem texto (escaneado) — e aí quem chama
 * manda para a IA, que é o plano B, exatamente como no extrato.
 */
export function lerComprovantePdf(bytes: Buffer): DadosComprovante | null {
  let texto = "";
  try {
    texto = textoDoPdf(bytes);
  } catch {
    return null;
  }
  return interpretarComprovante(texto);
}

/**
 * O QUE ESTAS LINHAS QUEREM DIZER — e isto NÃO sabe de onde elas vieram.
 *
 * O texto chega do PDF (`textoDoPdf`) ou do OCR de uma foto
 * (`comprovante-ocr.ts`), e a interpretação é a MESMA: onde está o valor, qual
 * data vale, quem pagou. Escrever isso duas vezes é o defeito de forma que já
 * custou nove migrations a este projeto — e aqui ele custaria caro de um jeito
 * novo, porque as duas cópias leriam o mesmo papel e dariam respostas
 * diferentes conforme o arquivo fosse PDF ou foto.
 *
 * O que muda entre as duas portas é o CUIDADO, não a leitura — e isso vem em
 * `opts`, não numa segunda cópia desta função.
 */
export interface ComoLer {
  /**
   * O OCR erra um caractere e ninguém percebe. Com isto ligado, o E2E não é
   * devolvido: ver `comprovante-ocr.ts`.
   */
  semIdentificador?: boolean;
  /** Teto da confiança. O OCR nunca chega a "alta". */
  tetoDaConfianca?: "alta" | "media";
  /**
   * O NOME DA CASA — quem RECEBE todo comprovante que chega aqui.
   *
   * Serve para duas coisas, e a segunda só o OCR precisa: descartar o
   * recebedor quando ele aparece sem rótulo, e, sobrando um único outro nome,
   * deduzir que foi ele quem pagou.
   */
  nomeDaCasa?: string | null;
}

export function interpretarComprovante(
  texto: string, opts: ComoLer = {},
): DadosComprovante | null {
  if (!texto || texto.trim().length < 20) return null;

  const linhas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  const junto = linhas.join(" ");

  // É COMPROVANTE? A palavra tem de estar no papel. Um PDF de contrato com um
  // "R$" dentro não é um pagamento, e registrar um seria creditar dinheiro que
  // ninguém mandou.
  const pareceComprovante =
    /(comprovante|pix|transfer[êe]ncia|ted\b|doc\b|pagamento efetuado|pagamento realizado)/i.test(junto);

  const e2eLido = junto.match(E2E)?.[0] || null;
  const e2e = opts.semIdentificador ? null : e2eLido;
  const valor = acharValor(linhas);
  // A data sai do E2E LIDO mesmo quando ele não é devolvido: um dígito trocado
  // no meio do identificador quase nunca cai nas oito casas da data, e ela
  // ainda é conferida contra a data escrita no papel.
  const data = acharData(linhas, e2eLido);
  const pagador = acharPagador(linhas) || deduzirPagador(linhas, opts.nomeDaCasa);

  // A CONFIANÇA SAI DO QUE FOI ACHADO, e não de otimismo.
  //
  //   alta  = valor + data + E2E. O E2E é a prova de que isto é um Pix de
  //           verdade e traz a própria data dentro; com os três, não sobra o
  //           que inventar.
  //   media = valor + data, sem identificador. Serve para preencher a tela,
  //           e a conciliação depois vai depender de valor e nome.
  //   baixa = o resto. E baixa NÃO PREENCHE nada (`decidirLeitura`).
  let confianca: DadosComprovante["confianca"] =
    valor != null && data && e2e ? "alta"
    : valor != null && data ? "media"
    : "baixa";
  if (opts.tetoDaConfianca === "media" && confianca === "alta") confianca = "media";

  return {
    eh_comprovante: pareceComprovante && valor != null,
    valor,
    data,
    id_transacao: e2e,
    nome_pagador: pagador,
    confianca,
  };
}
