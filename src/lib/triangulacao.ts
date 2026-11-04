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
 * AS TRÊS FONTES, POR ORDEM DE FORÇA
 * ============================================================================
 *
 * 1. COMPROVANTE (a mais forte). A família mandou a imagem no WhatsApp; a
 *    conversa já está ligada ao cliente, e o cliente à família e aos jazigos.
 *    Se há um comprovante de R$ 40 do dia 03 e o extrato tem um PIX de R$ 40
 *    no dia 03, é o mesmo dinheiro. Aqui o nome do banco deixa de ser a chave
 *    e vira CONFIRMAÇÃO.
 *
 * 2. LIÇÃO APRENDIDA. Alguém já disse, uma vez, de quem é aquele nome
 *    (`apelidos_banco`). É o que faz 196 nomes virarem trabalho de um mês só.
 *
 * 3. NOME NO CADASTRO (a mais fraca). Prefixo contra cliente/família. Resolve
 *    os 69 — e erra com irmãos de mesmo sobrenome, por isso é a última.
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

export type ForcaPalpite = "comprovante" | "licao" | "nome";

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
}

export interface ComprovanteParaCasar {
  id: string;
  clienteId: string | null;
  familiaId: string | null;
  familia: string | null;
  valor: number | null;
  data: string | null;      // AAAA-MM-DD
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

  // ---- 1. COMPROVANTE: mesmo valor, data perto ---------------------------
  //
  // O valor tem de bater EXATO. "Mais ou menos R$ 40" casaria o pagamento de
  // uma família com o comprovante de outra no mesmo dia — e as duas sairiam
  // quitadas, uma delas sem ter pago.
  const candidatos = fontes.comprovantes.filter(
    (c) => c.valor != null && c.data != null
        && Math.abs(Number(c.valor) - entrada.valor) < 0.005
        && diasEntre(c.data, entrada.data) <= FOLGA_DIAS,
  );
  // DOIS COMPROVANTES IGUAIS NO MESMO DIA NÃO DESEMPATAM SOZINHOS. Duas
  // famílias que pagam R$ 40 no dia 3 produzem dois candidatos idênticos;
  // escolher "o primeiro" acertaria metade das vezes e erraria a outra
  // metade em silêncio. Com empate, o comprovante não decide — cai para as
  // fontes seguintes, e se elas também não resolverem, vai para a fila.
  if (candidatos.length === 1) {
    const c = candidatos[0];
    const confere = nome && c.familia
      && (normalizarNomeBanco(c.familia).startsWith(nome.slice(0, 12))
          || nome.startsWith(normalizarNomeBanco(c.familia).slice(0, 12)));
    return {
      familiaId: c.familiaId, clienteId: c.clienteId, comprovanteId: c.id,
      forca: "comprovante",
      porque: `comprovante de ${dinheiro(entrada.valor)} em ${br(c.data!)}`
            + (confere ? `, e o nome do banco confere com ${c.familia}` : "")
            + (!confere && c.familia ? `, mandado pela conversa de ${c.familia}` : ""),
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
  // Por PREFIXO, porque o banco trunca. E só quando há UM candidato: dois
  // irmãos com o mesmo sobrenome produzem dois, e aí o nome não decide.
  if (nome.length >= 8) {
    const iguais = fontes.cadastro.filter(
      (x) => x.nome.startsWith(nome) || nome.startsWith(x.nome),
    );
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
