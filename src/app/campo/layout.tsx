import RegistrarSW from "./RegistrarSW";

import { MARCA } from "@/lib/marca";

export const metadata = {
  title: `Campo — ${MARCA.nome}`,
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#0f766e",
};

export default function CampoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RegistrarSW />
      {children}
    </>
  );
}
