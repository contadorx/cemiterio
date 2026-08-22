/* A venda: o webhook da Stripe e a área do cliente.
 *
 * ESCOPO, para ninguém ler mais do que está escrito: este teste sobe um Next de
 * verdade, com um Supabase DE MENTIRA do outro lado. Ele prova
 *
 *   - que a assinatura do corpo é a fechadura inteira do webhook, e que sem o
 *     segredo configurado nada passa — nem o que é legítimo;
 *   - que um evento da Stripe vira a chamada certa ao banco, com os argumentos
 *     certos: é aqui que "alguém pagou" vira "o plano dessa pessoa mudou";
 *   - que a área do cliente não exige conta para nada do produto, e diz isso.
 *
 * O que ele NÃO prova: o caminho de rede até a Stripe. Isso se confere uma vez,
 * à mão, com `stripe listen --forward-to <URL>/api/stripe/webhook`.
 */
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import crypto from 'crypto';
import http from 'http';
import fs from 'fs';

import { RAIZ_WS, CHROME_WS } from './_caminhos.mjs';
const SEGREDO = 'whsec_um_segredo_de_teste';
const PORTA_NEXT = 8803;
const PORTA_BANCO = 8804;
const BASE = `http://localhost:${PORTA_NEXT}`;

let falhas = 0;
const ok = (n, c, e) => { console.log((c ? '  ok   ' : '  FALHA') + '  ' + n + (e ? '  → ' + e : '')); if (!c) falhas++; };

/* O Supabase de mentira: anota o que foi chamado e devolve o que a função
   devolveria. Sem ele, o teste só saberia que o webhook respondeu 200. */
const chamadas = [];
const banco = http.createServer((q, r) => {
  let corpo = '';
  q.on('data', (d) => { corpo += d; });
  q.on('end', () => {
    chamadas.push({ funcao: q.url.replace('/rest/v1/rpc/', ''), args: JSON.parse(corpo || '{}'),
                    autorizacao: q.headers.authorization || '' });
    r.writeHead(200, { 'Content-Type': 'application/json' });
    r.end(JSON.stringify({ ok: true }));
  });
});
await new Promise((r) => banco.listen(PORTA_BANCO, r));

const next = spawn('npx', ['next', 'start', '-p', String(PORTA_NEXT)], {
  cwd: `${RAIZ_WS}`,
  env: { ...process.env,
    STRIPE_SECRET_KEY: 'sk_test_de_mentira',
    STRIPE_WEBHOOK_SECRET: SEGREDO,
    STRIPE_PRICE_PERSONAL: 'price_personal_teste',
    STRIPE_PRICE_TIME: 'price_time_teste',
    SUPABASE_URL: `http://localhost:${PORTA_BANCO}`,
    SUPABASE_SERVICE_ROLE_KEY: 'chave_de_servico_de_mentira' },
  stdio: 'ignore',
});
const fim = () => { try { next.kill(); } catch {} banco.close(); };
process.on('exit', fim);

