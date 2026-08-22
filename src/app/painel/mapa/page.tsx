"use client";

import { useEffect } from "react";
import Link from "next/link";
import { painel, cor } from "../ui";

/**
 * /painel/mapa virou uma ABA da Carteira (/painel/clientes?aba=mapa).
 *
 * O corpo da tela é src/app/painel/clientes/VisaoMapa.tsx — nada foi reescrito.
 * Este endereço fica de pé porque existe em favorito e em link colado; sumir com
 * ele daria 404 em quem não fez nada de errado.
 */
export default function MapaRedireciona() {
  useEffect(() => {
    location.replace("/painel/clientes?aba=mapa");
  }, []);

  return (
    <div style={painel.wrap}>
      <div style={{ ...painel.conteudo, paddingTop: 40 }}>
        <p style={{ color: cor.cinza }}>
          O mapa agora fica dentro da <b>Carteira</b>. Levando você para lá…
        </p>
        <Link href="/painel/clientes?aba=mapa" style={painel.botao}>
          Abrir a Carteira
        </Link>
      </div>
    </div>
  );
}
