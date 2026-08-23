import { redirect } from "next/navigation";

/**
 * A ficha da família é UMA só.
 *
 * Eu tinha feito aqui uma bancada de conserto: pessoas, regime, jazigos e mais
 * nada. Foi decisão errada, e o motivo é bom — **reproduzir a ficha é criar uma
 * segunda verdade sobre a mesma família**. A minha não tinha contrato, não
 * tinha limpezas, não tinha o fechamento do mês; e cada coisa que faltasse
 * mandaria a pessoa para a ficha de verdade no meio da correção.
 *
 * A ficha de verdade é `/painel/clientes/[id]`, e ela agora aceita o id da
 * FAMÍLIA — antes só abria pela pessoa, que era a confusão de origem. O botão
 * de conferido mora lá, ao lado do que se corrige.
 */
export default function FichaMudouDeEndereco({ params }: { params: { id: string } }) {
  redirect(`/painel/clientes/${params.id}?de=conferencia`);
}
