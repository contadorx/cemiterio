/**
 * Deposito de arquivos (Supabase Storage) com criacao sob demanda.
 *
 * O SISTEMA NUNCA CRIOU OS BUCKETS. A migration 0009 so faz
 * `update storage.buckets set public = true where id = 'servicos'` — um update
 * que nao acusa nada quando a linha nao existe. Resultado: toda foto batia em
 * "Bucket not found" e o unico sinal na tela era "a foto nao subiu".
 *
 * Aqui, quando o deposito nao existe, ele e criado na hora (service role) e o
 * envio e refeito uma vez. Assim a instalacao se conserta sozinha, em vez de
 * depender de alguem lembrar de criar a pasta no painel do Supabase.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET_SERVICOS = "servicos";
export const BUCKET_COMPROVANTES = "comprovantes";
/**
 * O QUE A FAMÍLIA MANDA NA CONVERSA.
 *
 * Separado de `comprovantes` de propósito: ali só entra o que o leitor
 * reconheceu como Pix, e é a fila de conferência de dinheiro. Aqui entra o
 * resto — a foto do túmulo, o print de outro banco que o leitor não entendeu,
 * a dúvida escrita à mão. Misturar os dois encheria a tela de conferir com
 * coisa que não é dinheiro.
 */
export const BUCKET_CONVERSAS = "conversas";

/**
 * OS BALDES QUE NÃO ABREM SOZINHOS (0139).
 *
 * O QUE SE MEDIU EM 27/08: os três baldes estavam `public = true`. Endereço de
 * balde público abre para QUALQUER UM que tenha o link, sem senha, para sempre.
 * Os caminhos levam identificadores aleatórios, então ninguém acha por
 * tentativa — mas link que vaza (encaminhado, no histórico do navegador, na
 * prévia de um app) continua valendo.
 *
 * Para a foto do jazigo isso é o que FAZ a foto chegar: o WhatsApp busca a URL.
 * Para estes dois é diferente:
 *
 *   comprovantes  extrato de banco, com nome, valor e às vezes número de conta
 *   conversas     o que a família mandou no privado
 *
 * Nenhum dos dois nunca foi enviado a ninguém — medido: zero mensagens de saída
 * e zero linhas na fila de liberação apontam para eles. Eles só são vistos aqui
 * dentro, por quem entrou. Então eles fecham, e passam a ser lidos por link que
 * expira.
 *
 * `servicos` continua aberto de propósito, e isso está escrito no
 * LEIA-ME_os_baldes_que_nao_abrem_sozinhos.md: são 817 arquivos que a página da
 * família, o site e o envio pelo WhatsApp leem por URL direta. Fechá-lo é um
 * build próprio, não um efeito colateral deste.
 */
export const BALDES_PRIVADOS: ReadonlySet<string> = new Set([
  BUCKET_COMPROVANTES,
  BUCKET_CONVERSAS,
  // 0154 — `servicos` fecha. Ver o bloco acima: a 0139 o deixou aberto de
  // propósito e disse que fechá-lo seria um build próprio. É este.
  BUCKET_SERVICOS,
]);

// 25 MB: a foto ja sobe reduzida (~300 KB); o teto so evita abuso.
const LIMITE_BYTES = 25 * 1024 * 1024;

function faltaBucket(msg: string) {
  return /bucket not found|does not exist/i.test(msg || "");
}

async function criarBucket(db: SupabaseClient, bucket: string) {
  const { error } = await db.storage.createBucket(bucket, {
    // NASCER FECHADO É PARTE DO CONSERTO. Esta função cria o balde sozinha
    // quando ele falta (era o defeito da 0009). Se ela continuasse criando tudo
    // aberto, um balde apagado e recriado por engano voltaria público — e não
    // haveria erro nenhum, só a porta destrancada de novo.
    public: !BALDES_PRIVADOS.has(bucket),
    fileSizeLimit: LIMITE_BYTES,
  });
  // "already exists" nao e erro: duas requisicoes simultaneas podem criar junto.
  if (error && !/already exists|duplicate/i.test(error.message)) throw error;
}

export type Enviado = { ok: true; url: string } | { ok: false; erro: string };

