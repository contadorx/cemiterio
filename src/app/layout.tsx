import { MARCA } from "@/lib/marca";
import RegistrarSW from "./_pwa/RegistrarSW";

export const metadata = {
  title: `${MARCA.nome} — ${MARCA.assinatura}`,
  description: "Cuidado e conservação de jazigos no Cemitério da Saudade, em Mauá, desde 1990.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: MARCA.nome },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

// Essencial para o sistema funcionar bem no celular
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#12284b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, WebkitTextSizeAdjust: "100%" }}><RegistrarSW />
        {children}</body>
    </html>
  );
}
