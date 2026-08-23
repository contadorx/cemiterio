import { redirect } from "next/navigation";

/**
 * A conexão do WhatsApp agora é uma aba de Configurações.
 *
 * O endereço continua de pé: ele está em links dentro do sistema — a fila de
 * liberação aponta para cá quando a instância cai, que é justamente a hora em
 * que ninguém quer descobrir que a tela mudou de lugar.
 */
export default function WhatsappMudouDeEndereco() {
  redirect("/painel/config?aba=whatsapp");
}