/**
 * Sobe o arquivo e devolve a URL publica. Se o deposito nao existir, cria e
 * tenta de novo — uma vez so, para nao entrar em laco quando o erro for outro.
 */
export async function subirArquivo(
  db: SupabaseClient,
  bucket: string,
  caminho: string,
  bytes: Buffer,
  contentType: string,
  opcoes?: { upsert?: boolean },
): Promise<Enviado> {
  const upsert = opcoes?.upsert !== false;

  const tentar = async () =>
    db.storage.from(bucket).upload(caminho, bytes, { contentType, upsert });

  let { error } = await tentar();

  if (error && faltaBucket(error.message)) {
    try {
      await criarBucket(db, bucket);
    } catch (e: any) {
      return { ok: false, erro: `nao consegui criar o deposito de arquivos: ${e?.message || e}` };
    }
    ({ error } = await tentar());
  }

  if (error) return { ok: false, erro: error.message };

  // O ENDEREÇO CONTINUA SENDO O MESMO, ATÉ PARA O BALDE FECHADO.
  //
  // `getPublicUrl` só monta uma string — ela não concede nada. Num balde
  // fechado esse endereço devolve 400, e é `assinar()` que o transforma em algo
  // que abre. Guardar sempre o mesmo formato é o que permitiu fechar dois
  // baldes sem migrar uma linha do banco: `caminhoDaUrl` já sabia lê-lo, e a
  // exclusão da 0135 continua funcionando sem tocar em nada.
  const url = db.storage.from(bucket).getPublicUrl(caminho).data?.publicUrl;
  if (!url) return { ok: false, erro: "arquivo subiu mas nao consegui o endereco" };
  return { ok: true, url };
}

/**
 * DE ENDEREÇO GUARDADO PARA LINK QUE ABRE — a porta única.
 *
 * Balde aberto: devolve o próprio endereço, que já abre.
 * Balde fechado: devolve um link assinado, que vale `segundos` e depois morre.
 *
 * DEVOLVE `null` QUANDO NÃO CONSEGUE, e nunca o endereço cru como consolo. Num
 * balde fechado o endereço cru dá 400 na cara de quem clicar, e a tela mostraria
 * uma imagem quebrada sem saber por quê. `null` é o que deixa a tela dizer "não
 * consegui abrir este arquivo" — é o "vazio não é zero" do projeto, aplicado a
 * um link.
 *
 * ASSINA COM A CHAVE DE SERVIÇO, que ignora RLS. A autorização é feita ANTES,
 * por quem chama: as quatro rotas que usam isto já passaram por `exigirAdmin` e
 * já filtraram a linha por `org_id`. O endereço que chega aqui é de um arquivo
 * que a organização de quem pediu já tinha o direito de ver.
 */
export async function assinar(
  db: SupabaseClient,
  url: string | null | undefined,
  segundos = 3600,
): Promise<string | null> {
  if (!url) return null;
  const balde = baldeDaUrl(url);
  if (!balde) return null;
  if (!BALDES_PRIVADOS.has(balde)) return url;

  const caminho = caminhoDaUrl(url, balde);
  if (!caminho) return null;

  const { data, error } = await db.storage.from(balde).createSignedUrl(caminho, segundos);
  if (error || !data?.signedUrl) {
    console.error(`[storage] nao consegui assinar ${balde}/${caminho}:`, error?.message);
    return null;
  }
  return data.signedUrl;
}


/**
 * MUITOS LINKS DE UMA VEZ.
 *
 * `assinar()` faz uma ida ao Storage por arquivo. A tela de Jazigos devolve 267
 * linhas com duas fotos cada: 534 idas para desenhar uma lista. Isso não é um
 * detalhe de desempenho — é a diferença entre a tela abrir e a tela estourar o
 * tempo da função.
 *
 * Agrupa por balde, assina em lote, e devolve um mapa do endereço GUARDADO para
 * o link que abre. Quem não conseguiu assinar entra no mapa como `null`, e não
 * fica de fora: quem chama precisa distinguir "não consegui abrir" de "não tem
 * foto", que é a mesma regra de `assinar()`.
 */
