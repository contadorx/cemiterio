/**
 * A TRIANGULAÇÃO — DE QUEM É ESTE DINHEIRO.
 *
 * ============================================================================
 * O PROBLEMA, MEDIDO
 * ============================================================================
 *
 * Extrato de outubro/2026: 248 PIX recebidos, 196 nomes distintos, R$ 19.805.
 * Casando o nome do banco por prefixo contra `clientes` e `familias`:
 *
 *     casam ....... 69
 *     NÃO casam ... 127
 *
 * E não é falha do cadastro. O nome que o banco imprime é de QUEM PAGA, e
 * quem paga muitas vezes não é quem está cadastrado — "a Kátia é responsável
 * da família Tonelloti e pagou para os Tonelloti". Some-se que o Bradesco
 * TRUNCA o nome em ~21 caracteres, e comparar por igualdade não acha ninguém.
 *
 * ============================================================================
 * AS QUATRO FONTES, POR ORDEM DE FORÇA
 * ============================================================================
 *
 * 0. O E2E DO PIX (certeza, não palpite). Todo comprovante lido guarda o
 *    identificador da transação — MEDIDO: 20 de 20 em produção têm o E2E. Se
 *    o extrato trouxer o mesmo identificador na linha (o OFX traz, no FITID),
 *    não há o que adivinhar: é o mesmo pagamento, pelo número que o Banco
 *    Central deu a ele. O PDF do Bradesco imprime só um nº de documento curto,
 *    então esta fonte quase nunca acende lendo PDF — e quando acende, acerta.
 *
 * 1. COMPROVANTE POR VALOR **E NOME**. A família mandou a imagem no WhatsApp;
 *    a conversa já está ligada ao cliente, e o cliente à família e aos
 *    jazigos. Valor igual ao centavo e data perto fazem o CANDIDATO; o nome
 *    decide entre candidatos — e descarta quem o nome contradiz.
 *
 *    O nome vem de dois lugares, e eles não valem o mesmo:
 *      · `nomePagador`, LIDO NO PRÓPRIO COMPROVANTE: é o nome que o banco
 *        imprimiu de quem pagou, a mesma coisa que o extrato traz. Discordar
 *        aqui é prova de que são pagamentos DIFERENTES, e o candidato sai.
 *      · o nome da família no cadastro: confirma quando bate, mas não acusa
 *        quando não bate — quem paga muitas vezes não é quem contratou.
 *
 * 2. LIÇÃO APRENDIDA. Alguém já disse, uma vez, de quem é aquele nome
 *    (`apelidos_banco`). É o que faz 196 nomes virarem trabalho de um mês só.
 *
 * 3. NOME NO CADASTRO (a mais fraca). Resolve os 69 — e erra com irmãos de
 *    mesmo sobrenome, por isso é a última.
 *
 * ============================================================================
 * O QUE ESTA PEÇA NÃO FAZ
 * ============================================================================
 *
 * Não concilia. Ela SUGERE, e diz por quê e com que força. Quem decide é
 * gente — "você sugere, eu confirmo, sempre" — e por isso toda sugestão
 * carrega o motivo em português, para a confirmação ser uma leitura e não
 * uma aposta.
 */

