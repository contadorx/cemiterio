import type { MetadataRoute } from "next";
import { MARCA } from "@/lib/marca";

/**
 * MAPA DO SITE — não existia, e sem ele o Google descobre as páginas por sorte.
 *
 * Só entram as páginas PÚBLICAS e sem token. Painel, campo, portal da família
 * (/familia/[token]), plaquetas e avaliações ficam de fora de propósito: são
 * endereços privados, e listá-los num arquivo público seria entregar o caminho.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = `https://${MARCA.site}`;
  const agora = new Date();

  return [
    { url: base, lastModified: agora, changeFrequency: "monthly", priority: 1 },
    // porta de quem já é cliente e perdeu o link — é pública e útil na busca
    { url: `${base}/familia`, lastModified: agora, changeFrequency: "yearly", priority: 0.5 },
  ];
}
