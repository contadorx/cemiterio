export const metadata = {
  title: "Sureya",
  description: "Atendimento e gestão do serviço de limpeza de túmulos",
};

// Essencial para o sistema funcionar bem no celular
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, WebkitTextSizeAdjust: "100%" }}>{children}</body>
    </html>
  );
}
