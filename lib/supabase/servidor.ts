/* A sessão do cliente, do lado do servidor.
 *
 * A diferença para o que já existia dentro da ferramenta: lá o magic link vira
 * uma sessão no `sessionStorage`, que o JavaScript da página lê. Aqui ela vira
 * um cookie httpOnly, que o JavaScript da página NÃO lê — e por isso um script
 * de terceiro, uma extensão ou um XSS não conseguem carregar o token embora.
 *
 * A regra do produto continua valendo e não é negociada aqui: **login é
 * aditivo, nunca requisito**. Nada nesta pasta é chamado pela ferramenta; se a
 * Supabase cair, `/app` grava, transcreve e baixa exatamente como antes. O que
 * para de funcionar é a área do cliente, que é o que ela é.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { enderecoDaSessao, marca } from '@/lib/marca';

export async function clienteDoServidor() {
  const caixa = await cookies();
  return createServerClient(enderecoDaSessao(), marca.supaKey, {
    cookies: {
      getAll: () => caixa.getAll(),
      setAll: (novos) => {
        try {
          for (const { name, value, options } of novos) caixa.set(name, value, options);
        } catch {
          /* Server Component não escreve cookie. Quem renova a sessão é o
             `middleware`; aqui o silêncio é o comportamento correto e
             documentado, não um erro engolido. */
        }
      },
    },
  });
}

/** O e-mail de quem está logado, ou null. É a ÚNICA porta de entrada para
 *  saber de quem é a tela — nenhuma rota daqui aceita e-mail vindo do
 *  navegador, porque aí qualquer pessoa leria a conta de qualquer outra. */
export async function emailDaSessao(): Promise<string | null> {
  const supa = await clienteDoServidor();
  const { data, error } = await supa.auth.getUser();
  if (error || !data.user?.email) return null;
  return data.user.email.toLowerCase();
}
