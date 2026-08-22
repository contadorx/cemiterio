# Correções da auditoria — leva 1 (as seis de esforço P + a tela da equipe)

**Build:** `npm run build` passa limpo. `npm run checar` acusa 4 avisos de render — **os quatro já existiam antes desta leva** (VisaoMapa:825, Remuneracao:148 e :242, jazigos:267) e não foram tocados.

**Nenhuma migration é necessária.** Nada aqui altera schema, apaga dado ou depende de coluna nova. Pode subir direto.

**24 arquivos mudaram.** Cada bloco abaixo é independente: se algum incomodar, dá para reverter só ele.

---

## 1. A foto do antes parou de ser apagada

**Arquivo:** `src/app/api/servico/concluir/route.ts`

Era uma linha: `foto_antes_url: urlAntes` sem condicional. A Nina tira a foto do antes no "Começar" (o `api/campo/iniciar` grava a URL); o `Concluir` só manda foto nova se ela tirar outra — e a tela desaconselha isso. Resultado: **toda conclusão normal do campo gravava `null` por cima**. O arquivo continuava no Storage, o ponteiro do banco sumia.

Agora só grava quando vem foto nova, igual ao `concluir-admin` já fazia.

**Como conferir depois de subir:** feche um jazigo pelo campo e olhe `servicos.foto_antes_url` — tem que continuar preenchido. Ou rode a consulta **S10** da auditoria: a contagem de executados sem foto do antes para de crescer.

**As antigas não voltam** — a URL foi perdida no banco. Os arquivos ainda estão no bucket `servicos/<org>/<servicoId>/antes-*.jpg`, então dá para recuperar depois, se valer a pena.

---

## 2. Um único "hoje" para o sistema inteiro

**Arquivos:** `api/agenda/dia`, `api/agenda/semana`, `api/agenda/reorganizar`, `api/campo/fechar-dia`, `api/campo/briefing`, `api/campo/conversa`, `api/servico/concluir`, `lib/briefing.ts`

O alocador grava `data_prevista` no fuso de São Paulo; essas rotas liam com `toISOString()` (UTC). Como a Vercel roda em UTC, **das 21h à meia-noite o app de campo pedia o dia de amanhã** e a lista da Nina aparecia vazia. O `fechar-dia` fechava o dia errado e o débito da limpeza caía no dia (e no mês) seguinte.

Todas passaram a usar `diaOperacao()` de `lib/vencimento.ts`, que já existia e já era usada pelo alocador.

**Como conferir:** abra `/campo` às 22h de um dia útil. A lista tem que continuar aparecendo.

**Ainda faltam as telas de financeiro** (Gestão, Entradas, Conta da equipe, Pagamento da equipe usam `toISOString` como valor inicial do campo de data). Deixei para a próxima leva de propósito: lá o `hoje` é *default de formulário*, mexe no que aparece preenchido na tela e merece um olhar seu antes.

---

## 3. WhatsApp real, telefone visível e aviso de lead novo

**Arquivos:** `lib/marca.ts`, `lib/env.ts`, `api/contato/route.ts`, `api/hoje/route.ts`, `app/page.tsx`, `painel/page.tsx`

- **O número agora é `5511949749101`.** Ele alimenta os seis botões de WhatsApp da home, o `telephone` da ficha do Google (schema.org) e o link do rodapé. Antes era o placeholder `5511999999999`.
- **O telefone aparece escrito no rodapé**, clicável como `tel:` — quem vai confiar o túmulo do pai a um desconhecido quer ver um número, e muita gente mais velha prefere ligar.
- **Lead do site agora avisa.** Três caminhos, do mais barato ao mais garantido:
  1. **Notificação no navegador** de quem está no painel (só funciona se as chaves VAPID estiverem configuradas).
  2. **WhatsApp no seu celular** — opcional. Preencha `SUREYA_AVISO_WHATSAPP` na Vercel com o número que deve receber o aviso (só dígitos, com 55 na frente). Se deixar vazio, nada acontece e ninguém quebra. *Sugestão: use um número diferente do número do negócio; a instância manda a mensagem a partir dele.*
  3. **Card no Início** — `🔔 N pessoas novas esperando resposta`, em amarelo, acima de tudo. Não depende de configuração nenhuma e é o mais confiável dos três.

Nada disso pode derrubar o formulário: os avisos estão em `try/catch` e o visitante recebe "ok" mesmo se o aviso falhar.

**Como conferir:** preencha o próprio formulário do site com um telefone de teste. O card amarelo tem que aparecer no Início.

---

## 4. Registrar pagamento agora zera a régua de cobrança

**Arquivos:** `lib/financeiro.ts` (função nova `zerarReguaSeQuitou`), `api/financeiro/pagamento-avulso`, `pagamento-manual`, `entradas`

