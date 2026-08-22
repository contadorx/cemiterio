# Ligar a cobrança na Stripe, do zero

*Para quem nunca fez. Uma hora, contando o café. Tudo em modo de teste primeiro —
nada cobra ninguém até você virar a chave no fim.*

---

## O mapa, antes de começar

Você vai fazer três coisas, nessa ordem, e elas não se misturam:

1. **Na Stripe** — criar a conta, criar dois produtos com preço, e criar o webhook.
2. **Na Vercel** — colar quatro segredos.
3. **No terminal** — rodar um comando que confere se ficou tudo certo.

A Stripe tem dois mundos separados: **modo de teste** (`sk_test_…`) e **produção**
(`sk_live_…`). Eles têm produtos separados, chaves separadas e webhooks separados. Você faz tudo no
de teste, confere, e só então repete no de produção. **Nada do que você fizer no modo de teste
aparece no de produção** — inclusive os produtos. Isso é a coisa que mais pega quem nunca fez.

---

## 1. A conta

1. `dashboard.stripe.com/register` — e-mail, senha, país **Brasil**.
2. Ela já nasce em **modo de teste**. Tem um seletor no canto superior do painel escrito
   *Test mode* / *Sandbox*. **Deixe ligado.**
3. Você pode fazer tudo que está abaixo sem ativar a conta. A ativação — CNPJ, dados da
   Produtize, conta bancária — só é exigida para receber dinheiro de verdade. Deixe para o passo 8.

---

## 2. Os dois produtos

Menu **Product catalog** → **Add product**. Duas vezes.

**Primeiro: o Personal**

| campo | valor |
|---|---|
| Name | `Walkstamp Personal` |
| Description | `Logotipo e nome do cliente no documento. Uma pessoa.` |
| Pricing model | **Recurring** (recorrente) |
| Amount | `149,00` · moeda `BRL` |
| Billing period | **Yearly** (anual) |

**Segundo: o Team** — igual, mas:

| campo | valor |
|---|---|
| Name | `Walkstamp Team` |
| Amount | `349,00` · moeda `BRL` · **Yearly** |
| Usage is metered | **desmarcado** |

> **O detalhe que decide a fatura do Team.** Ele é cobrado *por pessoa*. Na hora de comprar, o
> Walkstamp manda a quantidade de assentos junto, e a Stripe multiplica. Para isso o preço tem que
> ser **per unit** (é o padrão quando você digita um valor simples — não escolha *tiered* /
> *volume*). Se cair em outro modelo, comprar 12 assentos cobraria por 1, e você só descobriria na
> primeira fatura.

Depois de salvar cada um, clique no preço criado. No painel do preço tem um **ID que começa com
`price_`**. Copie os dois — são o `STRIPE_PRICE_PERSONAL` e o `STRIPE_PRICE_TIME`.

> Não confunda com o `prod_…`, que é o *produto*. O que o código usa é o `price_…`.

---

## 3. A chave secreta

Menu **Developers** → **API keys** → **Secret key** → *Reveal*.

Em modo de teste ela começa com `sk_test_`. É o `STRIPE_SECRET_KEY`.

> Essa chave move dinheiro. Ela nunca vai para o repositório, nunca para um HTML, nunca para o
> WhatsApp. Só para a variável de ambiente da Vercel. Se vazar, você a revoga nessa mesma tela e
> cria outra — e nada mais precisa mudar.

---

## 4. O webhook

É aqui que a Stripe avisa o Walkstamp que alguém pagou. Sem ele, o pagamento acontece e o plano
não liga.

Menu **Webhooks** (dentro do **Workbench**) → **Create an event destination**.

1. **Events from**: *Your account*
2. **Events**: marque exatamente estes seis —
   ```
   checkout.session.completed
   customer.subscription.created
   customer.subscription.updated
   customer.subscription.deleted
   invoice.paid
   invoice.payment_failed
   ```
   Não marque "todos". A Stripe manda dezenas de tipos e o resto é ruído.
3. **Destination type**: *Webhook endpoint*
4. **Endpoint URL**:
   ```
   https://walkstamp.com/api/stripe/webhook
   ```
5. Salve. Na tela do endpoint aparece **Signing secret** → *Click to reveal*. Começa com `whsec_`.
   É o `STRIPE_WEBHOOK_SECRET`.

> **Duas armadilhas.**
>
> A primeira: o *signing secret* é **diferente no modo de teste e no de produção**, mesmo para a
> mesma URL. Quando você virar a chave, tem que trocar esse valor também.
>
> A segunda: a URL precisa ser **HTTPS e pública**. `localhost` não serve — para testar na sua
> máquina existe o passo 7.

---

## 5. Os quatro segredos na Vercel

Painel do projeto → **Settings** → **Environment Variables**. Quatro entradas, marcando
*Production*, *Preview* e *Development* nas quatro:

