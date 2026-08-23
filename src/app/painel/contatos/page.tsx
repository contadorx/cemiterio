import { redirect } from "next/navigation";

/**
 * "Contatos" virou "Conversas".
 *
 * O endereço fica de pé porque ele está em links, em avisos de outras telas e
 * no que a Sureya guardou no navegador. Uma tela que some vira 404 justamente
 * para quem já sabia usá-la — e o 404 ensina a não voltar.
 */
export default function ContatosMudouDeEndereco() {
  redirect("/painel/conversas?aba=site");
}
