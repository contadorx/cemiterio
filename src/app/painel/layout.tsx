import AppShell from "./AppShell";
import Dialogos from "@/components/Dialogos";
import EstiloMobile from "./EstiloMobile";

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
      {/* A FOLHA DO CELULAR NUNCA ESTEVE NO AR.
          `EstiloMobile` chegou em 23/08 e `ui.tsx` a IMPORTAVA — mas nenhum
          arquivo do repositório escrevia `<EstiloMobile />`. Import sem uso não
          quebra build, não acende lint e não aparece em teste nenhum: o arquivo
          existia, a intenção estava escrita no comentário dele, e o painel
          seguiu quatro dias sem uma linha daquilo no DOM.

          É o mesmo tipo de falha que já mordeu o WhatsApp (dezenove dias calado)
          e o motor de memória (entregando zero): a coisa está pronta, ninguém
          desligou, e mesmo assim ela nunca rodou.

          Aqui, e não em `PainelNav`, porque 17 das 32 telas do painel não
          montam `PainelNav` — entre elas a INICIAL e a FICHA DA FAMÍLIA, que é
          a maior do sistema. O layout é por onde o painel inteiro passa.

          Tudo o que ela faz está dentro de `@media (max-width: 640px)`: no
          desktop, nada muda. */}
      <EstiloMobile />
      <AppShell>{children}</AppShell>
    </Dialogos>
  );
}