| nome | valor |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `STRIPE_PRICE_PERSONAL` | `price_…` |
| `STRIPE_PRICE_TIME` | `price_…` |

E mais uma, que não é da Stripe mas é da mesma leva — sem ela a área do cliente não lê nada:

| nome | onde pegar |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → *Project Settings* → *API* → `service_role` |

**Variável nova só vale depois de um novo deploy.** Depois de colar as cinco, vá em *Deployments* e
mande *Redeploy* na última.

---

## 6. Conferir sem adivinhar

No repositório, crie o arquivo `.env.local` (ele está no `.gitignore`, não vai para lugar nenhum):

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_PERSONAL=price_...
STRIPE_PRICE_TIME=price_...
```

E rode:

```bash
npm run stripe:conferir
```

Ele confere, contra a Stripe de verdade: que a chave abre a conta, que os dois preços existem, são
recorrentes e estão ativos, que o Team aceita quantidade, que uma sessão de checkout nasce de
verdade (e a expira em seguida, para não deixar link de pagamento solto no mundo), e que existe um
endpoint de webhook apontando para o lugar certo com os seis eventos assinados.

Ele **recusa rodar com a chave de produção**, de propósito.

---

## 7. O webhook de ponta a ponta

Esse é o único pedaço que nenhum teste automático alcança — e é o que falha calado se estiver
errado. São três comandos.

```bash
# uma vez, para instalar
npm install -g @stripe/cli && stripe login

# terminal 1 — sobe o Walkstamp e escuta
npm run build && npm start
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```

O `listen` imprime uma linha assim:

```
Ready! Your webhook signing secret is 'whsec_abc123...'
```

**Esse `whsec_` é da sessão do `listen`, não é o do painel.** Enquanto você testa localmente, é
ele que tem que estar no `.env.local` como `STRIPE_WEBHOOK_SECRET`. Cole, reinicie o `npm start`, e:

```bash
# terminal 2
stripe trigger customer.subscription.updated
stripe trigger invoice.paid
```

**O que esperar:** `200` nas duas, no terminal do `listen`.

- `401` → o segredo não bate. É o do painel em vez do da sessão do `listen`.
- `503` → não há segredo configurado, ou falta a `SUPABASE_SERVICE_ROLE_KEY`.
- `500` → chegou, a assinatura conferiu, e o banco recusou. Aí é olhar o terminal do `npm start`.

Os três são o webhook funcionando como devia — ele recusa o que não prova ser da Stripe.

---

## 8. Virar a chave

Só depois que o passo 7 der `200`.

1. Desligue o *Test mode* no painel da Stripe.
2. A Stripe pede a **ativação da conta**: CNPJ da Produtize, endereço, dados do responsável,
   e a conta bancária que recebe. Reserve uns 20 minutos e tenha o contrato social por perto.
3. **Refaça os passos 2, 3 e 4 em produção** — os produtos, a chave e o webhook do modo de teste
   **não existem lá**. É a mesma sequência, com os mesmos valores.
4. Troque as quatro variáveis na Vercel pelos valores de produção e mande *Redeploy*.
5. Faça uma compra de verdade, com o seu cartão, do plano Personal. R$ 149 que voltam para você
   descontada a taxa. É a única forma de saber que o caminho inteiro funciona — e vale o preço.

---

## O que a Stripe não faz, e você precisa saber antes

**Ela não emite nota fiscal brasileira.** A Stripe não emite NFS-e, e não vai emitir. O que ela dá
é o *recibo do cartão*, que não substitui a nota. A nota sai depois do pagamento, no Financeirox —
foi por isso que a coluna "Nota" na tela de faturas nasce vazia e só se preenche quando você põe o
endereço dela lá.

**As taxas, em agosto de 2026:**

| | |
|---|---|
| Cartão nacional | 3,99% + R$ 0,39 por transação |
| Cartão internacional | +2% sobre isso |
| Billing (assinaturas) | +0,7% do volume recorrente |

No Personal de R$ 149/ano isso dá algo em torno de **R$ 7,50** por assinatura por ano. Sem
mensalidade, sem taxa de setup, sem taxa de cancelamento.

---

## Se algo der errado

O produto **não quebra** sem nada disso. Enquanto as variáveis não existirem:

- o botão de assinar aparece desligado, com o motivo escrito na tela;
- a degustação de 14 dias continua valendo — ela não passa pela Stripe;
- a ferramenta grava, transcreve e gera documento como sempre.

Ou seja: você pode parar no meio, dormir, e continuar amanhã. Nada fica pela metade de um jeito que
o visitante perceba.

**Sources:** [Preços da Stripe no Brasil](https://stripe.com/br/pricing) ·
[Documentação de webhooks](https://docs.stripe.com/webhooks) ·
[Assinaturas no Stripe Billing](https://docs.stripe.com/billing/subscriptions/build-subscriptions)
