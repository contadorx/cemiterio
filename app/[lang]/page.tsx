/* A home, nos três idiomas: `/`, `/en`, `/es`. */
import type { Metadata } from 'next';
import { IDIOMAS, type Lang, SCRIPTS, alternativas, endereco, marca, paginaHtml, tokens, trocar } from '@/lib/site';

/* A imagem de compartilhamento. Ela não existia, e um link sem imagem numa
   linha do tempo é um link que ninguém clica — cada compartilhamento era o
   canal de crescimento de um produto sem cadastro sendo jogado fora.
   É PNG e não SVG: LinkedIn e WhatsApp não renderizam SVG em prévia. */
const ogImagem = (lang: string) => ({
  url: `${marca.site}/og/og.${lang}.png`,
  width: 1200, height: 630,
});

export const dynamicParams = false;

export function generateStaticParams() {
  return IDIOMAS.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: PageProps<'/[lang]'>): Promise<Metadata> {
  const lang = (await params).lang as Lang;
  const t = tokens(lang);
  /* O título traduzido contém `{{marca}}` — o nome do produto não fica escrito à
     mão em três idiomas. Aqui o valor vai direto para o <head> sem passar pelo
     template, então a troca tem que ser feita na mão: sem ela o visitante lê
     "{{marca}} — sua gravação vira documento" na aba do navegador. */
  const titulo = trocar(t.title, t);
  return {
    title: titulo,
    description: trocar(t.desc, t),
    alternates: { canonical: marca.site + endereco('home', lang), languages: alternativas('home', true) },
    openGraph: { type: 'website', title: titulo, description: trocar(t.ogDesc, t),
                 url: marca.site + endereco('home', lang), siteName: marca.marca,
                 locale: lang, images: [ogImagem(lang)] },
    twitter: { card: 'summary_large_image', title: titulo,
               description: trocar(t.ogDesc, t), images: [ogImagem(lang).url] },
  };
}

export default async function Home({ params }: PageProps<'/[lang]'>) {
  const lang = (await params).lang as Lang;
  /* A detecção de idioma. Na home portuguesa ela pode REDIRECIONAR; nas outras
     duas só registra a escolha, porque quem está em /en ou /es chegou por link
     ou já foi redirecionado uma vez.

     Vai como primeiro filho do <body>: o navegador executa um script inline
     antes de continuar a analisar o que vem depois, então na prática ele roda
     antes de qualquer conteúdo aparecer — que era o motivo de estar no <head>. */
  const deteccao = lang === 'pt' ? SCRIPTS.detectarIdioma : SCRIPTS.lembrarIdioma;
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: deteccao }} />
      {/* `display:contents` faz esta div não gerar caixa nenhuma: o cabeçalho
          continua grudando no topo e o layout é o mesmo de antes, byte por byte. */}
      <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: paginaHtml('home', lang) }} />
    </>
  );
}
