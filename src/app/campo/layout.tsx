

import { MARCA } from "@/lib/marca";
import Dialogos from "@/components/Dialogos";

export const metadata = {
  title: `Campo — ${MARCA.nome}`,
  manifest: "/manifest-campo.json",
};

export const viewport = {
  themeColor: "#0f766e",
};

export default function CampoLayout({ children }: { children: React.ReactNode }) {
  // `campo` deixa tudo maior: quem lê isto está de pé, no sol, às vezes de luva.
  return <Dialogos campo>{children}</Dialogos>;
}
