import type { MetadataRoute } from "next";
import { MARCA, CEMITERIOS } from "@/lib/marca";

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
    { url: base, lastModified: agora, changeFrequency: "monthly" as const, priority: 1 },
    // UMA ENTRADA POR CEMITÉRIO. São elas que respondem a busca real ("limpeza
    // de túmulo no <nome do cemitério>"), então valem mais que a home genérica.
    ...CEMITERIOS.map((cem) => ({
      url: `${base}/cemiterio/${cem.slug}`,
      lastModified: agora,
      changeFrequency: "monthly" as const,
      priority: 0.9,
    })),
    // porta de quem já é cliente e perdeu o link — é pública e útil na busca
    { url: `${base}/familia`, lastModified: agora, changeFrequency: "yearly" as const, priority: 0.5 },
  ];
}
