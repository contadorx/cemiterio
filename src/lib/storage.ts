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

// 25 MB: a foto ja sobe reduzida (~300 KB); o teto so evita abuso.
const LIMITE_BYTES = 25 * 1024 * 1024;

function faltaBucket(msg: string) {
  return /bucket not found|does not exist/i.test(msg || "");
}

async function criarBucket(db: SupabaseClient, bucket: string) {
  const { error } = await db.storage.createBucket(bucket, {
    public: true, // as fotos sao lidas pela familia por link direto
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

  const url = db.storage.from(bucket).getPublicUrl(caminho).data?.publicUrl;
  if (!url) return { ok: false, erro: "arquivo subiu mas nao consegui a URL publica" };
  return { ok: true, url };
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
