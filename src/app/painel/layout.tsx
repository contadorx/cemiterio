import AppShell from "./AppShell";

/**
 * O painel inteiro passa a viver dentro do mesmo esqueleto: coluna escura no
 * desktop, gaveta no celular.
 *
 * Vive num `layout.tsx` e não em cada tela porque assim a navegação NÃO
 * remonta a cada troca de página — ela persiste, e a transição fica instantânea.
 * Era esse remonte que fazia cada tela parecer um site diferente.
 */
export default function LayoutPainel({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
