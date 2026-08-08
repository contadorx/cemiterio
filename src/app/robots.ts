import type { MetadataRoute } from "next";
import { MARCA } from "@/lib/marca";

/**
 * ROBOTS — também não existia.
 *
 * Libera a home e a porta do cliente; BLOQUEIA tudo que é privado ou tem token
 * na URL. O portal da família (/familia/TOKEN) não pode ser indexado: o link é
 * a senha, e um portal listado no Google é o histórico de uma família exposto
 * para qualquer um.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/familia"],
        disallow: [
          "/painel",
          "/campo",
          "/login",
          "/api/",
          "/familia/",   // /familia/TOKEN — o link é a senha
          "/t/",         // QR da plaqueta
          "/avaliar/",
          "/indicar/",
        ],
      },
    ],
    sitemap: `https://${MARCA.site}/sitemap.xml`,
  };
}
