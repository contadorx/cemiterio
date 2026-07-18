import RegistrarSW from "./RegistrarSW";

export const metadata = {
  title: "Sureya Campo",
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
