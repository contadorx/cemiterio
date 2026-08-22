/* O webhook da Stripe. ESTE, e não o outro.
 *
 * ---- QUAL DOS DOIS ----
 *
 * Existiam duas implementações — esta rota e a Edge Function
 * `supabase/functions/walkstamp-stripe` — e o repositório não dizia qual URL
 * estava configurada no painel da Stripe. Não era empate: a Edge Function trata
 * SÓ faturas. Ela não trata `checkout.session.completed` nem
 * `customer.subscription.*`, que são os eventos que CONCEDEM O PLANO.
 *
 * Quer dizer: com a URL apontada para lá, a pessoa paga, a fatura aparece, e o
 * plano nunca chega. Em silêncio, porque a Stripe recebe 200.
 *
 * Esta é a autoridade, por três medidas:
 *   1. só ela chama `walkstamp_assinatura_da_stripe`, e portanto só ela
 *      transforma um pagamento em acesso;
 *   2. ela confere a assinatura com `constructEvent` da biblioteca oficial —
 *      comparação em tempo constante e janela de relógio, coisas que dá para
 *      escrever à mão e não dá para escrever à mão *bem*;
 *   3. medido na produção em 22/08/2026: há cliente com `stripe_assinatura`
 *      preenchido, campo que só este caminho escreve.
 *
 * A outra passou a recusar, dizendo para onde ir. A ORDEM IMPORTA na hora de
 * aplicar: mover a URL no painel da Stripe PRIMEIRO, e só depois publicar a
 * recusa — ao contrário, as faturas do intervalo se perdem.
 *
 * A fechadura é a ASSINATURA do corpo, e é só ela: quem chama é a Stripe, que
 * não tem sessão. Sem `STRIPE_WEBHOOK_SECRET` configurado a rota recusa tudo,
 * inclusive o que for legítimo — um webhook aberto é um jeito de qualquer
 * pessoa marcar a própria fatura como paga e liberar o plano pago para si.
 *
 * A conferência é a da biblioteca oficial (`constructEvent`): comparação em
 * tempo constante e janela de tolerância no relógio, coisas que dá para
 * escrever à mão e não dá para escrever à mão *bem*.
 *
 * Ele responde 200 para o que não entende de propósito. A Stripe reenvia o que
 * não recebe 2xx, e o catálogo dela é grande; responder 500 para um evento que
 * não nos interessa é combinar uma fila de reentrega que nunca vai passar.
 */
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { PLANOS, planoDoPreco, stripe, temStripe } from '@/lib/stripe';
import { rpc, temChaveDeServico } from '@/lib/supabase/servico';

// o corpo precisa chegar cru: qualquer reserialização muda os bytes e invalida
// a assinatura, que é calculada sobre eles
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS_DA_FATURA: Record<string, string> = {
  'invoice.paid': 'paga',
  'invoice.payment_succeeded': 'paga',
  'invoice.payment_failed': 'vencida',
  'invoice.finalized': 'aberta',
  'invoice.created': 'aberta',
  'invoice.voided': 'cancelada',
};

/** O que a assinatura comprou, do jeito que o banco entende. */
async function gravarAssinatura(assinatura: Stripe.Subscription, emailDoEvento?: string | null) {
  const item = assinatura.items.data[0];
  const plano = planoDoPreco(item?.price?.id) ?? 'personal';
  const cfg = PLANOS[plano];
  /* A quantidade da Stripe manda nos assentos: quem comprou 12 lugares no Team
     tem 12, não os 5 do padrão. O padrão só vale quando ela não diz nada. */
  const assentos = item?.quantity && item.quantity > 0 ? item.quantity : cfg.assentos;

  /* De onde vem o e-mail, na ordem: o do evento, o que o checkout carimbou nos
     metadados da assinatura, e só então uma ida à Stripe. As duas primeiras
     resolvem quase sempre — e cada ida à Stripe dentro de um webhook é tempo
     que conta para o limite de resposta dela e uma chance a mais de reentrega. */
  let email = emailDoEvento || assinatura.metadata?.email || null;
  if (!email && typeof assinatura.customer === 'string' && temStripe) {
    const cli = await stripe().customers.retrieve(assinatura.customer);
    if (!('deleted' in cli)) email = cli.email;
  }

  await rpc('walkstamp_assinatura_da_stripe', {
    p_email: (email || '').toLowerCase(),
    p_stripe_cliente: typeof assinatura.customer === 'string' ? assinatura.customer : '',
    p_stripe_assinatura: assinatura.id,
    p_plano: plano,
    p_status: assinatura.status,
    p_assentos: assentos,
    p_dias: cfg.dias,
  });
}

