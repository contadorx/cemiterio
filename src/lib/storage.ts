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
