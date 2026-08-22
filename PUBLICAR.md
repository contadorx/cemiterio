# Publicar

Uma página só, para não ter que lembrar de nada.

## O que já está pronto

`npx next build` passa limpo, os cinco idiomas geram 80 endereços, e o
`build.py` roda dentro do build da Vercel (está no `buildCommand` do
`vercel.json`) — ou seja, **você não precisa rodar nada antes**.

## Os dois comandos

```bash
npx vercel login          # uma vez, na conta que é dona de walkstamp.com
npx vercel --prod
```

## As seis variáveis de ambiente

Elas moram nas *Project Settings → Environment Variables* da Vercel, e o
`.env.exemplo` lista os nomes:

| variável | de onde vem | o que quebra sem ela |
|---|---|---|
| `SUPABASE_URL` | painel do Supabase | a conta e o roteiro não abrem |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project API keys | idem |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys | a compra não fecha |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → o endpoint de produção | o pagamento entra e a conta não é criada |
| `STRIPE_PRICE_PERSONAL` | Stripe → Products | o botão do plano Personal aponta para o nada |
| `STRIPE_PRICE_TIME` | Stripe → Products | idem, no Team |

E mais uma, que não está no `.env.exemplo` porque não é do produto, é da faxina:

| `CRON_SECRET` | você inventa, e cola nas duas pontas | **sem ela o `/api/faxina` responde 503 e os prazos da política de privacidade nunca rodam** |

O 503 é de propósito: um endereço que apaga dado de cliente ficar público
porque faltou uma variável é o tipo de porta que ninguém percebe estar aberta.
Mas ele significa que, hoje, a promessa de apagar em 90 dias **não está sendo
cumprida** — está escrita e não roda.

## Depois de publicar, confira três coisas

1. `https://walkstamp.com/` — tem que trazer **PT EN ES DE FR** no cabeçalho e a
   faixa de formatos de saída. Hoje ela traz três siglas e nenhuma faixa: a home
   em português está servindo um build velho, enquanto `/en` já está no novo.
   É a razão de publicar agora.
2. `https://walkstamp.com/de/preise` e `/fr/tarifs` — o número grande tem que
   estar em **€**, não em R$.
3. `https://walkstamp.com/ajuda`, `/de/hilfe`, `/fr/aide` — a base de
   conhecimento, com nove temas.

Se a home em português continuar velha depois do deploy, é cache da CDN:
*Deployments → o deploy novo → Redeploy*, com a caixa **"Use existing build
cache" desmarcada**.
