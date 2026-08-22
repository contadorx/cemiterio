/* A área do cliente tem a casca do site — e agora o MENU do site também.

   Ela não tinha, e o argumento era este: "quem está aqui veio resolver uma coisa
   (fatura, chamado, assento) e não é hora de oferecer as páginas de venda". O
   argumento continua bom para o CORPO da página e continua valendo lá: não há
   oferta nenhuma dentro do painel.

   Mas o cabeçalho não é o corpo. Ele é a moldura, e uma moldura que muda de
   página para página ensina que se saiu do produto — que é o oposto do que uma
   área de cliente precisa dizer. Três telas da mesma marca, três menus
   diferentes, e a marca dando um passo para o lado a cada pulo.

   O layout mora dentro de `[lang]` pelo mesmo motivo que o do site: é a única
   forma de o `<html lang>` ser o idioma da página. O endereço público não tem o
   segmento — é `/conta`, `/en/account` e `/es/cuenta`, traduzido como o resto do
   site. Quem faz a ponte é o `rewrites` do next.config. */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { marca } from '@/lib/marca';
import { CAMINHO, HTML_LANG, IDIOMAS_CONTA, ehLang, textos } from '@/lib/conta/textos';
import { type Lang as LangSite, endereco, tokens } from '@/lib/site';

export function generateStaticParams() {
  return IDIOMAS_CONTA.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<'/conta/[lang]'>): Promise<Metadata> {
  const { lang } = await params;
  const t = textos(ehLang(lang) ? lang : 'pt');
  return {
    title: `${t.tituloAba} — ${marca.marca}`,
    // a área do cliente não é conteúdo público; deixá-la fora do índice evita
    // que uma tela de login apareça na busca no lugar da página de preços
    robots: { index: false, follow: false },
    icons: { icon: [{ url: `/favicon.ico?v=${marca.iconV}`, sizes: 'any' }, { url: '/favicon.svg', type: 'image/svg+xml' }] },
  };
}

export default async function LayoutDaConta({ children, params }: LayoutProps<'/conta/[lang]'>) {
  const { lang } = await params;
  if (!ehLang(lang)) notFound();
  const t = textos(lang);
  /* Os textos e os endereços do SITE, para o rodapé ser o mesmo dos dois lados.
     `endereco()` já sabe o slug traduzido de cada página em cada idioma — é o
     que evita um `/de/precos` que não existe (lá é `/de/preise`). */
  const s3 = tokens(lang as LangSite);
  const rota = (pg: string) => endereco(pg, lang as LangSite);
  return (
    <html lang={HTML_LANG[lang]}>
      <body>
        <link rel="stylesheet" href="/site.css" />
        <header>
          <div className="wrap">
            <a className="brand" href={lang === 'pt' ? '/' : `/${lang}`}>
              <img src="/logo.svg" alt="" />
              <span>{marca.marcaA}<b>{marca.marcaB}</b></span>
            </a>
            <nav>
              {/* Os MESMOS itens do site e da ferramenta, na mesma ordem e com
                  as mesmas quebras. Os rótulos e os endereços saem do dicionário
                  e das rotas do site — escrevê-los aqui seria a terceira cópia
                  da mesma lista. */}
              <a href={`${rota('home')}#como`} className="hide-sm">{s3.navHow}</a>
              <a href={rota('comparativo')} className="hide-sm">{s3.navComp}</a>
              <a href={rota('precos')} className="hide-xs">{s3.navPrice}</a>
              <a href={s3.blog} className="hide-sm">{s3.fBlog}</a>
              <a className="btnTop" href={`/app?lang=${lang}`}>{t.abrirFerramenta}</a>
              <span style={{ display: 'inline-flex', gap: 9, borderLeft: '1px solid var(--line)', paddingLeft: 12 }}>
                {IDIOMAS_CONTA.map((L) => (
                  <a key={L} href={CAMINHO[L]}
                     style={L === lang ? { color: 'var(--ink)', fontWeight: 600 } : undefined}>
                    {L.toUpperCase()}
                  </a>
                ))}
              </span>
            </nav>
          </div>
        </header>
        {children}
        {/* O rodapé é o MESMO do site, em três colunas.
            Ele era uma linha com três links — e a conta é onde a pessoa está
            quando lembra de procurar a política de privacidade, o comparativo
            ou a página que explica como conferir uma evidência. Ter que voltar
            para a home para achar o rodapé é o tipo de caminho que ninguém faz:
            fecha a aba. As colunas e os textos saem do mesmo `rotas.json` e do
            mesmo `i18n-site.json` que o site usa, então eles não têm como
            divergir. */}
        <footer>
          <div className="wrap">
            <div className="rodapeCols">
              <div>
                <h3>{s3.fColProduto}</h3>
                <a href={`/app?lang=${lang}`}>{s3.navApp}</a>
                <a href={rota('precos')}>{s3.navPrice}</a>
                <a href={rota('ajuda')}>{s3.fAjuda}</a>
                <a href={s3.blog}>{s3.fBlog}</a>
                <a href={rota('comparativo')}>{s3.fComp}</a>
                <a href={CAMINHO[lang]}>{s3.fConta}</a>
              </div>
              <div>
                <h3>{s3.fColCasos}</h3>
                <a href={rota('casoEv')}>{s3.casoEvT}</a>
                <a href={rota('casoIn')}>{s3.casoInT}</a>
                <a href={rota('casoAta')}>{s3.casoAtaT}</a>
                <a href={rota('casoUx')}>{s3.casoUxT}</a>
                <a href={rota('casoIa')}>{s3.casoIaT}</a>
              </div>
              <div>
                <h3>{s3.fColConfianca}</h3>
                <a href={rota('seguranca')}>{s3.fSec}</a>
                <a href={rota('verificar')}>{s3.fVerif}</a>
                <a href={rota('privacidade')}>{s3.fPriv}</a>
                <a href={rota('termos')}>{s3.fTerms}</a>
                <a href={rota('steps')}>{s3.fPsr}</a>
              </div>
            </div>
            <div className="rodapeFim">
              {marca.empresa} · CNPJ {marca.cnpj}
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
