"use client";

import { useEffect } from "react";
import Link from "next/link";
import { painel, cor } from "../ui";

/**
 * /painel/planos virou uma ABA da Carteira (/painel/clientes?aba=jazigos).
 *
 * A tela não foi apagada: o corpo dela é src/app/painel/clientes/VisaoJazigos.tsx.
 * Este endereço continua de pé porque existe em favorito, em link colado no
 * WhatsApp e na memória de quem usa o sistema todo dia — sumir com ele daria
 * 404 em quem não fez nada de errado.
 */
export default function PlanosRedireciona() {
  useEffect(() => {
    location.replace("/painel/clientes?aba=jazigos");
  }, []);

  return (
    <div style={painel.wrap}>
      <div style={{ ...painel.conteudo, paddingTop: 40 }}>
        <p style={{ color: cor.cinza }}>
          A gestão dos jazigos agora fica dentro da <b>Carteira</b>. Levando você para lá…
        </p>
        <Link href="/painel/clientes?aba=jazigos" style={painel.botao}>
          Abrir a Carteira
        </Link>
      </div>
    </div>
  );
}
