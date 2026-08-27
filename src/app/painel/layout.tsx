import AppShell from "./AppShell";
import Dialogos from "@/components/Dialogos";

/**
 * O painel inteiro passa a viver dentro do mesmo esqueleto: coluna escura no
 * desktop, gaveta no celular.
 *
 * Vive num `layout.tsx` e não em cada tela porque assim a navegação NÃO
 * remonta a cada troca de página — ela persiste, e a transição fica instantânea.
 * Era esse remonte que fazia cada tela parecer um site diferente.
 */
export default function LayoutPainel({ children }: { children: React.ReactNode }) {
  // O balcão de perguntar e avisar vive AQUI, junto do esqueleto: uma tela que
  // monta o próprio provedor perderia o recado ao trocar de página, que é
  // justamente quando ele importa ("3 movidas" ao sair da agenda).
  return (
    <Dialogos>
      <AppShell>{children}</AppShell>
    </Dialogos>
  );
}
