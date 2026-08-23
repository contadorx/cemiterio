import { redirect } from "next/navigation";

/**
 * A liberação agora é a PRIMEIRA aba de Conversas.
 *
 * Estava numa tela só dela, e o resultado é conhecido: a mensagem preparada
 * ficava num endereço e a conversa com a mesma família em outro, e decidir
 * sobre uma sem ver a outra é como três mensagens saem para a mesma pessoa no
 * mesmo dia.
 *
 * O endereço continua funcionando: está em links e no navegador dela.
 */
export default function FilaMudouDeEndereco() {
  redirect("/painel/conversas");
}
