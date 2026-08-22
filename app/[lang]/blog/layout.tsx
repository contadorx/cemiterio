/* A CASCA DO BLOG — o mesmo cabeçalho e o mesmo rodapé do resto do site.
 *
 * As páginas internas do site são HTML gerado (`src/site/doc.html`), e o
 * cabeçalho e o rodapé moram lá dentro. O blog é React, então nasceu sem os
 * dois: logo nenhum, menu nenhum, rodapé nenhum — uma página branca com texto,
 * que é exatamente o que não se quer no lugar onde a pessoa chega vinda do
 * LinkedIn e decide se este produto é sério.
 *
 * Aqui a casca é remontada a partir das MESMAS fontes que o resto usa: os
 * rótulos saem de `tokens(lang)` (o `i18n-site.json`) e os endereços de
 * `endereco()` (o `rotas.json`). Nada é escrito à mão — se fosse, seria a
 * terceira cópia do mesmo cabeçalho, e a primeira a ficar para trás.
 */
import { IDIOMAS, type Lang, endereco, marca, tokens } from '@/lib/site';
import { enderecoBlog } from './txt';

export const dynamicParams = false;
export function generateStaticParams() {
  return IDIOMAS.map((lang) => ({ lang }));
}

export default async function CascaDoBlog({ children, params }: LayoutProps<'/[lang]/blog'>) {
  const { lang } = await params;
  const L = lang as Lang;
  const t = tokens(L);
  const rota = (pg: string) => endereco(pg, L);
  const home = L === 'pt' ? '/' : `/${L}`;

  return (
    <>
      <header>
        <div className="wrap">
          <a className="brand" href={home}>
            <img src="/logo.svg" alt="" />
            <span>{marca.marcaA}<b>{marca.marcaB}</b></span>
          </a>
          <nav>
            <a href={`${home}#como`} className="hide-sm">{t.navHow}</a>
            <a href={rota('comparativo')} className="hide-sm">{t.navComp}</a>
            <a href={rota('precos')} className="hide-xs">{t.navPrice}</a>
            {/* O Blog no menu do próprio blog. Faltava aqui e nas outras
                telas — e faltar JUSTO aqui é o pior dos casos: quem está lendo
                um post não tem como voltar para a lista sem o botão de voltar
                do navegador. */}
            <a href={t.blog} className="hide-sm">{t.fBlog}</a>
            <a className="btnTop" href={`/app?lang=${L}`}>{t.navApp}</a>
            {/* O seletor leva para o MESMO lugar no outro idioma — o índice do
                blog daquele idioma, e não a home. Mandar para a home seria
                perder a página em que a pessoa estava para trocar de língua. */}
            <span style={{ display: 'inline-flex', gap: 9, borderLeft: '1px solid var(--line)', paddingLeft: 12 }}>
              {IDIOMAS.map((L2) => (
                <a key={L2} href={enderecoBlog(L2)}
                   style={L2 === L ? { color: 'var(--ink)', fontWeight: 600 } : undefined}>
                  {L2.toUpperCase()}
                </a>
              ))}
            </span>
          </nav>
        </div>
      </header>

      {children}

      <footer>
        <div className="wrap">
          <div className="rodapeCols">
            <div>
              <h3>{t.fColProduto}</h3>
              <a href={`/app?lang=${L}`}>{t.navApp}</a>
              <a href={rota('precos')}>{t.navPrice}</a>
              <a href={rota('ajuda')}>{t.fAjuda}</a>
              <a href={t.blog}>{t.fBlog}</a>
              <a href={rota('comparativo')}>{t.fComp}</a>
              <a href={t.conta}>{t.fConta}</a>
            </div>
            <div>
              <h3>{t.fColCasos}</h3>
              <a href={rota('casoEv')}>{t.casoEvT}</a>
              <a href={rota('casoIn')}>{t.casoInT}</a>
              <a href={rota('casoAta')}>{t.casoAtaT}</a>
              <a href={rota('casoUx')}>{t.casoUxT}</a>
              <a href={rota('casoIa')}>{t.casoIaT}</a>
            </div>
            <div>
              <h3>{t.fColConfianca}</h3>
              <a href={rota('seguranca')}>{t.fSec}</a>
              <a href={rota('verificar')}>{t.fVerif}</a>
              <a href={rota('privacidade')}>{t.fPriv}</a>
              <a href={rota('termos')}>{t.fTerms}</a>
              <a href={rota('steps')}>{t.fPsr}</a>
            </div>
          </div>
          <div className="rodapeFim">{marca.empresa} · CNPJ {marca.cnpj}</div>
        </div>
      </footer>
    </>
  );
}
