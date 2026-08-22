/* O DISPARADOR DE E-MAIL TRANSACIONAL — Brevo.
 *
 * ---- por que um lugar só ----
 *
 * O convite era o único e-mail que o produto mandava, e a chamada ao serviço
 * morava dentro da rota dele. Agora há um segundo (a resposta de um chamado) e
 * vão aparecer outros. Cada rota com a sua chamada é cada rota com a sua versão
 * do remetente, do tratamento de erro e do que fazer quando falta segredo — e a
 * primeira a divergir é a que ninguém testou.
 *
 * ---- por que Brevo, e não SMTP da hospedagem ----
 *
 * A HostGator serve as CAIXAS (`privacidade@`, `contato@`): gente abre e
 * responde. A política dela proíbe envio em massa em hospedagem compartilhada,
 * o limite não é publicado e a punição prevista é suspensão da conta — a mesma
 * que hospeda o e-mail. Disparo de produto é outra coisa e mora em outro lugar.
 *
 * ---- a regra que vale para todo envio daqui ----
 *
 * **Faltando segredo, ele RECUSA em vez de fingir.** Um disparador que devolve
 * "ok" sem ter mandado nada é a pior falha possível: ninguém procura o e-mail
 * que o sistema jurou ter enviado.
 */
import 'server-only';

const CHAVE = process.env.BREVO_API_KEY;

/* O endereço do serviço, com desvio para o teste.
 *
 * Mesma trava do `WALKSTAMP_SUPA_TESTE`: **só endereço local é aceito**. Uma
 * variável mal configurada em produção não consegue apontar o disparo para o
 * servidor de um terceiro — no máximo aponta para o próprio processo, e aí
 * quebra na hora e à vista, que é o jeito certo de uma configuração errada
 * falhar. Sem isso, provar que o corpo enviado é o do Brevo exigiria mandar
 * e-mail de verdade a cada rodada de teste. */
const BREVO = (() => {
  const t = (process.env.WALKSTAMP_BREVO_BASE || '').trim();
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(t) ? t : 'https://api.brevo.com';
})();

/* O remetente aceita as duas formas: `EMAIL_DE` com o endereço puro, ou o
   formato `Nome <endereco>` que a variável antiga do convite usava. A segunda
   existe para nada quebrar em quem já configurou — e não para ser a preferida. */
function remetente(): { name: string; email: string } | null {
  const cru = (process.env.EMAIL_DE || process.env.CONVITE_DE || '').trim();
  if (!cru) return null;
  const m = cru.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || 'Walkstamp', email: m[2].trim() };
  return { name: (process.env.EMAIL_DE_NOME || 'Walkstamp').trim(), email: cru };
}

export const podeMandarEmail = () => Boolean(CHAVE && remetente());

export type Carta = {
  para: string;
  nome?: string;
  assunto: string;
  html: string;
  texto: string;
  /* Para onde vai a RESPOSTA de quem recebeu. O remetente é um endereço de
     disparo; responder para ele é escrever para um lugar que ninguém lê. */
  responderPara?: string;
};

/** Manda. Devolve `{ok:true}` ou `{ok:false, motivo}` — e nunca lança, porque
 *  quem chama quase sempre tem trabalho já feito que não pode ser desfeito por
 *  causa de um e-mail. */
export async function mandarEmail(c: Carta): Promise<{ ok: boolean; motivo?: string }> {
  const de = remetente();
  if (!CHAVE || !de) return { ok: false, motivo: 'sem_configuracao' };

  try {
    const r = await fetch(`${BREVO}/v3/smtp/email`, {
      method: 'POST',
      headers: {
        'api-key': CHAVE,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: de,
        to: [{ email: c.para, ...(c.nome ? { name: c.nome } : {}) }],
        ...(c.responderPara ? { replyTo: { email: c.responderPara } } : {}),
        subject: c.assunto,
        htmlContent: c.html,
        textContent: c.texto,
      }),
      cache: 'no-store',
    });
    if (!r.ok) {
      /* O corpo do erro vai para o LOG e nunca para a tela: ele costuma trazer
         o endereço de destino, e a tela é de quem enviou, não de quem recebe. */
      console.error('email: brevo respondeu', r.status, (await r.text()).slice(0, 300));
      return { ok: false, motivo: `brevo_${r.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error('email: brevo não respondeu', String(e).slice(0, 200));
    return { ok: false, motivo: 'rede' };
  }
}
