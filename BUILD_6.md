# Build 6 — a fila lembra o que aconteceu

> **A lista de pendências deste arquivo pode estar velha.** O inventário
> conferido e atualizado é o `PENDENCIAS.md`.

**Estado:** outbox e alertas entregues e provados em banco limpo. `0076` e
`0077` aplicadas em produção. Entregas 1, 2, 5 e 6 feitas; a 3 foi encerrada por
decisão (`DECISOES.md` D-03). Entrega 4 e 7 escritas (`POLITICA_DADOS.md`, `RUNBOOKS.md`); falta ensaiar a
restauração e decidir os prazos de retenção.

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

## 6. A tela da fila

### 6.1 O cartão dizia menos do que sabia

| O roadmap pede (entrega 1) | O que a tela fazia |
|---|---|
| antes/depois | duas fotos lado a lado, **sem dizer qual é qual** |
| data/hora | não mostrava |
| família **e** destinatário | `para \|\| familia` — colapsava os dois num nome só |
| jazigo | só quadra/rua, não a identificação |

O colapso de família e destinatário é o que mais custa: quando a **neta** recebe
a foto do jazigo da **avó**, a tela mostrava um nome e não dava para saber qual
dos dois era.

### 6.2 O rótulo antes/depois não podia ser adivinhado

`fotos` é montada como `[antes, depois]` com os nulos removidos (0066). Com duas
fotos a ordem resolve. **Com uma só, a posição não diz nada** — pode ser um
serviço sem foto do antes, ou sem a do depois.

Adivinhar pela posição erraria o rótulo justamente no caso em que ele importa.
Agora o rótulo vem do serviço, comparando a URL com `foto_antes_url` e
`foto_depois_url`. Foto que não casa com nenhuma fica **sem rótulo**, em vez de
receber um chute.

### 6.3 O estado da última tentativa, no cartão

A `0077` já guardava tudo; a tela não mostrava nada. Uma mensagem que falhou seis
vezes ficava visualmente idêntica a uma que acabou de entrar na fila.

Agora o cartão diz quantas tentativas, o erro, quando foi — e distingue
**transitório** de **permanente** com cor e texto diferentes, porque a ação é
diferente: um é "tente de novo", o outro é "alguém tem de mexer no cadastro".

E quando há retomada, o botão muda de `Enviar com 3 fotos` para **`Continuar
(faltam 1)`**, com a explicação ao lado: *"2 de 3 fotos já foram. Ao tentar de
novo mando só as que faltam — a família não recebe repetido."*

### 6.4 Descartar deixou de ser irreversível

"Não enviar" ficava ao lado de "Enviar", do mesmo tamanho, e agia na hora. Sem
confirmação, sem volta: a mensagem sumia da lista e a família nunca recebia,
sem ninguém perceber.

Agora pergunta antes, e depois oferece **desfazer** numa barra no topo — não
dentro do cartão que acabou de sumir. A rota ganhou `acao: "restaurar"`, com
`where status = 'descartado'`, que garante que isso nunca ressuscite algo já
enviado.

### 6.5 Uma coisa que o `id` quase deixou passar

O bloco de restaurar entrou antes da validação de `id`. Sem mover a checagem
para cima, um pedido sem `id` viraria `update ... .eq("id", undefined)` — que
não é rejeitado do jeito que se espera. A validação passou a ser a primeira
coisa do POST.

---

## 7. Uma observação sobre o portão do CI

**O projeto não tem ESLint configurado** — não há `.eslintrc`, e o `next build`
não roda lint. Os comentários `eslint-disable-next-line` espalhados pelo código
são decorativos.

Não é urgente e não foi mexido aqui, mas vale saber: o portão de qualidade hoje
é tipagem + testes + build, não lint.

---

## 8. O que falta do Build 6

- ~~a tela mostrar tentativas, último erro e "2 de 3 fotos já foram"~~ — **feito (6.3)**;
- ~~antes/depois, data/hora, destinatário e jazigo (entrega 1)~~ — **feito (6.1, 6.2)**;
- ~~confirmar descarte e oferecer desfazer (entrega 2)~~ — **feito (6.4)**;
- ~~buckets privados com URL assinada (entrega 3)~~ — **encerrada por decisão**
  (`DECISOES.md` D-03): as fotos ficam com link público, porque a família é
  idosa e qualquer passo a mais desequilibra o acesso. Medido: a listagem do
  balde já é bloqueada por RLS e os caminhos têm UUID, então o que se aceita é
  "quem tem o link abre", não "qualquer um descobre";
- ~~política de retenção/exclusão/consentimento LGPD (entrega 4)~~ — **escrita**
  em `POLITICA_DADOS.md`, com o D-03 declarado e a lista do que a remoção não
  alcança hoje. Falta **decidir** os prazos e implementá-los;
- ~~runbooks (entrega 7)~~ — **escritos** em `RUNBOOKS.md`. Falta **ensaiar**:
  restauração, rollback de migration e cópia do Storage (que não existe).
