"use client";

import { useEffect } from "react";
import Link from "next/link";
import { painel, cor } from "../ui";

/**
 * Endereco antigo, mantido de pe: existe em favorito e em link colado. O corpo
 * da tela virou uma aba de /painel/conversas (src/app/painel/conversas/).
 */
export default function RascunhosRedireciona() {
  useEffect(() => {
    location.replace("/painel/conversas?aba=rascunhos");
  }, []);

  return (
    <div style={painel.wrap}>
      <div style={{ ...painel.conteudo, paddingTop: 40 }}>
        <p style={{ color: cor.cinza }}>
          Os rascunhos da IA agora ficam dentro do <b>Atendimento</b>. Levando voce para la...
        </p>
        <Link href="/painel/conversas?aba=rascunhos" style={painel.botao}>
          Abrir o Atendimento
        </Link>
      </div>
    </div>
  );
}
