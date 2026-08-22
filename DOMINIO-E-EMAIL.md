# Domínios e e-mail — o passo a passo

Escrito em 14/08/2026, para a virada de `clipcontext.app` para `walkstamp.com`.
Telas de painel mudam; se algo estiver com outro nome, a lógica continua a mesma.

---

## A resposta curta sobre SMTP

**A Vercel não tem serviço de e-mail.** A documentação diz com todas as letras: *"Vercel is a platform
focused on deployments, it does not provide a mail service."* Não há caixa postal, não há SMTP de envio,
não há encaminhamento.

O que a Vercel tem é **DNS**. Ou seja: ela hospeda os registros que apontam o seu e-mail para outro
lugar. **Aponte para a HostGator, como você já pensou** — você já paga por ela e já tem caixa postal lá.

E aqui está a armadilha que derruba mais gente nessa migração, e por isso vem antes de tudo:

> ⚠️ **Se você mover os nameservers do domínio para a Vercel sem copiar os registros de MX, o e-mail
> daquele domínio para de funcionar na hora.** A Vercel não herda nada do provedor anterior. A própria
> Vercel tem um artigo de suporte só sobre isso, porque acontece o tempo todo.

Duas formas de não cair nela — escolha **uma**:

| | como | quando escolher |
|---|---|---|
| **A. DNS fica na HostGator** | você só cria dois registros lá apontando para a Vercel | **é o que eu faria.** O e-mail nem toma conhecimento da mudança |
| **B. DNS vai para a Vercel** | você troca os nameservers e **recria os MX à mão** na Vercel | só se quiser gerenciar tudo num lugar |

O resto deste documento assume o caminho **A**, que é o de menos coisa para dar errado.

---

## Parte 1 — Colocar o `walkstamp.com` no ar

### 1. Adicionar o domínio no projeto

No painel da Vercel: **seu projeto → Settings → Domains → Add Domain**. Digite `walkstamp.com`.

A Vercel vai sugerir adicionar também o `www.walkstamp.com`. **Aceite.** Ter os dois garante que a
pessoa chega ao site digitando de qualquer jeito.

### 2. Criar os registros na HostGator

No painel da HostGator, na zona de DNS do `walkstamp.com`:

| Tipo | Nome | Valor |
|---|---|---|
| `A` | `@` (ou vazio, ou `walkstamp.com`) | `76.76.21.21` |
| `CNAME` | `www` | o valor que a Vercel mostrar na tela |

O `A` do apex é sempre `76.76.21.21`. **O CNAME do `www` é único do seu projeto** — algo como
`d1d4fc829fe7bc7c.vercel-dns-017.com`. Copie da tela da Vercel, não daqui.

Se a HostGator já tiver um `A` de `@` apontando para a hospedagem antiga, **edite em vez de criar outro**
— dois registros `A` no apex fazem o tráfego alternar entre os dois servidores, e o sintoma é "às vezes
abre, às vezes não", que é horrível de diagnosticar.

### 3. Esperar

A Vercel verifica sozinha e emite o certificado. Costuma levar minutos; DNS pode demorar mais conforme o
TTL antigo. Enquanto não verifica, a tela mostra o que ainda falta.

### 4. Escolher qual é o principal

Ainda em **Settings → Domains**, o domínio que estiver marcado como **Production** é o oficial. Deixe
`walkstamp.com`.

> Nota da própria Vercel: eles **recomendam usar o `www` como principal**, com o apex redirecionando
> para ele — dá mais controle de tráfego à rede deles, porque `www` usa CNAME e o apex é obrigado a usar
> `A` com IP fixo. Na prática, para o seu volume, os dois funcionam. Se seguir a recomendação, troque
> `SITE` no `build.py` para `https://www.walkstamp.com`, senão o canonical vai apontar para o lugar que
> redireciona — e isso confunde buscador.

---

## Parte 2 — Redirecionar `.app` e `.com.br` para o `.com`

Esta é a parte que quase ninguém acha, porque **o campo de redirecionamento só aparece depois que há mais
de um domínio no projeto.**

Para cada um dos dois:

1. **Settings → Domains → Add Domain** → `walkstamp.app` (depois repita para `walkstamp.com.br`).
2. Configure o DNS de cada um no registrador onde ele está, com os **mesmos dois registros** da tabela
   acima — sim, mesmo sendo só para redirecionar: o domínio precisa chegar na Vercel para que ela possa
   redirecioná-lo.
3. Quando ele verificar, clique em **Edit** no domínio e use o campo **Redirect to** → escolha
   `walkstamp.com`.

O redirecionamento **preserva o caminho**: quem tinha `walkstamp.app/precos` cai em
`walkstamp.com/precos`. É `308` (permanente), que é o que o buscador precisa para transferir a
reputação de um endereço para o outro.

### E o `clipcontext.app`?

**Não deixe morrer.** Faça o mesmo com ele: adicione ao projeto e redirecione para `walkstamp.com`.
Custa nada e resolve dois problemas — quem tem o link antigo continua chegando, e os PDFs que você já
gerou com o rodapé antigo continuam levando a algum lugar.

