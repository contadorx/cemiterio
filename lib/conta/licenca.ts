/* A emissão da chave de licença, pelo servidor.
 *
 * Ela já existia, e existia só na `/time` — em JavaScript no navegador, com o
 * JWT do magic link na mão. Quem estava logado na `/conta` e queria a chave
 * tinha que ir para a página de venda e fazer login OUTRA VEZ, por outro
 * e-mail. Duas portas para a mesma coisa é o que esta unificação veio acabar.
 *
 * Quem emite continua sendo a Edge Function `walkstamp-licenca`, e ela continua
 * exigindo um token de usuário: é o servidor de autenticação que diz de quem é
 * o e-mail, e não a gente. A diferença é de onde o token sai — aqui ele vem da
 * sessão do cookie, que o navegador não lê.
 *
 * O que NÃO muda, e é a tese do produto: a chave é conferida DENTRO do
 * navegador de quem usa. Não há consulta a servidor de licença, ela funciona
 * offline, e a gente não fica sabendo quando ela é usada.
 */
import 'server-only';
import { clienteDoServidor } from '@/lib/supabase/servidor';
import { marca } from '@/lib/marca';

export type Chave = {
  erro?: string;
  link?: string;
  email?: string;
  vence?: string;
  assentos?: number;
};

export async function emitirChave(): Promise<Chave> {
  const supa = await clienteDoServidor();
  /* `getSession` lê o cookie sem conferir com o servidor — e aqui isso basta,
     porque quem confere é a Edge Function que vai receber o token. Quem decide
     se há alguém logado continua sendo o `getUser` da página. */
  const { data } = await supa.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { erro: 'sem_sessao' };

  try {
    const r = await fetch(`${marca.supaUrl}/functions/v1/walkstamp-licenca`, {
      method: 'POST',
      headers: {
        apikey: marca.supaKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      cache: 'no-store',
    });
    const d = (await r.json().catch(() => ({}))) as Chave;
    if (!r.ok || !d?.link) return { erro: d?.erro || 'falha' };
    return d;
  } catch {
    return { erro: 'falha' };
  }
}