/** Maiúsculo, sem acento, sem espaço dobrado. Um lugar só decide isso. */
export function normalizarNomeBanco(bruto: string): string {
  return String(bruto || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O MESMO PAGADOR, ESCRITO DE DUAS MANEIRAS.
 *
 * O banco abrevia e TRUNCA. Comparar string com string não acha ninguém:
 *
 *     extrato ......... SANDRA REGINA M DE LI
 *     cadastro ........ SANDRA REGINA MENDES DE LIMA
 *     comprovante ..... KATIA F DOS SANTOS
 *     cadastro ........ KATIA FERREIRA DOS SANTOS
 *
 * Então a comparação é PALAVRA POR PALAVRA, e uma palavra bate quando a mais
 * curta é começo da mais longa — o que faz a inicial "F" bater com "FERREIRA"
 * e o "LI" cortado bater com "LIMA". Compara até acabar o lado mais curto,
 * porque é esse o lado que o banco cortou.
 *
 * E EXIGE DUAS PALAVRAS. Com uma só, "MARIA" bateria com meia cidade; o
 * sobrenome é o que torna a comparação uma afirmação em vez de uma torcida.
 */
export function mesmoPagador(a: string, b: string): boolean {
  const x = normalizarNomeBanco(a).split(" ").filter(Boolean);
  const y = normalizarNomeBanco(b).split(" ").filter(Boolean);
  const n = Math.min(x.length, y.length);
  if (n < 2) return false;
  for (let i = 0; i < n; i++) {
    const [curto, longo] = x[i].length <= y[i].length ? [x[i], y[i]] : [y[i], x[i]];
    if (!longo.startsWith(curto)) return false;
  }
  return true;
}

/**
 * O SOBRENOME DA FAMÍLIA APARECE NO NOME DE QUEM PAGOU?
 *
 * Isto é MAIS FROUXO que `mesmoPagador` de propósito, e serve a UMA coisa só:
 * desempatar entre candidatos que já passaram pelo valor e pela data. A
 * família no cadastro é "Tonelloti", uma palavra; quem pagou é "MARIA
 * TONELLOTI". `mesmoPagador` recusa — e deve recusar, porque sobrenome sozinho
 * casaria com meia cidade se fosse usado para ESCOLHER uma família.
 *
 * Mas escolher entre duas que já são candidatas é outra pergunta. Aqui a dúvida
 * é "destes dois comprovantes de R$ 40 do dia 3, qual é?", e o sobrenome
 * responde. Quatro letras no mínimo: "DE", "DA" e "DOS" não respondem nada.
 */
export function tocaONome(familia: string, nomeDoExtrato: string): boolean {
  const alvo = normalizarNomeBanco(nomeDoExtrato).split(" ").filter(Boolean);
  return normalizarNomeBanco(familia).split(" ")
    .filter((p) => p.length >= 4)
    .some((p) => alvo.some((q) => q.startsWith(p) || p.startsWith(q)));
}

export type ForcaPalpite = "e2e" | "comprovante" | "licao" | "nome";

export interface Palpite {
  familiaId: string | null;
  clienteId: string | null;
  comprovanteId: string | null;
  forca: ForcaPalpite;
  /** Em português, para a tela mostrar sem traduzir. */
  porque: string;
}

export interface EntradaParaCasar {
  id: string;
  valor: number;
  data: string;             // AAAA-MM-DD
  remetente: string | null;
  /** Nº do documento da linha do extrato. No OFX costuma ser o E2E do Pix. */
  documento?: string | null;
  identificador?: string | null;
}

export interface ComprovanteParaCasar {
  id: string;
  clienteId: string | null;
  familiaId: string | null;
  familia: string | null;
  valor: number | null;
  data: string | null;      // AAAA-MM-DD
  /** O nome de quem pagou, LIDO na imagem do comprovante. */
  nomePagador?: string | null;
  /** E2E / autenticação, como o comprovante mostra. */
  idTransacao?: string | null;
}

export interface LicaoBanco {
  nomeBanco: string;        // já normalizado
  familiaId: string | null;
  clienteId: string | null;
  familia: string | null;
}

export interface NomeDoCadastro {
  nome: string;             // já normalizado
  familiaId: string | null;
  clienteId: string | null;
  familia: string | null;
}

/**
 * QUANTOS DIAS DE FOLGA entre o comprovante e o PIX.
 *
 * O Pix cai na hora, mas a família manda a foto quando lembra — às vezes no
 * dia seguinte, às vezes no outro. Dois dias cobre o caso real sem começar a
 * casar pagamento de uma família com comprovante de outra.
 */
const FOLGA_DIAS = 2;

function diasEntre(a: string, b: string): number {
  const ms = Math.abs(new Date(a + "T12:00:00Z").getTime() - new Date(b + "T12:00:00Z").getTime());
  return Math.round(ms / 86400000);
}

/**
 * O palpite para UMA entrada do banco. `null` quando nenhuma fonte alcança —
 * e isso é resposta, não falha: entrada sem palpite vai para a fila com a
 * pergunta aberta, em vez de receber um chute com cara de certeza.
 */
export function palpitarDono(
  entrada: EntradaParaCasar,
  fontes: {
    comprovantes: ComprovanteParaCasar[];
    licoes: LicaoBanco[];
    cadastro: NomeDoCadastro[];
  },
): Palpite | null {
  const nome = normalizarNomeBanco(entrada.remetente || "");

  // ---- 0. O E2E DO PIX: certeza, e não palpite ---------------------------
  //
  // O identificador que o Banco Central deu ao pagamento. Quando o extrato
  // traz o mesmo que o comprovante, não há semelhança nem aproximação: é o
  // mesmo dinheiro. Vem antes de tudo porque é a única fonte que não pode
  // errar — e é de graça, porque a leitura do comprovante já guardava o E2E.
  const docs = [entrada.documento, entrada.identificador]
    .map((x) => String(x || "").trim().toUpperCase()).filter((x) => x.length >= 10);
  if (docs.length) {
    const c = fontes.comprovantes.find(
      (x) => x.idTransacao && docs.includes(String(x.idTransacao).trim().toUpperCase()));
    if (c) {
      return {
        familiaId: c.familiaId, clienteId: c.clienteId, comprovanteId: c.id,
        forca: "e2e",
        porque: `o identificador do Pix é o mesmo do comprovante de ${c.familia || "esta família"}`,
      };
    }
  }

  // ---- 1. COMPROVANTE: valor exato, data perto, E O NOME DECIDE ----------
  //
  // O valor tem de bater EXATO. "Mais ou menos R$ 40" casaria o pagamento de
  // uma família com o comprovante de outra no mesmo dia — e as duas sairiam
  // quitadas, uma delas sem ter pago.
  let candidatos = fontes.comprovantes.filter(
    (c) => c.valor != null && c.data != null
        && Math.abs(Number(c.valor) - entrada.valor) < 0.005
        && diasEntre(c.data, entrada.data) <= FOLGA_DIAS,
  );

  // O NOME LIDO NO COMPROVANTE DESCARTA QUEM ELE CONTRADIZ.
  //
  // `nomePagador` é o nome que o banco imprimiu de quem pagou — a MESMA coisa
  // que o extrato traz. Discordar aqui não é "quem paga não é quem contratou":
  // é outro pagamento. Dois comprovantes de R$ 40 no dia 3, um da Kátia e um
  // da Josiane, deixam de ser empate no instante em que o extrato diz de quem
  // é aquele Pix.
  //
  // Comprovante SEM nome lido não é descartado: ausência não é discordância —
  // e são 20 de 20 em produção sem o nome, porque a leitura nunca pediu.
  if (nome && candidatos.length > 1) {
    const semContradicao = candidatos.filter(
      (c) => !c.nomePagador || mesmoPagador(c.nomePagador, nome));
    if (semContradicao.length) candidatos = semContradicao;
  }

  // AINDA EMPATADO? O NOME DA FAMÍLIA DESEMPATA — e só se apontar para UM.
  if (candidatos.length > 1 && nome) {
    const pelaFamilia = candidatos.filter((c) => c.familia && tocaONome(c.familia, nome));
    if (pelaFamilia.length === 1) candidatos = pelaFamilia;
  }

  // DOIS COMPROVANTES QUE O NOME NÃO SEPAROU NÃO DESEMPATAM SOZINHOS.
  // Escolher "o primeiro" acertaria metade das vezes e erraria a outra metade
  // em silêncio. Com empate, o comprovante não decide — cai para as fontes
  // seguintes, e se elas também não resolverem, vai para a fila.
  if (candidatos.length === 1) {
    const c = candidatos[0];
    const porNomePagador = !!(nome && c.nomePagador && mesmoPagador(c.nomePagador, nome));
    const porFamilia = !!(nome && c.familia && tocaONome(c.familia, nome));
    // NOME LIDO QUE DISCORDA, COM UM CANDIDATO SÓ, NÃO É IGNORADO: o valor
    // sozinho continua valendo, mas a tela tem de dizer que o nome não bate.
    const discorda = !!(nome && c.nomePagador && !mesmoPagador(c.nomePagador, nome));
    return {
      familiaId: c.familiaId, clienteId: c.clienteId, comprovanteId: c.id,
      forca: "comprovante",
      porque: `comprovante de ${dinheiro(entrada.valor)} em ${br(c.data!)}`
            + (porNomePagador ? `, e o nome do pagador é o mesmo do extrato` : "")
            + (!porNomePagador && porFamilia ? `, e o nome do banco confere com ${c.familia}` : "")
            + (!porNomePagador && !porFamilia && !discorda && c.familia
                ? `, mandado pela conversa de ${c.familia}` : "")
            + (discorda
                ? `, mas o comprovante diz que quem pagou foi ${c.nomePagador} — confira` : ""),
    };
  }

  // ---- 2. LIÇÃO APRENDIDA ------------------------------------------------
  if (nome) {
    const l = fontes.licoes.find((x) => x.nomeBanco === nome);
    if (l) {
      return {
        familiaId: l.familiaId, clienteId: l.clienteId, comprovanteId: null,
        forca: "licao",
        porque: `“${entrada.remetente}” já foi ligado a ${l.familia || "esta família"} antes`,
      };
    }
  }

  // ---- 3. NOME NO CADASTRO ----------------------------------------------
  //
  // PALAVRA POR PALAVRA (`mesmoPagador`), porque o banco abrevia e trunca. E
  // só quando há UM candidato: dois irmãos com o mesmo sobrenome produzem
  // dois, e aí o nome não decide.
  if (nome) {
    const iguais = fontes.cadastro.filter((x) => mesmoPagador(x.nome, nome));
    if (iguais.length === 1) {
      const x = iguais[0];
      return {
        familiaId: x.familiaId, clienteId: x.clienteId, comprovanteId: null,
        forca: "nome",
        porque: `o nome no banco bate com ${x.familia || x.nome} no cadastro`,
      };
    }
  }

  return null;
}

function dinheiro(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function br(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}`;
}
