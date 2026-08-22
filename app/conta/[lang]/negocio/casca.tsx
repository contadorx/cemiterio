/* A casca do back-office: a faixa de abas, a checagem de quem pode entrar, e a
 * fábrica que transforma isso numa página.
 *
 * ---- por que uma FÁBRICA e não cinco páginas parecidas ----
 *
 * As cinco telas fazem exatamente a mesma coisa antes de desenhar: conferir o
 * idioma, carregar a sessão, recusar quem não é o dono, ler o painel. Copiada
 * cinco vezes, essa sequência é cinco lugares onde a recusa pode ficar
 * diferente — e o dia em que uma delas esquecer o `!carga.tem.dono` é o dia em
 * que qualquer cliente logado lê a receita da empresa inteira.
 *
 * ---- por que a recusa é um REDIRECT e não uma tela ----
 *
 * A aba `Negócio` só existe no menu de quem é dono. Quem chega no endereço sem
 * ser dono chegou digitando ou adivinhando; responder "área restrita" confirma
 * que ela existe. Mandar para a raiz da conta não confirma nada.
 */
import { notFound, redirect } from 'next/navigation';
import { type Lang, ehLang, textos, CAMINHO } from '@/lib/conta/textos';
import { ABAS } from '@/lib/conta/negocio';
import { painelDoNegocio, type Painel } from '@/lib/supabase/servico';
import { Envolver, carregar } from '../carga';

export const dynamic = 'force-dynamic';

/** A faixa. Server component: a aba ativa vem do argumento, que a página já
 *  sabe — `usePathname` custaria `use client` e React no navegador numa área
 *  que hoje não manda JavaScript nenhum. */
function Abas({ lang, aba }: { lang: Lang; aba: string }) {
  return (
    <nav className="negAbas" aria-label="Seções do negócio">
      {ABAS.map((a) => (
        <a key={a.slug || 'radar'} href={a.href(lang)}
           className={a.slug === aba ? 'on' : undefined}
           aria-current={a.slug === aba ? 'page' : undefined}>
          {a.rotulo}
        </a>
      ))}
    </nav>
  );
}

export function paginaDoNegocio(
  aba: string,
  Conteudo: (p: { d: Painel; lang: Lang }) => React.ReactNode,
) {
  return async function Pagina({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    if (!ehLang(lang)) notFound();
    const t = textos(lang);
    const carga = await carregar();
    if (carga.estado !== 'ok' || !carga.tem.dono) redirect(CAMINHO[lang]);

    /* Se a leitura do painel falhar, a tela DIZ o que falhou. Um back-office que
       aparece vazio quando o banco recusa é o pior dos dois mundos: parece que
       não há clientes. */
    let d: Painel | null = null;
    let erro = '';
    try {
      d = await painelDoNegocio();
    } catch (e) {
      erro = String(e).slice(0, 400);
    }

    return (
      <Envolver lang={lang} t={t} slug="negocio" carga={carga}>
        <h1 className="soLeitor">{t.navNegocio}</h1>
        <Abas lang={lang} aba={aba} />
        {d ? <Conteudo d={d} lang={lang} /> : (
          <div className="card">
            <h2>Não deu para ler o painel</h2>
            <p className="small muted">
              A função <code>walkstamp_negocio_painel</code> existe no banco? Ela é
              a única leitura desta área, e está revogada de todo mundo menos do
              <code> service_role</code> — de propósito.
            </p>
            <pre className="small" style={{ whiteSpace: 'pre-wrap' }}>{erro}</pre>
          </div>
        )}
      </Envolver>
    );
  };
}
