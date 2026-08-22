# Ligar o Walkstamp no ar — Vercel, HostGator e Stripe

Três coisas, e elas **não se misturam**:

| | onde | para quê |
|---|---|---|
| **Variáveis** | Vercel | é o que liga cada função do produto |
| **E-mail** | HostGator (caixas) + Brevo (disparo) | são coisas diferentes — a seção 2 explica por quê |
| **Cobrança** | Stripe | é o que faz o botão de assinar funcionar |

**Nada quebra enquanto não estiver configurado.** Cada peça que falta desliga a
sua própria função, com o motivo escrito na tela, e o resto continua de pé: a
ferramenta grava, transcreve e gera documento sem nenhuma das três. Você pode
parar no meio de qualquer seção e voltar amanhã.

---

# 1. As variáveis na Vercel

**Project → Settings → Environment Variables.** Marque *Production*, *Preview* e
*Development* em todas.

> **Variável nova só vale depois de um deploy novo.** Depois de colar tudo, vá em
> *Deployments* → *Redeploy* na última. Colar e não redeployar é o erro que faz
> parecer que a variável "não funcionou".

## A conta do cliente — sem isto a `/conta` não lê nada

| variável | onde pegar | sem ela |
|---|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → *Project URL* | a conta mostra "sem chave" e explica |
| `SUPABASE_SERVICE_ROLE_KEY` | mesma tela → `service_role` | idem |

> Por que a chave de serviço e não a publicável: as funções da conta recebem um
> e-mail e devolvem faturas e chamados **daquele** e-mail. Se o navegador pudesse
> chamá-las, bastaria trocar o e-mail para ler a conta alheia. Quem decide de
> quem é o e-mail é o servidor, a partir da sessão.
>
> Ela lê e escreve tudo. Nunca vai para o repositório, para um HTML ou para o
> WhatsApp.

## O seu back-office

| variável | valor | sem ela |
|---|---|---|
| `WALKSTAMP_DONO` | o seu e-mail, o mesmo com que você entra na conta | **a aba `Negócio` não existe para ninguém**, inclusive para você |

É o padrão certo: uma aba de administração que aparece por engano é pior que uma
que falta. Detalhes em `NEGOCIO.md`.

## A cobrança

| variável | formato | sem ela |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` / `sk_live_…` | botão de assinar desligado, com o motivo na tela |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | **o pagamento acontece e o plano não liga** |
| `STRIPE_PRICE_PERSONAL` | `price_…` | o plano Personal some do checkout |
| `STRIPE_PRICE_TIME` | `price_…` | o plano Time some do checkout |

A degustação de 14 dias **não passa pela Stripe** e continua valendo sem nada
disso. A seção 3 é o passo a passo.

## O convite por e-mail

| variável | o que é | sem ela |
|---|---|---|
| `BREVO_API_KEY` | a chave do Brevo | 503 → o app volta ao `mailto:` e diz por quê |
| `EMAIL_DE` | o remetente, ex.: `ola@walkstamp.com` | 503 |
| `EMAIL_DE_NOME` | o nome que aparece | usa "Walkstamp" |
| `CONVITE_SAL` | um texto longo e aleatório | usa o `CRON_SECRET`; sem nenhum dos dois, 503 |

> **O sal não pode mudar depois de entrar em produção.** Trocar o sal reescreve
> todos os hashes e as contagens do último dia se perdem. Não é grave; é bom
> saber por que os limites "zeraram sozinhos".

Para gerar o sal:

```bash
openssl rand -base64 48
```

## A faxina automática

| variável | o que é | sem ela |
|---|---|---|
| `CRON_SECRET` | um segredo longo e aleatório | `/api/faxina` responde 503 e **nada é apagado** |

A Vercel chama `/api/faxina` todo dia às 04:17 UTC (está no `vercel.json`). Esse
endereço **apaga dado de cliente** — por isso exige o segredo. Sem ele, a
retenção de 90 dias que a política de privacidade promete não acontece: é uma
promessa escrita sem código atrás.

## A que você NÃO põe

| variável | por quê |
|---|---|
| `WALKSTAMP_SUPA_TESTE` | é o desvio da sessão para os testes. Ela **só aceita endereço local** — em produção, no máximo aponta para o próprio processo e quebra à vista. Não coloque na Vercel. |

## Conferir de fora, sem adivinhar

```bash
# 503 = falta variável (é o esperado antes de configurar)
curl -i -X POST https://walkstamp.com/api/convite \
  -H 'content-type: application/json' -H 'origin: https://walkstamp.com' \
  -d '{"para":"voce@exemplo.com","lang":"pt"}'

