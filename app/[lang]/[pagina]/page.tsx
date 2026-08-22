/* As páginas internas. O endereço é o slug TRADUZIDO — `/seguranca`,
   `/en/security`, `/es/seguridad` — porque é nelas que a busca acontece, e
   ninguém procura "seguranca" em inglês. */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  IDIOMAS, type Lang, METAS, PAGINAS, SLUGS,
  alternativas, endereco, marca, paginaHtml, porSlug,
} from '@/lib/site';

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
  return IDIOMAS.flatMap((lang) => PAGINAS.map((pg) => ({ lang, pagina: SLUGS[pg][lang] })));
}

export async function generateMetadata({ params }: PageProps<'/[lang]/[pagina]'>): Promise<Metadata> {
  const { lang, pagina } = await params;
  const nome = porSlug(pagina, lang as Lang);
  if (!nome) return {};
  const m = METAS[nome][lang as Lang];
  return {
    title: m.titulo,
    description: m.desc,
    alternates: { canonical: marca.site + endereco(nome, lang as Lang), languages: alternativas(nome) },
    openGraph: { type: 'article', title: m.titulo, description: m.desc,
                 url: marca.site + endereco(nome, lang as Lang), siteName: marca.marca,
                 locale: lang, images: [ogImagem(lang)] },
    twitter: { card: 'summary_large_image', title: m.titulo, description: m.desc,
               images: [ogImagem(lang).url] },
  };
}

export default async function Interna({ params }: PageProps<'/[lang]/[pagina]'>) {
  const { lang, pagina } = await params;
  const nome = porSlug(pagina, lang as Lang);
  if (!nome) notFound();
  return (
    <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: paginaHtml(nome, lang as Lang) }} />
  );
}
