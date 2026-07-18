export const metadata = {
  title: "Sureya",
  description: "Atendimento e gestão do serviço de limpeza de túmulos",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