/** Anota que a Stripe entregou este evento, e o que aconteceu com ele.
 *
 *  DEPOIS do trabalho, e nunca antes. Anotar antes e pular o que já foi visto
 *  pareceria idempotência e seria o contrário: se a primeira tentativa gravasse
 *  o evento e falhasse em seguida, a REENTREGA — que é exatamente como a Stripe
 *  conserta uma falha — seria descartada como repetida, e a compra sumiria.
 *
 *  A idempotência de verdade já existe, e no lugar certo: `fatura_stripe_uk` é
 *  único em `stripe_id` e a gravação é `on conflict do update`; a assinatura é
 *  sobrescrita inteira a cada evento. Rodar duas vezes dá o mesmo resultado.
 *  O que faltava era saber que a entrega aconteceu — hoje, quando a compra não
 *  vira plano, não há como distinguir "a Stripe não mandou" de "recebemos e
 *  falhamos".
 *
 *  Ela nunca derruba o webhook: um registro que falha não pode custar a compra.
 */
async function anotar(ev: Stripe.Event, resultado: string) {
  try {
    await rpc('walkstamp_stripe_entregue', {
      p_id: ev.id, p_tipo: ev.type, p_origem: 'next', p_resultado: resultado,
    });
  } catch { /* o registro é diagnóstico, e diagnóstico não pode virar defeito */ }
}

export async function POST(req: Request) {
  const segredo = process.env.STRIPE_WEBHOOK_SECRET;
  if (!segredo || !temStripe) return new NextResponse('sem segredo', { status: 503 });
  if (!temChaveDeServico) return new NextResponse('sem chave de serviço', { status: 503 });

  const corpo = await req.text();
  const assinado = req.headers.get('stripe-signature') || '';

  let ev: Stripe.Event;
  try {
    ev = stripe().webhooks.constructEvent(corpo, assinado, segredo);
  } catch {
    // sem detalhe na resposta: dizer *por que* a assinatura falhou é ajudar
    // quem está tentando forjar uma
    return new NextResponse('assinatura', { status: 401 });
  }

  try {
    if (ev.type === 'checkout.session.completed') {
      const s = ev.data.object as Stripe.Checkout.Session;
      if (s.subscription) {
        const id = typeof s.subscription === 'string' ? s.subscription : s.subscription.id;
        const assinatura = await stripe().subscriptions.retrieve(id);
        await gravarAssinatura(assinatura, s.customer_details?.email || s.customer_email);
      }
    } else if (ev.type.startsWith('customer.subscription.')) {
      const a = ev.data.object as Stripe.Subscription;
      /* `deleted` chega com o status que a assinatura tinha antes de morrer;
         o banco só considera vivo `active` e `trialing`, então o evento é
         reescrito para o que ele de fato significa. */
      if (ev.type === 'customer.subscription.deleted') a.status = 'canceled';
      await gravarAssinatura(a);
    } else if (STATUS_DA_FATURA[ev.type]) {
      const f = ev.data.object as Stripe.Invoice;
      await rpc('walkstamp_fatura_da_stripe', {
        p_stripe_id: String(f.id || ''),
        p_stripe_cliente: typeof f.customer === 'string' ? f.customer : '',
        p_email: String(f.customer_email || ''),
        p_numero: f.number ? String(f.number) : null,
        p_valor: Number(f.amount_due ?? f.total ?? 0),
        p_moeda: String(f.currency || 'brl').toUpperCase(),
        p_status: STATUS_DA_FATURA[ev.type],
        p_vence: f.due_date ? new Date(f.due_date * 1000).toISOString().slice(0, 10) : null,
        p_url: f.hosted_invoice_url || null,
      });
    }
  } catch (e) {
    /* 500 faz a Stripe tentar de novo, que é o que se quer quando o banco
       piscou. Engolir com 200 perderia a compra em silêncio — e a pessoa
       pagou. */
    await anotar(ev, String(e).slice(0, 200));
    return new NextResponse(String(e).slice(0, 200), { status: 500 });
  }

  await anotar(ev, 'ok');
  return new NextResponse('ok', { status: 200 });
}
