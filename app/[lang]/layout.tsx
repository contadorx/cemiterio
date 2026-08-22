/* A casca de toda página do site.
 *
 * É o layout RAIZ e ele mora dentro de `[lang]` de propósito: é a única forma de
 * o `<html lang>` ser o idioma da página em vez de um chute fixo. Sem isso, o
 * buscador e o leitor de tela leriam as três versões como se fossem português.
 *
 * O endereço público NÃO tem o `/pt`: a home portuguesa é `/` e `/precos` é
 * `/precos`, como sempre foi. Quem faz essa tradução é o `rewrites` do
 * `next.config.mjs` — mudar isso quebraria todo link já publicado e todo
 * canonical já indexado.
 */
import type { Metadata } from 'next';
import { IDIOMAS, type Lang, marca, tokens } from '@/lib/site';

export const dynamicParams = false;

export function generateStaticParams() {
  return IDIOMAS.map((lang) => ({ lang }));
}

export const metadata: Metadata = {
  icons: {
    icon: [
      { url: `/favicon.ico?v=${marca.iconV}`, sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: `/apple-touch-icon.png?v=${marca.iconV}`,
  },
};

export default async function Layout({ children, params }: LayoutProps<'/[lang]'>) {
  const { lang } = await params;
  const t = tokens(lang as Lang);
  return (
    <html lang={t.htmlLang}>
      <body data-supa-url={marca.supaUrl} data-supa-key={marca.supaKey}>
        {/* O snippet do Vercel, igual ao que estava no <head>: o `window.va`
            enfileira chamadas feitas antes do script chegar. */}
        <script dangerouslySetInnerHTML={{ __html: 'window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};' }} />
        <script defer src="/_vercel/insights/script.js" />
        <link rel="stylesheet" href="/site.css" />
        {children}
        <script src="/support.js" />
      </body>
    </html>
  );
}
