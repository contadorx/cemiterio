/* ESTE WEBHOOK FOI APOSENTADO. A autoridade é `POST /api/stripe/webhook`.
 *
 * ---- POR QUE ELE SAIU, E NÃO POR CAPRICHO ----
 *
 * Existiam dois webhooks da Stripe, e o repositório não dizia qual URL estava
 * configurada no painel dela. Não era empate: esta função tratava SÓ faturas.
 * Ela nunca tratou `checkout.session.completed` nem `customer.subscription.*`,
 * que são os eventos que CONCEDEM O PLANO.
 *
 * Com a URL apontada para cá, a pessoa pagava, a fatura aparecia — e o plano
 * nunca chegava. Em silêncio, porque a Stripe recebia 200 e ia embora
 * satisfeita. O defeito não tinha sintoma do lado dela nem do nosso; só do lado
 * de quem pagou.
 *
 * A rota do Next faz tudo o que esta fazia, mais os eventos de assinatura, e
 * confere a assinatura do corpo com `constructEvent` da biblioteca oficial —
 * comparação em tempo constante e janela de relógio, coisas que dá para
 * escrever à mão e não dá para escrever à mão *bem*.
 *
 * ---- POR QUE 410 E NÃO APAGAR A FUNÇÃO ----
 *
 * Apagar deixaria a Stripe recebendo 404, que é indistinguível de um deploy
 * quebrado. O 410 diz que o endereço EXISTIU e mudou, e o corpo diz para onde —
 * é a diferença entre um erro que se investiga por meia hora e um erro que se
 * lê. Ela também continua reentregando, e é o que se quer: um evento que bateu
 * aqui é um evento que ainda não foi processado.
 *
 * ---- A ORDEM DE APLICAR ----
 *
 * 1. mover a URL no painel da Stripe para `https://<host>/api/stripe/webhook`;
 * 2. reenviar por lá os eventos que falharam, se houver;
 * 3. SÓ ENTÃO publicar esta versão.
 *
 * Ao contrário, as faturas do intervalo se perdem — e elas se perdem em
 * silêncio, que é a coisa que este arquivo inteiro existe para acabar.
 *
 * `assinatura.mjs` fica onde está: ele é a fechadura, tem régua própria
 * (`testes/stripehook.mjs`) e continua sendo a referência de como conferir uma
 * assinatura da Stripe sem a biblioteca.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PARA = "/api/stripe/webhook";

Deno.serve((req) => {
  const destino = (Deno.env.get("WALKSTAMP_SITE") || "https://walkstamp.com") + PARA;
  /* Sem corpo em GET: quem abre no navegador é gente, e o 410 já diz tudo. */
  const recado =
    `Este webhook foi aposentado. Configure a Stripe para ${destino}.\n` +
    `Ele tratava só faturas e nunca tratou checkout.session.completed nem\n` +
    `customer.subscription.*, então uma compra virava fatura sem virar plano.\n`;
  return new Response(recado, {
    status: 410,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Location": destino },
  });
});
