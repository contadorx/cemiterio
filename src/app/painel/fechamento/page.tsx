"use client";

import { PainelNav, painel } from "../ui";
import { PainelFechamento } from "./Fechamento";

/**
 * Página para quem chegar por link direto ou favorito.
 *
 * O componente vive em `Fechamento.tsx`, e NÃO aqui: um arquivo `page.tsx` do
 * Next só pode exportar `default` e alguns campos reservados. Exportar o
 * componente daqui para o Financeiro reusar quebrava o build com
 * "PainelFechamento is not a valid Page export field".
 *
 * O caminho normal é a aba "Fechar o mês" dentro do Financeiro — dinheiro tem
 * uma porta só, não duas no menu.
 */
export default function FechamentoPagina() {
  return (
    <div style={painel.wrap}>
      <PainelNav atual="/painel/financeiro" />
      <div style={painel.conteudo}>
        <h1 style={painel.h1}>Fechamento do mês</h1>
        <PainelFechamento />
      </div>
    </div>
  );
}