# 401 = o CRON_SECRET está lá e recusou; 503 = não está
curl -i https://walkstamp.com/api/faxina
```

---

# 2. O e-mail — HostGator e Brevo fazem coisas diferentes

Esta é a parte onde mais gente se enrola, porque parecem a mesma coisa e não são:

| | quem usa | o quê |
|---|---|---|
| **HostGator** | **pessoas** | as caixas `privacidade@`, `contato@`. Alguém abre e responde. |
| **Brevo** | **o produto** | o convite que o app dispara sozinho, sem ninguém no meio. |

**Não use a HostGator para o disparo do produto.** Não é preciosismo: a política
dela proíbe envio em massa em hospedagem compartilhada, o limite não é publicado
(é dinâmico, conforme a reputação do domínio) e a punição prevista é **suspensão
ou encerramento da conta** — a mesma conta que hospeda o seu e-mail. Trocar um
disparo automático por um risco desses não fecha a conta.

O Brevo, no plano grátis, dá **3.000 mensagens por mês, 100 por dia, 1 domínio**.
O convite do Walkstamp é limitado a 5 por hora por origem e 2 por dia por destino —
não chega perto do teto.

## 2.1 As caixas na HostGator

No cPanel: **Contas de E-mail → Criar**.

| endereço | para quê |
|---|---|
| `privacidade@walkstamp.com` | **obrigatório.** É o canal de titular de dados citado na sua política, com prazo legal de 15 dias (art. 19 da LGPD) |
| `contato@walkstamp.com` | recomendado. `privacidade@` assusta quem só quer relatar um defeito |
| `ola@walkstamp.com` | se você usar esse remetente no `CONVITE_DE`, ele precisa **receber** — quem responder ao convite escreve para lá |

> Não quer mais uma caixa para olhar? Crie um **encaminhador** (*Forwarders*) para
> o seu e-mail de sempre. Funciona igual e você não esquece de checar.

**Teste recebendo de fora antes de publicar.** Mande do seu telefone e confirme
que chegou. Canal de titular que não responde é pior que canal nenhum: o prazo
corre igual e a omissão fica documentada na sua própria página de privacidade.

## 2.2 O DNS — a armadilha que derruba todo mundo

> ⚠️ **Se você mover os nameservers para a Vercel sem recriar os MX, o e-mail do
> domínio para na hora.** A Vercel não herda nada do provedor anterior.

O caminho de menos coisa para dar errado — e o que assumo aqui — é **deixar o DNS
na HostGator** e criar lá dois registros apontando para a Vercel:

| Tipo | Nome | Valor |
|---|---|---|
| `A` | `@` | `76.76.21.21` |
| `CNAME` | `www` | o valor que a Vercel mostrar (é único do seu projeto) |

Assim o e-mail nem toma conhecimento da mudança. O passo a passo completo, com
os domínios `.app` e `.com.br` redirecionando, está em `DOMINIO-E-EMAIL.md`.

## 2.3 O Brevo, e o registro que quase todo mundo erra

1. Brevo → **Domains** → adicione `walkstamp.com`;
2. ele dá três registros — cole na **zona de DNS da HostGator**;
3. espere verificar (minutos, às vezes horas).

Enquanto o domínio não verifica, o Brevo só entrega para o e-mail da própria
conta. Útil para testar, inútil em produção.

> ### ⚠️ O SPF: um registro, não dois
>
> A HostGator já criou um SPF quando você criou a primeira caixa, mais ou menos
> assim:
>
> ```
> v=spf1 +a +mx +ip4:SEU.IP ~all
> ```
>
> O Brevo vai pedir para incluir o dele. **Não crie um segundo registro TXT de
> SPF.** Dois SPF no mesmo nome é erro permanente pela especificação: o servidor
> que recebe não escolhe um — ele descarta os dois, e a sua autenticação some.
> **Junte num só:**
>
> ```
> v=spf1 +a +mx +ip4:SEU.IP include:amazonses.com ~all
> ```
>
> (use o `include:` exato que o Brevo mostrar na tela dele, não este).
>
> **DKIM não tem esse problema:** a HostGator usa o seletor `default._domainkey` e
> o Brevo usa o dele. São nomes diferentes, convivem.
>
> **E o MX que o Brevo pede não conflita:** ele é de um subdomínio
> (`send.walkstamp.com`), para o retorno de mensagem devolvida. O MX do apex
> continua sendo o da HostGator, que é quem entrega na sua caixa.

## 2.4 O SQL do convite

Ainda falta rodar, no Supabase → SQL Editor: a tabela `convite_envio` e a função
`walkstamp_convite_pode`. Está inteiro em `CONVITE-POR-EMAIL.md`, pronto para
colar — inclusive as duas linhas de `revoke`/`grant` que impedem o navegador de
zerar o limite chamando a função com hashes inventados.

---

# 3. A Stripe

O passo a passo detalhado está em `STRIPE-PASSO-A-PASSO.md`. Aqui está o que
decide, e o que costuma dar errado.

## A coisa que mais pega quem nunca fez

A Stripe tem **dois mundos separados**: teste (`sk_test_…`) e produção
(`sk_live_…`). Produtos separados, chaves separadas, webhooks separados. **Nada
do que você criar no modo de teste existe em produção** — inclusive os produtos.
Você faz tudo no de teste, confere, e **refaz** em produção.

## O que criar

**Dois produtos**, em *Product catalog → Add product*:

| | Personal | Team |
|---|---|---|
| Preço | R$ 149,00 / ano | R$ 349,00 / ano |
| Modelo | Recurring, Yearly | Recurring, Yearly |
| Moeda | BRL | BRL |

> **O detalhe que decide a fatura do Team:** ele é cobrado **por pessoa**. O
> Walkstamp manda a quantidade de assentos junto e a Stripe multiplica — para
> isso o preço tem que ser **per unit** (é o padrão quando você digita um valor
> simples). Se cair em *tiered* ou *volume*, comprar 12 assentos cobraria por 1,
> e você só descobre na primeira fatura.

Copie o **`price_…`** de cada um (não o `prod_…` — o código usa o `price_`).

**Um webhook**, em *Workbench → Webhooks → Create an event destination*:

- URL: `https://walkstamp.com/api/stripe/webhook`
- seis eventos, e só estes:
  ```
  checkout.session.completed
  customer.subscription.created
  customer.subscription.updated
  customer.subscription.deleted
  invoice.paid
  invoice.payment_failed
  ```