Mantenha por pelo menos um ano. Renovar um domínio é barato; link quebrado num documento que já está na
mão de alguém não tem conserto.

---

## Parte 3 — O e-mail `privacidade@walkstamp.com`

Este endereço agora é o **único canal do produto inteiro**: pedido de titular de dados (com prazo legal
de 15 dias), relato de defeito, e a lista de aviso. Ele precisa receber de verdade.

### Caminho A — HostGator (é o que eu faria)

1. No cPanel da HostGator: **Contas de E-mail → Criar**, e crie `privacidade@walkstamp.com`.
   - Se preferir não ter mais uma caixa para olhar, crie um **encaminhador** (*Forwarders*) para o seu
     e-mail de sempre. Funciona igual e você não esquece de checar.
2. Como o DNS ficou na HostGator (caminho A da introdução), **os registros de MX já estão certos** —
   ela cria sozinha ao criar a conta. Não precisa fazer nada na Vercel.
3. **Teste antes de publicar:** mande um e-mail de fora para o endereço e confirme que chegou. Um canal
   de titular que não responde é pior que canal nenhum — o prazo do art. 19 da LGPD corre igual, e a
   omissão fica documentada na sua própria página de privacidade.

### Caminho B — se um dia o DNS for para a Vercel

Aí você precisa recriar os registros à mão em **Settings → Domains → o domínio → DNS Records**:

| Tipo | Nome | Valor | Prioridade |
|---|---|---|---|
| `MX` | `@` | o servidor de e-mail da HostGator (`mail.walkstamp.com` ou o que o cPanel indicar) | `0` |
| `TXT` | `@` | `v=spf1 +a +mx +ip4:SEU.IP.AQUI ~all` (copie o que a HostGator já usa) | — |
| `TXT` | `default._domainkey` | a chave DKIM que a HostGator gerar | — |

**Copie os valores exatos do cPanel antes de trocar o nameserver**, não depois. Depois o painel antigo
pode já não mostrar mais.

### Vale a pena um segundo endereço?

Sim, e é grátis: um encaminhador `contato@walkstamp.com` para o mesmo lugar. `privacidade@` é o canal
legal e assusta quem só quer relatar um defeito.

---

## Parte 4 — Depois que estiver no ar

**Habilite o Web Analytics** — Project → Analytics → Enable. Sem isso, a rota
`/_vercel/insights/script.js` não existe e o navegador loga erro.

**Confira o CORS do Supabase** com a linha de console que está no fim do `MEDICAO.md`.

**Apague as funções antigas do banco.** O schema virou `walkstamp` e as funções `walkstamp_*` são as
novas, mas as `clipcontext_*` continuam existindo de propósito: o site que está no ar agora ainda chama
elas, e derrubá-las antes do deploy novo quebraria a medição no meio. Depois que o deploy novo estiver
no ar e você confirmar que a medição continua chegando:

```sql
drop function if exists public.clipcontext_evento(text,text,text,text);
drop function if exists public.clipcontext_interesse(text,text);
```

**Peça reindexação.** No Google Search Console, adicione `walkstamp.com` como propriedade e use
*Mudança de endereço* apontando do domínio antigo — é o que faz o buscador transferir o que existir de
reputação em vez de tratar como site novo.

---

## Resumo, na ordem

| | o quê | onde |
|---|---|---|
| 1 | Adicionar `walkstamp.com` e `www` ao projeto | Vercel → Settings → Domains |
| 2 | Criar `A @ → 76.76.21.21` e `CNAME www → (valor da Vercel)` | HostGator, zona de DNS |
| 3 | Criar a caixa ou o encaminhador `privacidade@walkstamp.com` | cPanel da HostGator |
| 4 | **Testar o e-mail recebendo de fora** | seu telefone |
| 5 | Adicionar `.app`, `.com.br` e `clipcontext.app`, e redirecionar os três | Vercel → Domains → Edit → Redirect to |
| 6 | Publicar o build novo | seu fluxo de deploy |
| 7 | Habilitar Web Analytics e conferir o CORS | Vercel → Analytics |
| 8 | Derrubar as funções `clipcontext_*` | Supabase, SQL acima |

Os passos 3 e 4 são os que eu não pularia. O resto, se der errado, você percebe e conserta; e-mail que
não chega você **não** percebe — e é justamente o canal que tem prazo legal.

---

## Fontes

- Adicionar e configurar domínio na Vercel — https://vercel.com/docs/domains/working-with-domains/add-a-domain
- Redirecionar domínios (o campo só aparece com mais de um) — https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting
- A Vercel não oferece serviço de e-mail — https://vercel.com/kb/guide/using-email-with-your-vercel-domain
- Por que o e-mail parou depois de apontar o domínio para a Vercel — https://vercel.com/support/articles/why-has-email-stopped-working
- `A` no apex e CNAME no `www` — https://vercel.com/kb/guide/a-record-and-caa-with-vercel
