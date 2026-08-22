/* Renova a sessão do cookie antes de a página ler.
 *
 * O `matcher` é estreito de propósito. Middleware roda como função no servidor,
 * e ligá-lo no site inteiro cobraria uma invocação por visita a uma página de
 * marketing que é HTML estático e não tem sessão nenhuma para renovar. Aqui ele
 * só existe onde existe conta.
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { enderecoDaSessao, marca } from '@/lib/marca';

export async function middleware(req: NextRequest) {
  let resposta = NextResponse.next({ request: req });

  const supa = createServerClient(enderecoDaSessao(), marca.supaKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (novos) => {
        for (const { name, value } of novos) req.cookies.set(name, value);
        resposta = NextResponse.next({ request: req });
        for (const { name, value, options } of novos) resposta.cookies.set(name, value, options);
      },
    },
  });

  /* `getUser` e não `getSession`: o primeiro confere o token com o servidor de
     autenticação, o segundo acredita no que está no cookie. Para decidir de
     quem é a tela, acreditar no cookie é o mesmo que não conferir. */
  await supa.auth.getUser();
  return resposta;
}

export const config = { matcher: ['/conta', '/conta/:caminho*'] };
