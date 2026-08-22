/* O balde das figuras do blog.
 *
 * Ele é PÚBLICO, e é aí que ele difere do balde do roteiro. Lá o arquivo é do
 * cliente, o endereço é assinado e vence em minutos — porque ninguém além dele
 * deveria abrir aquilo. Aqui a imagem faz parte de um texto que existe para ser
 * lido por qualquer pessoa: um endereço que vence seria uma figura quebrada no
 * dia seguinte, e a prévia do LinkedIn virando um quadrado cinza.
 *
 * Quem escreve continua sendo só o servidor, com a chave de serviço. Público
 * quer dizer "qualquer um LÊ", não "qualquer um manda arquivo".
 */
import 'server-only';

const URL_BASE = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const BALDE_BLOG = 'blog';

/** 8 MB. Uma figura de post bem exportada tem menos de 300 KB; o teto existe
 *  para o dia em que alguém arrastar o PNG cru de uma captura de tela 4K. */
export const TETO_FIGURA = 8 * 1024 * 1024;

const TIPOS: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/svg+xml': 'svg',
};

/** O tipo vem do ARQUIVO, e a extensão sai dele — não do nome que o navegador
 *  mandou. Um `.png` que na verdade é outra coisa entraria com o tipo errado e
 *  sairia servido como o tipo errado. */
export const extensaoDe = (tipo: string) => TIPOS[tipo] || '';

export async function subirFigura(caminho: string, corpo: ArrayBuffer, tipo: string): Promise<string> {
  const r = await fetch(`${URL_BASE}/storage/v1/object/${BALDE_BLOG}/${caminho}`, {
    method: 'POST',
    headers: {
      apikey: CHAVE!, Authorization: `Bearer ${CHAVE}`,
      'Content-Type': tipo,
      /* Um ano de cache: a figura de um post publicado não muda. Se mudar, o
         caminho muda junto — ele leva o instante do envio no nome. */
      'Cache-Control': 'public, max-age=31536000, immutable',
      'x-upsert': 'true',
    },
    body: corpo,
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`subir figura: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return `${URL_BASE}/storage/v1/object/public/${BALDE_BLOG}/${caminho}`;
}

export async function apagarFigura(caminho: string): Promise<void> {
  const r = await fetch(`${URL_BASE}/storage/v1/object/${BALDE_BLOG}/${caminho}`, {
    method: 'DELETE',
    headers: { apikey: CHAVE!, Authorization: `Bearer ${CHAVE}` },
    cache: 'no-store',
  });
  /* 404 não é erro aqui: o objetivo é que o arquivo não exista mais. */
  if (!r.ok && r.status !== 404) throw new Error(`apagar figura: ${r.status}`);
}