for (let i = 0; i < 40; i++) {
  try { await fetch(BASE + '/precos'); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
}

const assinar = (corpo, segredo, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=` + crypto.createHmac('sha256', segredo).update(`${t}.${corpo}`).digest('hex');

const mandar = (corpo, cabecalho) =>
  fetch(BASE + '/api/stripe/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': cabecalho },
    body: corpo,
  });

/* ------------------------------------------------------- a fechadura */
console.log('[1] o que não é da Stripe não entra');
{
  const corpo = JSON.stringify({ type: 'invoice.paid', data: { object: { id: 'in_1', amount_due: 14900 } } });
  ok('sem cabeçalho nenhum', (await mandar(corpo, '')).status === 401);
  ok('cabeçalho sem v1', (await mandar(corpo, 't=1')).status === 401);
  ok('assinatura de zeros', (await mandar(corpo, `t=${Math.floor(Date.now()/1000)},v1=${'0'.repeat(64)}`)).status === 401);
  ok('assinada com outro segredo', (await mandar(corpo, assinar(corpo, 'whsec_outro'))).status === 401);
  /* O ataque que importa: assinatura válida, corpo trocado depois. É por aqui
     que alguém marcaria a própria fatura como paga. */
  const sig = assinar(corpo, SEGREDO);
  ok('corpo adulterado depois de assinado',
     (await mandar(corpo.replace('14900', '1'), sig)).status === 401);
  /* E o relógio: uma assinatura velha, capturada, não vale para sempre. */
  ok('assinatura de ontem', (await mandar(corpo, assinar(corpo, SEGREDO, Math.floor(Date.now()/1000) - 86400))).status === 401);
  ok('nada disso encostou no banco', chamadas.length === 0, JSON.stringify(chamadas).slice(0, 120));
}

/* ------------------------------------------------- pagar vira plano */
console.log('\n[2] uma assinatura da Stripe vira um plano');
{
  chamadas.length = 0;
  const ev = {
    type: 'customer.subscription.updated',
    data: { object: {
      id: 'sub_123', customer: 'cus_123', status: 'active',
      metadata: { email: 'Maria@Empresa.COM', plano: 'personal' },
      items: { data: [{ quantity: 1, price: { id: 'price_personal_teste' } }] },
    } },
  };
  const corpo = JSON.stringify(ev);
  const r = await mandar(corpo, assinar(corpo, SEGREDO));
  ok('a Stripe recebe 200', r.status === 200, String(r.status));
  const c = chamadas.find((x) => x.funcao === 'walkstamp_assinatura_da_stripe');
  ok('o banco foi chamado', !!c, JSON.stringify(chamadas).slice(0, 200));
  if (c) {
    ok('com o e-mail em minúsculas', c.args.p_email === 'maria@empresa.com', c.args.p_email);
    ok('com o plano que o preço identifica', c.args.p_plano === 'personal', c.args.p_plano);
    ok('com o customer e a assinatura', c.args.p_stripe_cliente === 'cus_123' && c.args.p_stripe_assinatura === 'sub_123');
    ok('com o status vindo da Stripe, não inventado', c.args.p_status === 'active', c.args.p_status);
    ok('e pela chave de serviço, não pela anônima',
       c.autorizacao.includes('chave_de_servico_de_mentira'), c.autorizacao.slice(0, 30));
  }
}

console.log('\n[3] cancelar tira o plano, não o deixa "ativo para sempre"');
{
  chamadas.length = 0;
  /* A Stripe manda `deleted` com o status que a assinatura tinha ANTES de
     morrer — costuma vir 'active'. Quem repassasse isso deixaria o plano vivo
     depois do cancelamento. */
  const ev = { type: 'customer.subscription.deleted', data: { object: {
    id: 'sub_123', customer: 'cus_123', status: 'active',
    metadata: { email: 'maria@empresa.com' },
    items: { data: [{ quantity: 1, price: { id: 'price_personal_teste' } }] } } } };
  const corpo = JSON.stringify(ev);
  await mandar(corpo, assinar(corpo, SEGREDO));
  const c = chamadas.find((x) => x.funcao === 'walkstamp_assinatura_da_stripe');
  ok('o cancelamento chega como cancelamento', c && c.args.p_status === 'canceled', c && c.args.p_status);
}

console.log('\n[4] o Team compra os assentos que pediu');
{
  chamadas.length = 0;
  const ev = { type: 'customer.subscription.updated', data: { object: {
    id: 'sub_9', customer: 'cus_9', status: 'trialing',
    metadata: { email: 'ti@empresa.com' },
    items: { data: [{ quantity: 12, price: { id: 'price_time_teste' } }] } } } };
  const corpo = JSON.stringify(ev);
  await mandar(corpo, assinar(corpo, SEGREDO));
  const c = chamadas.find((x) => x.funcao === 'walkstamp_assinatura_da_stripe');
  ok('doze assentos, não os cinco do padrão', c && c.args.p_assentos === 12, c && String(c.args.p_assentos));
  ok('e a degustação já vale como plano vivo', c && c.args.p_status === 'trialing', c && c.args.p_status);
}

console.log('\n[5] a fatura vira linha de fatura');
{
  chamadas.length = 0;
  const ev = { type: 'invoice.paid', data: { object: {
    id: 'in_7', customer: 'cus_123', customer_email: 'maria@empresa.com',
    number: 'A-0007', amount_due: 14900, currency: 'brl',
    hosted_invoice_url: 'https://pay.stripe.com/x' } } };
  const corpo = JSON.stringify(ev);
  await mandar(corpo, assinar(corpo, SEGREDO));
  const c = chamadas.find((x) => x.funcao === 'walkstamp_fatura_da_stripe');
  ok('a fatura chegou ao banco', !!c);
  if (c) {
    ok('paga', c.args.p_status === 'paga', c.args.p_status);
    ok('com o valor em centavos', c.args.p_valor === 14900, String(c.args.p_valor));
    ok('e a moeda em maiúsculas', c.args.p_moeda === 'BRL', c.args.p_moeda);
  }
}

console.log('\n[6] o que a Stripe manda e não nos interessa não vira nada');
{
  chamadas.length = 0;
  const ev = { type: 'customer.discount.created', data: { object: { id: 'di_1' } } };
  const corpo = JSON.stringify(ev);
  const r = await mandar(corpo, assinar(corpo, SEGREDO));
  /* 200 de propósito: a Stripe reenvia o que não recebe 2xx, e recusar o que
     não interessa é combinar uma fila de reentrega que nunca vai passar. */
  ok('responde 200 e ignora', r.status === 200, String(r.status));
  ok('sem tocar no banco', chamadas.length === 0, JSON.stringify(chamadas).slice(0, 120));
}

/* --------------------------------------------------- a área do cliente */
console.log('\n[7] a conta é oferecida, nunca exigida');
const br = await chromium.launch({ executablePath: CHROME_WS });
{
  const pg = await (await br.newContext()).newPage();
  const erros = []; pg.on('pageerror', (e) => erros.push(e.message));
  const r = await pg.goto(BASE + '/conta');
  ok('/conta responde 200', r.status() === 200, String(r.status()));
  const txt = await pg.locator('body').innerText();
  ok('pede o e-mail e mais nada', (await pg.locator('input[type=email]').count()) === 1);
  ok('não pede senha', (await pg.locator('input[type=password]').count()) === 0);
  ok('diz que a conta é opcional', /A conta é opcional/.test(txt), txt.slice(0, 80));
  /* O link da ferramenta leva o idioma junto — quem escolheu ler em espanhol
     não deveria abrir o app em inglês por causa do sistema operacional. */
  ok('e leva para a ferramenta sem entrar', (await pg.locator('a[href^="/app"]').count()) >= 1,
     JSON.stringify(await pg.locator('a[href^="/app"]').evaluateAll(a => a.map(x => x.getAttribute('href')))));
  ok('fica fora do índice de busca',
     (await pg.locator('meta[name=robots]').getAttribute('content') || '').includes('noindex'));
  ok('sem erro de JS', erros.length === 0, erros.join(' | ').slice(0, 160));

  console.log('\n[8] e-mail que não é e-mail volta com recado, não com erro');
  await pg.fill('input[type=email]', 'nao-e-um-email@');
  /* o `type=email` do navegador já barra: o teste tira a validação do caminho
     de propósito, porque a checagem que importa é a do servidor */
  await pg.evaluate(() => document.querySelector('form').setAttribute('novalidate', ''));
  await pg.locator('button[type=submit]').click();
  await pg.waitForTimeout(1200);
  ok('recado legível na tela', /não parece um e-mail/.test(await pg.locator('body').innerText()),
     (await pg.locator('body').innerText()).slice(0, 120));

  console.log('\n[9] link mágico sem código não vira tela branca');
  const r2 = await pg.goto(BASE + '/conta/confirmar');
  ok('volta para a conta', r2.url().includes('/conta'), r2.url());
  ok('explicando o que houve', /veio sem o código|já foi usado/.test(await pg.locator('body').innerText()));

  /* O link volta de UMA de duas formas, e a diferença depende de como o modelo
     de e-mail do Supabase foi escrito: `?token_hash=` quando ele usa
     `{{ .TokenHash }}`, e `?code=` quando usa `{{ .ConfirmationURL }}` — que é
     o PADRÃO. A rota só entendia a primeira, e com o modelo padrão devolvia a
     pessoa para a tela de pedir o e-mail. Parecia "o link não faz nada".

     As duas formas não podem cair no "veio sem código": um token inválido é
     outro erro, e é o que prova que a rota LEU o parâmetro. */
  for (const [par, nome] of [['token_hash=xxx&type=magiclink', 'token_hash'], ['code=xxx', 'code']]) {
    const r3 = await pg.goto(BASE + '/conta/confirmar?' + par);
    const txt = await pg.locator('body').innerText();
    ok(`a rota entende ?${nome}`, !/veio sem o código/.test(txt),
       txt.replace(/\s+/g, ' ').slice(0, 80));
    ok(`  e volta para a conta`, r3.url().includes('/conta'), r3.url());
  }
}

console.log('\n[10] a conta existe nos três idiomas');
{
  const esperado = {
    '/conta':      { lang: 'pt-BR', h1: 'Sua conta',  opcional: 'A conta é opcional' },
    '/en/account': { lang: 'en',    h1: 'Your account', opcional: 'The account is optional' },
    '/es/cuenta':  { lang: 'es',    h1: 'Tu cuenta',  opcional: 'La cuenta es opcional' },
  };
  for (const [rota, e] of Object.entries(esperado)) {
    const pg = await (await br.newContext()).newPage();
    const erros = []; pg.on('pageerror', (x) => erros.push(x.message));
    const r = await pg.goto(BASE + rota);
    ok(`${rota} responde 200`, r.status() === 200, String(r.status()));
    ok(`${rota} declara o idioma certo`,
       (await pg.locator('html').getAttribute('lang')) === e.lang,
       await pg.locator('html').getAttribute('lang'));
    ok(`${rota} está escrita no idioma certo`,
       (await pg.locator('h1').innerText()) === e.h1, await pg.locator('h1').innerText());
    ok(`${rota} diz que a conta é opcional`, (await pg.locator('body').innerText()).includes(e.opcional));
    /* A frase montada a partir do dicionário não pode deixar buraco: um
       `{email}` ou um `undefined` na tela é o defeito clássico de i18n. */
    const txt = await pg.locator('body').innerText();
    ok(`${rota} sem chave de tradução faltando`, !/undefined|\{\w+\}/.test(txt),
       (txt.match(/undefined|\{\w+\}/) || [''])[0]);
    ok(`${rota} não pede senha`, (await pg.locator('input[type=password]').count()) === 0);
    ok(`${rota} tem as três siglas`, (await pg.locator('header nav a[href="/es/cuenta"]').count()) === 1);
    ok(`${rota} sem erro de JS`, erros.length === 0, erros.join(' | ').slice(0, 140));
    await pg.context().close();
  }
}

console.log('\n[11] o endereço interno não é um segundo endereço público');
{
  const pg = await (await br.newContext()).newPage();
  for (const [interno, publico] of [['/conta/pt', '/conta'], ['/conta/en', '/en/account'], ['/conta/es', '/es/cuenta']]) {
    /* Duas URLs para a mesma página é o buscador dividindo a força dela entre
       as duas — e um link publicado que amanhã pode não existir. */
    await pg.goto(BASE + interno);
    ok(`${interno} manda para ${publico}`, new URL(pg.url()).pathname === publico, pg.url());
  }
  const r = await pg.goto(BASE + '/conta/zz');
  ok('idioma que não existe dá 404, não uma tela vazia', r.status() === 404, String(r.status()));
  await pg.context().close();
}

console.log('\n[12] o dicionário da conta não tem buraco');
{
  const d = JSON.parse(fs.readFileSync(`${RAIZ_WS}/src/i18n-conta.json`, 'utf8'));
  const base = Object.keys(d.pt);
  for (const L of ['en', 'es']) {
    const faltam = base.filter((k) => !(k in d[L]));
    const sobram = Object.keys(d[L]).filter((k) => !base.includes(k));
    ok(`${L}: mesmas chaves do português`, faltam.length === 0 && sobram.length === 0,
       [...faltam.map((k) => '-' + k), ...sobram.map((k) => '+' + k)].join(' '));
    /* Só as frases LONGAS. Português e espanhol compartilham palavra à beça —
       "Bloquear", "Número", "Liberar" e "administra" são iguais nos dois de
       verdade, e acusá-las seria ensinar a suíte a mentir. Já uma frase de
       vinte e cinco caracteres idêntica nos dois é copiar e esquecer. */
    const iguais = base.filter((k) => d[L][k] === d.pt[k] && d.pt[k].length > 25);
    ok(`${L}: nenhuma frase longa ficou em português por engano`,
       iguais.length === 0, iguais.join(', '));
  }
}

await br.close();
fim();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nVenda e área do cliente: tudo passou.');
process.exit(falhas ? 1 : 0);
