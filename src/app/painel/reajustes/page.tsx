"use client";

import { useEffect } from "react";
import Link from "next/link";
import { painel, cor } from "../ui";

/**
 * /painel/reajustes virou uma ABA do Financeiro (/painel/financeiro?aba=reajustes).
 * O corpo da tela é src/app/painel/financeiro/Reajustes.tsx — nada reescrito.
 */
export default function ReajustesRedireciona() {
  useEffect(() => {
    location.replace("/painel/financeiro?aba=reajustes");
  }, []);

  return (
    <div style={painel.wrap}>
      <div style={{ ...painel.conteudo, paddingTop: 40 }}>
        <p style={{ color: cor.cinza }}>
          Os reajustes agora ficam dentro do <b>Financeiro</b>. Levando você para lá…
        </p>
        <Link href="/painel/financeiro?aba=reajustes" style={painel.botao}>
          Abrir o Financeiro
        </Link>
      </div>
    </div>
  );
}
