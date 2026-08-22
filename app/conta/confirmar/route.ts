/* A volta do link mágico.
 *
 * O Supabase manda um `token_hash` de uso único; esta rota troca ele por uma
 * sessão e grava o cookie httpOnly. O token some da URL no mesmo movimento —
 * um endereço com token dentro vai parar no histórico, no `Referer` e no print
 * que a pessoa manda pedindo ajuda.
 *
 * Ela fica FORA do `[lang]` de propósito: é uma rota, não uma página, e o
 * endereço dela está gravado dentro de e-mails já enviados. Mudar de lugar
 * quebraria os links que estão voando agora. O idioma viaja no `?lang=`.
 */
import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { clienteDoServidor } from '@/lib/supabase/servidor';
import { CAMINHO, ehLang, textos } from '@/lib/conta/textos';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const bruto = url.searchParams.get('lang') || 'pt';
  const lang = ehLang(bruto) ? bruto : 'pt';
  const t = textos(lang);
  const volta = (par?: string, valor?: string) =>
    NextResponse.redirect(new URL(
      CAMINHO[lang] + (par ? `?${par}=${encodeURIComponent(valor || '')}` : ''), url.origin));

  /* O link volta de UMA de duas formas, e a diferença não é escolha nossa:
     ela depende de como o modelo de e-mail do Supabase foi escrito.

       ?token_hash=…&type=magiclink   quando o modelo usa `{{ .TokenHash }}`
       ?code=…                        quando o modelo usa `{{ .ConfirmationURL }}`,
                                      que é o PADRÃO — o Supabase verifica do
                                      lado dele e devolve um código PKCE.

     Esta rota só entendia a primeira. Com o modelo padrão, ela recebia um
     `code` que não sabia ler, não achava `token_hash`, e mandava a pessoa de
     volta para a tela de pedir o e-mail — que é exatamente o que parece com
     "o link não faz nada". Entender as duas custa seis linhas e acaba com uma
     classe inteira de configuração errada. */
  const token_hash = url.searchParams.get('token_hash');
  const code = url.searchParams.get('code');
  const type = (url.searchParams.get('type') || 'magiclink') as EmailOtpType;
  if (!token_hash && !code) return volta('erro', t.erroLinkSemCodigo);

  const supa = await clienteDoServidor();
  const { error } = token_hash
    ? await supa.auth.verifyOtp({ type, token_hash })
    : await supa.auth.exchangeCodeForSession(code as string);
  if (error) {
    /* Link velho ou já usado. É o caso comum e não é culpa de ninguém: o
       cliente de e-mail que "pré-visualiza" links gasta o token antes da
       pessoa clicar. Dizer isso é melhor que dizer "token inválido". */
    return volta('erro', t.erroLinkUsado);
  }
  return volta();
}