A ficha da família **prometia na tela** que o pagamento "zera a régua de cobrança" e a rota não fazia isso. O estrago não era cobrar de novo — era o contrário: `cobranca_nivel` ficava queimado e, na próxima vez que a família ficasse em aberto, a régua a pulava **para sempre**, em silêncio.

Agora as três portas de dinheiro chamam a mesma função. Ela **só zera quando a conta ficou quitada** (saldo ≥ 0): pagamento parcial não apaga o histórico de lembretes, senão a família recomeçaria a régua do zero a cada R$ 10 pagos.

**Antes de comemorar, rode a consulta S14** da auditoria. Quem já estiver com `cobranca_nivel` no teto **sem dever nada** ficou assim antes desta correção e precisa ser zerado uma vez — o jeito mais simples é registrar qualquer pagamento (ou zerar direto no banco).

De quebra: `api/financeiro/pagamento-manual`, que estava sem nenhuma tela chamando, virou apenas mais uma porta usando a mesma função. Continua sem UI — decida depois se apaga ou se aponta alguma tela para ela.

---

## 5. A fila de envios parou de mandar a mesma mensagem duas vezes

**Arquivo:** `lib/envio.ts`

O cron roda a cada minuto e o `maxDuration` é 60s: duas execuções se sobrepõem com facilidade. Como o item só virava "enviado" **depois** do envio, as duas liam "pendente" e as duas mandavam — a família recebia a mesma foto (ou a mesma cobrança) em dobro.

**Sem migration:** o enum `sureya_status_envio` só tem `pendente/enviado/falhou`, então em vez de inventar um status novo, o item tem o `proximo_retry` empurrado 5 minutos à frente **antes** do envio. A execução vizinha não o enxerga mais. A condição `.lte("proximo_retry", agora)` dentro do próprio UPDATE é o que torna isso atômico.

Efeito colateral bom: se o processo morrer no meio do envio, o item volta a ficar elegível sozinho em 5 minutos, sem gastar uma tentativa.

**Como conferir:** ninguém relata mensagem repetida. Se quiser forçar o teste, chame `/api/cron/minuto` duas vezes ao mesmo tempo com a fila cheia.

---

## 6. O teto de gasto com IA voltou a existir

**Arquivos:** `lib/redator.ts`, `api/conversas/[id]/ajuda`, `api/leads/[id]/abordagem`

`podeChamarIa()` devolve o **objeto** `{pode, usadas, teto}`, e objeto em JavaScript é sempre "verdadeiro". Os três lugares faziam `if (!(await podeChamarIa()))` — que **nunca** era verdade. Campanha, reajuste, avaliação periódica e "me ajuda a escrever" gastavam sem freio, e a própria chamada incrementava o contador.

Agora leem `.pode`, e a mensagem de recusa diz quanto foi usado de quanto: *"Teto de IA do dia atingido (X de Y chamadas)."*

**⚠️ Confira `orgs.teto_ia_dia` antes de subir.** Se houver um valor baixo esquecido lá, o sistema vai começar a recusar de verdade — o que até hoje nunca aconteceu. `0` significa sem teto.

---

## 7. A aba "Pagamento da equipe" parou de mentir

**Arquivos:** `api/equipe/remuneracao/route.ts`, `painel/financeiro/Remuneracao.tsx`

O select pedia `tumulos(codigo,quadra)` — colunas que **não existem** em `tumulos` (`codigo` é de `quadras`; o túmulo tem `identificacao` e `quadra_id`). O PostgREST rejeitava o select inteiro, e como o erro era descartado, a tela mostrava **jazigos 0, receita R$ 0,00 e o comparativo zerado** — bem ao lado de um "A pagar" com o valor certo, porque aquela outra consulta não tem join.

Colunas corrigidas, e agora o erro aparece na tela em vez de virar zero. O título da mensagem de erro também deixou de chutar "precisa da migration 0031", que mandava procurar no lugar errado.

**Como conferir:** abra Financeiro → Pagamento da equipe num mês com serviços. Os números têm que bater com a coluna "A pagar" ao lado.

---

## O que NÃO foi mexido nesta leva

- **`valor_vigente`** — é sua decisão, muda o quanto a família paga. Continua como estava.
- **`proxima_cobranca`** — idem: continua só mudando por digitação.
- **Campo offline** (melhoria 8), **painel de rotinas** (7), **índice único de túmulos** (9) e **menos toques** (10) — são M/G, ficam para as próximas sessões.
- **`agenda.ts:232`** (avança `proximo_servico` mesmo com insert falho) e **`servico.ts:121`** (marca notificado mesmo falhando) — são P, mas mexem no gerador de agenda e no envio à família. Prefiro fazer com você olhando.

---

## Variável nova na Vercel (opcional)

```
SUREYA_AVISO_WHATSAPP=5511XXXXXXXXX
```

Só isso. Se não cadastrar, tudo continua funcionando — o aviso de lead sai pelo card do Início e pela notificação do navegador.