> O *signing secret* (`whsec_…`) é **diferente entre teste e produção**, mesmo
> para a mesma URL. Ao virar a chave, troque também esse valor.
>
> E registre **um endpoint só**: a Edge Function `walkstamp-stripe` fazia esse
> trabalho antes e continua no repositório. Se ela também estiver registrada, os
> dois gravam a mesma fatura.

## Conferir antes de confiar

```bash
# no .env.local, com as chaves de TESTE
npm run stripe:conferir
```

Ele confere contra a Stripe de verdade: a chave abre a conta, os dois preços
existem e são recorrentes, o Team aceita quantidade, uma sessão de checkout nasce
(e é expirada em seguida, para não deixar link de pagamento solto), e o webhook
aponta para o lugar certo com os seis eventos. **Ele recusa rodar com a chave de
produção**, de propósito.

O webhook de ponta a ponta é o único pedaço que nenhum teste alcança — e o que
falha calado. O `stripe listen` está no passo 7 do `STRIPE-PASSO-A-PASSO.md`.

## As contas — agosto de 2026

| | |
|---|---|
| Cartão nacional | **3,99% + R$ 0,39** por transação |
| Cartão internacional | **+2%** |
| Stripe Billing (assinaturas) | **+0,7%** do volume recorrente |

No Personal de R$ 149/ano, algo em torno de **R$ 7,50** por assinatura por ano.
Sem mensalidade, sem taxa de setup, sem taxa de cancelamento.

## O que a Stripe não faz

**Ela não emite nota fiscal brasileira.** Não emite NFS-e e não vai emitir. O que
ela dá é o recibo do cartão, que não substitui a nota. Foi por isso que a coluna
"Nota" na tela de faturas nasce vazia e só se preenche quando você põe o endereço
da nota lá.

---

# 4. A ordem que eu seguiria

| | o quê | onde | dá para adiar? |
|---|---|---|---|
| 1 | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Vercel | não — sem elas a conta não abre |
| 2 | `WALKSTAMP_DONO` | Vercel | não — é uma linha e liga o seu back-office |
| 3 | `CRON_SECRET` | Vercel | **não** — sem ele a retenção prometida não acontece |
| 4 | `privacidade@` e `contato@` | cPanel HostGator | não — tem prazo legal |
| 5 | **testar o e-mail recebendo de fora** | seu telefone | não |
| 6 | Brevo: domínio + SPF junto num registro só | Brevo + DNS HostGator | sim |
| 7 | SQL do convite | Supabase | sim |
| 8 | `RESEND_API_KEY`, `CONVITE_SAL`, `CONVITE_DE` | Vercel | sim |
| 9 | Stripe em modo de teste, ponta a ponta | Stripe + Vercel | sim |
| 10 | Stripe em produção + uma compra de verdade | Stripe | sim |
| 11 | **Redeploy** | Vercel | — |

Os passos 3, 4 e 5 são os que eu não pularia. O resto, se der errado, você
percebe e conserta. E-mail que não chega e faxina que não roda você **não**
percebe — e os dois são justamente os que têm prazo legal atrás.

---

## Fontes

- [Preços da Stripe no Brasil](https://stripe.com/br/pricing) · [Webhooks](https://docs.stripe.com/webhooks)
- [Regras de envio de e-mail da HostGator](https://suporte.hostgator.com.br/hc/pt-br/articles/30822248903827-Quais-s%C3%A3o-as-regras-para-envio-de-e-mails) · [Política de e-mails](https://www.hostgator.com.br/politica-de-emails)
- [Preços do Brevo](https://resend.com/pricing)
- [A Vercel não oferece serviço de e-mail](https://vercel.com/kb/guide/using-email-with-your-vercel-domain) · [Por que o e-mail parou](https://vercel.com/support/articles/why-has-email-stopped-working)
- SPF: um registro por domínio — [RFC 7208 §3.2](https://www.rfc-editor.org/rfc/rfc7208#section-3.2)
