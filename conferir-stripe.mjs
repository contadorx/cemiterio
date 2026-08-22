#!/usr/bin/env node
/* O caminho de rede até a Stripe — o único pedaço da venda que nenhum teste
 * automático alcança.
 *
 * POR QUE ELE EXISTE. A suíte em `/tmp` prova, com um Next de verdade e um
 * Supabase de mentira, que a assinatura do webhook é a fechadura inteira e que
 * cada evento vira a chamada certa ao banco. O que ela NÃO consegue provar é o
 * que só acontece com a Stripe do outro lado: que o preço existe, que o
 * checkout abre, que o webhook chega, e que o segredo configurado é o mesmo que
 * assina o que chega. Um teste que "passasse" sem tocar na Stripe seria pior
 * que teste nenhum — afirmaria segurança que não mediu.
 *
 * COMO USAR. Com as chaves de TESTE da Stripe no ambiente (`sk_test_…`):
 *
 *     node conferir-stripe.mjs
 *
 * Ele confere o que dá para conferir sozinho — chave, preços, e uma sessão de
 * checkout de verdade criada e cancelada. O último passo, o webhook, precisa da
 * CLI da Stripe e está impresso no fim, com o comando exato.
 *
 * NUNCA rode isto com a chave de produção. Ele cria uma sessão de checkout de
 * verdade; em teste isso é lixo descartável, em produção é uma cobrança viva
 * esperando alguém pagar. O script recusa `sk_live_`.
 */
import Stripe from 'stripe';
import fs from 'node:fs';

/* Lê o .env.local como a Vercel leria — sem depender de mais uma biblioteca. */
for (const arq of ['.env.local', '.env']) {
  if (!fs.existsSync(arq)) continue;
  for (const linha of fs.readFileSync(arq, 'utf8').split('\n')) {
    const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };
const parar = (msg) => { console.error('\n' + msg + '\n'); process.exit(2); };

const CHAVE = process.env.STRIPE_SECRET_KEY;
if (!CHAVE) parar('Falta STRIPE_SECRET_KEY. Copie o .env.exemplo para .env.local e preencha.');
if (CHAVE.startsWith('sk_live_')) {
  parar('Essa é a chave de PRODUÇÃO. Este script cria uma sessão de checkout de\n' +
        'verdade — em produção isso é uma cobrança viva. Use a chave de teste.');
}

const stripe = new Stripe(CHAVE);
const SITE = process.env.WS_SITE || 'http://localhost:8802';

console.log('\n[1] a chave abre a conta');
let conta;
try {
  conta = await stripe.accounts.retrieve();
  ok('a Stripe respondeu', true, conta.id);
  ok('e é a conta de teste', !conta.charges_enabled || CHAVE.startsWith('sk_test_'));
} catch (e) {
  ok('a Stripe respondeu', false, String(e.message).slice(0, 140));
  parar('Sem chave válida não há o que conferir depois.');
}

console.log('\n[2] os preços existem e são assinatura recorrente');
const precos = {
  personal: process.env.STRIPE_PRICE_PERSONAL,
  time: process.env.STRIPE_PRICE_TIME,
};
for (const [nome, id] of Object.entries(precos)) {
  if (!id) { ok(`${nome}: configurado`, false, 'variável vazia'); continue; }
  try {
    const p = await stripe.prices.retrieve(id);
    ok(`${nome}: o preço existe`, true, `${(p.unit_amount / 100).toFixed(2)} ${p.currency.toUpperCase()}`);
    ok(`${nome}: é recorrente`, p.type === 'recurring', p.type);
    ok(`${nome}: está ativo`, p.active === true, String(p.active));
    /* O Team é cobrado por pessoa: sem quantidade variável, comprar 12 assentos
       cobraria por 1. É o tipo de erro que só aparece na primeira fatura. */
    if (nome === 'time') {
      ok('time: aceita quantidade (é por pessoa)', p.billing_scheme === 'per_unit', p.billing_scheme);
    }
  } catch (e) {
    ok(`${nome}: o preço existe`, false, String(e.message).slice(0, 120));
  }
}

console.log('\n[3] uma sessão de checkout de verdade abre');
if (precos.personal) {
  try {
    const s = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: precos.personal, quantity: 1 }],
      customer_email: 'conferencia@walkstamp.invalid',
      subscription_data: { metadata: { email: 'conferencia@walkstamp.invalid', plano: 'personal' } },
      metadata: { email: 'conferencia@walkstamp.invalid', plano: 'personal' },
      success_url: `${SITE}/conta?comprou=1`,
      cancel_url: `${SITE}/conta?cancelou=1`,
      locale: 'pt-BR',
    });
    ok('a sessão nasceu com endereço', !!s.url, s.id);
    ok('e leva os metadados que o webhook lê', s.metadata?.email === 'conferencia@walkstamp.invalid');
    // e some: uma sessão viva é um link de pagamento solto no mundo
    await stripe.checkout.sessions.expire(s.id);
    ok('e foi expirada em seguida', true);
  } catch (e) {
    ok('a sessão nasceu com endereço', false, String(e.message).slice(0, 160));
  }
} else {
  ok('a sessão nasceu com endereço', false, 'sem STRIPE_PRICE_PERSONAL não dá para tentar');
}

console.log('\n[4] o webhook — este passo é seu, e é o que falta');
const endpoints = await stripe.webhookEndpoints.list({ limit: 20 }).catch(() => ({ data: [] }));
const nossos = endpoints.data.filter((e) => /\/api\/stripe\/webhook/.test(e.url));
ok('há um endpoint apontando para /api/stripe/webhook', nossos.length >= 1,
   endpoints.data.map((e) => e.url).join(' | ') || 'nenhum');
/* Dois endpoints gravando a mesma fatura é o defeito que a Edge Function
   antiga ainda pode causar se continuar registrada. */
const antigos = endpoints.data.filter((e) => /functions\/v1\/walkstamp-stripe/.test(e.url));
ok('e nenhum endpoint antigo da Edge Function sobrou', antigos.length === 0,
   antigos.map((e) => e.url).join(' | '));

const PRECISA = ['checkout.session.completed', 'customer.subscription.created',
                 'customer.subscription.updated', 'customer.subscription.deleted',
                 'invoice.paid', 'invoice.payment_failed'];
for (const e of nossos) {
  const faltando = PRECISA.filter((t) => !(e.enabled_events || []).includes(t) && !(e.enabled_events || []).includes('*'));
  ok(`${e.url}: assina todos os eventos que importam`, faltando.length === 0, faltando.join(', '));
}

console.log(`
────────────────────────────────────────────────────────────────────────
O que só se confere à mão, e o comando exato:

  1. stripe listen --forward-to ${SITE}/api/stripe/webhook
  2. em outro terminal:
       stripe trigger customer.subscription.updated
       stripe trigger invoice.paid
  3. o \`listen\` imprime um \`whsec_…\` próprio da sessão — é ELE que tem que
     estar em STRIPE_WEBHOOK_SECRET enquanto você testa, não o do painel.

Espere ver 200 nas duas. Um 401 quer dizer que o segredo não bate; um 503,
que ele não está configurado. Os dois são o webhook funcionando como devia.
────────────────────────────────────────────────────────────────────────`);

console.log(falhas ? `${falhas} FALHA(S)` : 'Configuração da Stripe: o que dá para conferir daqui, confere.');
process.exit(falhas ? 1 : 0);
