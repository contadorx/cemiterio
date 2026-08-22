/* O balde do roteiro: onde mora o `.json` completo da sessão, quando alguém
 * escolhe anexá-lo.
 *
 * Ele é PRIVADO e não tem política nenhuma — `anon` e `authenticated` não leem
 * nem escrevem. Quem entrega o arquivo é o servidor, com a chave de serviço, e
 * só depois de perguntar ao banco se aquela sessão pode ver aquele caso. O
 * endereço que o navegador recebe é assinado e vence em minutos.
 *
 * Este é o único lugar do produto onde um quadro do cliente existe do nosso
 * lado, e existe porque a pessoa clicou para que existisse. Por isso tem botão
 * de apagar que apaga o arquivo, e não só a linha que aponta para ele.
 */
import 'server-only';

const URL_BASE = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const BALDE = 'roteiro';

/** 32 MB. Uma sessão de sessenta quadros dá uns oito; o teto existe para o dia
 *  em que alguém arrastar um arquivo que não é o que ele pensa que é. */
export const TETO_ANEXO = 32 * 1024 * 1024;

const cabecalhos = () => ({ apikey: CHAVE!, Authorization: `Bearer ${CHAVE}` });

export async function subirAnexo(caminho: string, corpo: ArrayBuffer): Promise<void> {
  const r = await fetch(`${URL_BASE}/storage/v1/object/${BALDE}/${caminho}`, {
    method: 'POST',
    headers: { ...cabecalhos(), 'Content-Type': 'application/json', 'x-upsert': 'true' },
    body: corpo,
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`subir: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

/** Um endereço que serve o arquivo por poucos minutos e depois deixa de servir.
 *  Link de download que não vence é link que vaza num histórico de conversa. */
export async function assinarAnexo(caminho: string, segundos = 120): Promise<string> {
  const r = await fetch(`${URL_BASE}/storage/v1/object/sign/${BALDE}/${caminho}`, {
    method: 'POST',
    headers: { ...cabecalhos(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: segundos }),
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`assinar: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const { signedURL, signedUrl } = (await r.json()) as { signedURL?: string; signedUrl?: string };
  const caminhoAssinado = signedURL || signedUrl || '';
  return `${URL_BASE}/storage/v1${caminhoAssinado.startsWith('/') ? '' : '/'}${caminhoAssinado}`;
}

export async function apagarAnexo(caminho: string): Promise<void> {
  /* Um apagar que falha em silêncio é pior do que um que não existe: a pessoa
     lê "removido" na tela e o arquivo continua lá. Se der errado aqui, a linha
     do banco não é limpa e a tela continua dizendo a verdade. */
  const r = await fetch(`${URL_BASE}/storage/v1/object/${BALDE}/${caminho}`, {
    method: 'DELETE', headers: cabecalhos(), cache: 'no-store',
  });
  if (!r.ok && r.status !== 404) throw new Error(`apagar: ${r.status}`);
}