export async function assinarVarios(
  db: SupabaseClient,
  urls: (string | null | undefined)[],
  segundos = 3600,
): Promise<Map<string, string | null>> {
  const saida = new Map<string, string | null>();
  const porBalde = new Map<string, Map<string, string>>();  // balde -> caminho -> url

  for (const u of urls) {
    if (!u || saida.has(u)) continue;
    const balde = baldeDaUrl(u);
    if (!balde) { saida.set(u, null); continue; }
    // balde aberto: o próprio endereço já abre, não custa nada
    if (!BALDES_PRIVADOS.has(balde)) { saida.set(u, u); continue; }
    const caminho = caminhoDaUrl(u, balde);
    if (!caminho) { saida.set(u, null); continue; }
    if (!porBalde.has(balde)) porBalde.set(balde, new Map());
    porBalde.get(balde)!.set(caminho, u);
  }

  for (const [balde, caminhos] of porBalde) {
    const lista = [...caminhos.keys()];
    const { data, error } = await db.storage.from(balde).createSignedUrls(lista, segundos);
    if (error || !data) {
      console.error(`[storage] nao consegui assinar ${lista.length} de ${balde}:`, error?.message);
      for (const u of caminhos.values()) saida.set(u, null);
      continue;
    }
    for (const item of data) {
      const original = caminhos.get(String((item as any).path || ""));
      if (original) saida.set(original, (item as any).signedUrl || null);
    }
    // o que o Storage não devolveu não pode sair do mapa como se tivesse dado certo
    for (const u of caminhos.values()) if (!saida.has(u)) saida.set(u, null);
  }

  return saida;
}

/**
 * DE URL PÚBLICA PARA CAMINHO DENTRO DO BALDE.
 *
 * O banco guarda a URL inteira; a API de Storage apaga por CAMINHO. A URL é
 *
 *     https://<projeto>.supabase.co/storage/v1/object/public/<balde>/<caminho>
 *
 * Devolve `null` para o que não reconhecer — e quem chama trata isso como
 * "não consegui remover", nunca como "não havia nada". A diferença é o que
 * separa uma remoção incompleta de uma remoção silenciosamente incompleta.
 */
export function caminhoDaUrl(url: string, bucket: string): string | null {
  if (!url) return null;
  const marca = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marca);
  if (i < 0) return null;
  const caminho = url.slice(i + marca.length).split("?")[0];
  return caminho ? decodeURIComponent(caminho) : null;
}

/** Em qual balde esta URL está? `null` se não for de nenhum dos nossos. */
export function baldeDaUrl(url: string): string | null {
  for (const b of [BUCKET_SERVICOS, BUCKET_COMPROVANTES, BUCKET_CONVERSAS]) {
    if (caminhoDaUrl(url, b)) return b;
  }
  return null;
}

/**
 * APAGA DE VERDADE. Agrupa por balde e remove em lote.
 *
 * Devolve o que NÃO conseguiu remover — não lança. Quem chama precisa poder
 * dizer "removi 11 de 13 arquivos" em vez de receber uma exceção e não saber
 * quantos foram.
 */
export async function apagarArquivos(
  db: SupabaseClient,
  urls: string[],
): Promise<{ removidos: number; falharam: string[] }> {
  const porBalde = new Map<string, string[]>();
  const falharam: string[] = [];

  for (const url of urls) {
    const balde = baldeDaUrl(url);
    const caminho = balde ? caminhoDaUrl(url, balde) : null;
    if (!balde || !caminho) { falharam.push(url); continue; }
    porBalde.set(balde, [...(porBalde.get(balde) || []), caminho]);
  }

  let removidos = 0;
  for (const [balde, caminhos] of porBalde) {
    // Em lotes: `remove` aceita muitos caminhos, mas uma lista enorme numa
    // chamada só falha inteira se um caminho der problema.
    for (let i = 0; i < caminhos.length; i += 50) {
      const lote = caminhos.slice(i, i + 50);
      const { data, error } = await db.storage.from(balde).remove(lote);
      if (error) {
        falharam.push(...lote.map((c) => `${balde}/${c}`));
        continue;
      }
      removidos += (data?.length ?? lote.length);
    }
  }
  return { removidos, falharam };
}
