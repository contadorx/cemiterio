/* O AVISO DE QUE UM CHAMADO FOI RESPONDIDO.
 *
 * Sem ele, responder pelo painel grava a resposta e mais nada acontece: quem
 * escreveu não tem por que voltar a `/conta/chamados` para conferir. A resposta
 * existiria, correta, e ninguém leria — que é o mesmo resultado de não
 * responder, com mais trabalho.
 *
 * Ele é DELIBERADAMENTE curto e não repete a resposta inteira. Dois motivos: o
 * texto pode ter dado de quem escreveu (o chamado costuma trazer contexto de
 * trabalho), e um e-mail que já diz tudo faz a pessoa não voltar — e é na tela
 * que ela vê o histórico e pode responder de novo.
 *
 * `replyTo` aponta para o contato de gente, e não para o endereço de disparo.
 * Responder a um remetente que ninguém lê é a conversa morrendo na segunda
 * mensagem.
 */
import 'server-only';
import { mandarEmail } from '@/lib/email';
import marca from '@/src/marca.json';

const TXT: Record<string, { assunto: (n: string) => string; ola: string;
                            corpo: string; botao: string; rodape: string }> = {
  pt: {
    assunto: (n) => `Respondemos o seu chamado ${n}`,
    ola: 'Olá,',
    corpo: 'Respondemos o que você nos escreveu. A resposta está na sua conta, junto do histórico do chamado.',
    botao: 'Ver a resposta',
    rodape: 'Você recebeu isto porque abriu um chamado no Walkstamp.',
  },
  en: {
    assunto: (n) => `We replied to your ticket ${n}`,
    ola: 'Hello,',
    corpo: 'We replied to what you wrote to us. The answer is in your account, next to the ticket history.',
    botao: 'See the reply',
    rodape: 'You received this because you opened a ticket on Walkstamp.',
  },
};

const CAMINHO: Record<string, string> = {
  pt: '/conta/chamados', en: '/en/account/tickets', es: '/es/cuenta/incidencias',
  de: '/de/konto/tickets', fr: '/fr/compte/tickets',
};

export async function avisarChamadoRespondido(
  email: string | null | undefined, numero: string, idioma?: string | null,
): Promise<void> {
  /* Sem e-mail não há a quem avisar, e isso é comum: o recado pode ter vindo
     sem identificação. Não é erro — é o caso normal de um canal anônimo. */
  if (!email) return;
  const L = TXT[String(idioma || 'pt')] ? String(idioma) : 'pt';
  const t = TXT[L] || TXT.pt;
  const url = marca.site + (CAMINHO[L] || CAMINHO.pt);

  await mandarEmail({
    para: email,
    assunto: t.assunto(numero),
    responderPara: marca.contato,
    html:
      `<div style="font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#15171C">` +
      `<p>${t.ola}</p><p>${t.corpo}</p>` +
      `<p><a href="${url}" style="display:inline-block;background:#3A3F9E;color:#fff;` +
      `text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${t.botao}</a></p>` +
      `<p style="color:#5C6473;font-size:13px">${t.rodape}</p></div>`,
    texto: `${t.ola}\n\n${t.corpo}\n\n${url}\n\n${t.rodape}`,
  });
}
