/* O download do `.json` completo anexado a um caso.
 *
 * O arquivo NÃO é servido daqui: o servidor confere a sessão, pergunta ao banco
 * se aquela pessoa pode ver aquele caso, e só então pede ao Storage um endereço
 * assinado que vence em dois minutos — para onde o navegador é redirecionado.
 *
 * Por que não devolver o arquivo direto: são oito megabytes que passariam pelo
 * processo do site sem precisar. E por que não guardar um endereço fixo na
 * tela: link de arquivo que não vence é link que sobrevive num histórico de
 * conversa depois de a pessoa ter apagado o anexo.
 */
import { NextResponse } from 'next/server';
import { emailDaSessao } from '@/lib/supabase/servidor';
import { rpc } from '@/lib/supabase/servico';
import { assinarAnexo } from '@/lib/supabase/arquivo';
import { ehLang, textos } from '@/lib/conta/textos';

/* A forma única do que a porta do anexo devolve. Sem ela, o `.catch` faz o
   TypeScript achar que `caminho` só existe num dos dois caminhos. */
type Onde = { erro?: string; caminho?: string };

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const bruto = u.searchParams.get('lang') || '';
  const lang = ehLang(bruto) ? bruto : 'pt';
  const t = textos(lang);
  const caso = Number(u.searchParams.get('caso'));

  const email = await emailDaSessao();
  if (!email) return new NextResponse(t.erroEntrePrimeiro, { status: 401 });
  if (!caso) return new NextResponse(t.rotErroSumiu, { status: 400 });

  const onde = await rpc<Onde>(
    'walkstamp_roteiro_anexo_de', { p_email: email, p_caso_id: caso },
  ).catch(() => ({ erro: 'leitura' }) as Onde);
  /* A mesma recusa para "não é seu" e para "não existe": responder coisas
     diferentes contaria, a quem não pode ver, quais casos existem. */
  if (onde?.erro || !onde?.caminho) return new NextResponse(t.rotErroSemAcesso, { status: 403 });

  try {
    return NextResponse.redirect(await assinarAnexo(onde.caminho, 120), {
      status: 303, headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return new NextResponse(t.erroLeitura, { status: 502 });
  }
}
