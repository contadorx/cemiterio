# Build 6 — a fila lembra o que aconteceu

**Estado:** outbox e alertas entregues e provados em banco limpo. `0076` e
`0077` aplicadas em produção. Falta a tela e os itens de privacidade.

---

## 1. Um enum que faltava — e que parava a função inteira

`api/fila/route.ts` reserva o item antes de enviar:

```ts
const alvo = acao === "enviar" ? "enviando" : "descartado";
.update({ status: alvo, ... }).eq("status", "aguardando")
```

Essa reserva é o que impede o clique duplo de mandar a mesma foto duas vezes.

Mas `sureya_status_fila` no repositório é `('aguardando','enviado','descartado')`
— **sem `enviando`**. Produção tem, criado à mão. Num ambiente reconstruído do
repositório o update falha com `invalid input value for enum`, o erro cai no
`if (eRes) return 500`, e **nenhuma mensagem sai da fila**.

Não é degradação: é a função inteira parada. Corrigido na `0076` (arquivo
separado — `alter type add value` não roda em transação).

É o **terceiro** enum com essa história: `lavagem` na 0065, `abertura` na 0069.
O padrão é sempre o mesmo — alguém acrescenta o valor direto no banco para
destravar o dia, e a migration não é escrita.

---

## 2. Três buracos na fila — `migrations/0077_outbox_com_estado_legivel.sql`

### 2.1 Uma retentativa reenviava as fotos que já saíram

O envio manda a legenda na primeira foto e depois as outras, uma a uma:

```ts
await enviarWhatsappMidia(telefone, fotos[0], corpo);
for (const extra of fotos.slice(1)) await enviarWhatsappMidia(...);
```

Se a segunda falhava, o `catch` devolvia o item para `aguardando`. A Sureya
tocava em Enviar de novo — e **a primeira foto saía pela segunda vez**.

Do lado da família: duas fotos iguais do túmulo do pai, com a mesma legenda. E o
WhatsApp não tem desfazer.

O critério de saída do Build 6 é literal: *"envio repetido não duplica
mensagem"*. Duplicava.

`fotos_enviadas` marca onde parou, e **nunca diminui** — se a tentativa 2 mandou
duas fotos e a 3 quebra logo na primeira, o contador continua 2. Sem esse
detalhe, a tentativa 4 reenviaria tudo de novo.

### 2.2 Item que morria em `enviando` sumia para sempre

A reserva marca `enviando` antes de chamar a Evolution. Se o processo caísse ali
— timeout da função, deploy no meio, rede — ninguém devolvia o item. E a tela
lista só `aguardando`.

**A mensagem sumia:** a família não recebia, e não havia tela em que isso
aparecesse. É o pior tipo de falha, porque não gera erro para alguém ver.

`sureya_fila_destravar` devolve o que está preso há mais de 10 minutos, com o
motivo escrito em português. Roda **ao abrir a tela, não em cron**: rotina que
mexe em fila sozinha, sem ninguém olhando, é exatamente como o item some.

### 2.3 A fila não guardava por que falhou

O erro ia para a tela de quem estava ali naquele segundo. Depois disso, nada.

Agora a fila responde: *"tentou 3 vezes, a última há 10 minutos, o WhatsApp
estava desconectado"* — sem ninguém abrir log. E distingue **transitório** (vale
tentar de novo) de **permanente** (sem telefone: alguém tem de mexer no
cadastro), porque a ação é diferente e hoje as duas chegavam com o mesmo texto.

---

## 3. Os alertas — `sureya_alertas`

| Alerta | Gravidade |
|---|---|
| mensagens presas no envio | alta |
| mensagens que já falharam 3+ vezes | alta |
| falhas que não vão sair sem alguém corrigir o cadastro | alta |
| famílias sem responsável financeiro (D-01 deixando de valer) | alta |
| mensagens paradas há mais de 3 dias | média |
| limpezas dos últimos 30 dias sem cobrança | média |
| entradas no banco sem dono | média |

Toda linha tem número e **onde resolver**. Alerta sem ação é ruído que ensina a
ignorar alerta — e o teste cobra isso: `todo alerta diz ONDE resolver`.

---

## 4. Provas no CI

26 novas, em banco reconstruído do zero. As que importam:

```
ok  a RETENTATIVA COMECA DA TERCEIRA FOTO, nao da primeira
ok  o contador de fotos NUNCA diminui
ok  o segundo clique nao reserva de novo
ok  item preso em `enviando` vira alerta
ok  envio em andamento nao e destravado por engano
ok  concluir duas vezes nao reabre nada
```

**Total: 133 testes + 75 provas de comportamento em SQL.**

---

## 5. O que falta do Build 6

- **a tela** mostrar tentativas, último erro e "2 de 3 fotos já foram";
- fila de liberação com antes/depois, data/hora, destinatário e jazigo (entrega 1);
- confirmar descarte e oferecer desfazer (entrega 2, metade);
- **buckets privados com URL assinada** (entrega 3) — hoje as fotos são públicas
  por URL, e é o item de privacidade mais sério do build;
- política de retenção/exclusão/consentimento LGPD (entrega 4);
- runbooks de deploy, rollback, rotação de segredos e restauração (entrega 7).
