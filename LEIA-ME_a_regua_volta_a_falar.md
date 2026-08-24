# A régua volta a falar

Era o item 2 da auditoria: **R$ 1.565,00 — 79% de tudo que está em aberto —
numa zona de silêncio**, com uma dívida de 379 dias que não gerava mensagem
desde o trigésimo.

---

## Eram dois silêncios, não um

**O primeiro** eu tinha medido: o último degrau da régua é +30, e o casamento é
por dia exato. Um débito com 31 dias não casa com nada. Nem 45, nem 379.

**O segundo eu não tinha visto.** A consulta só olhava dívidas dentro de
`between (v_dia - 365) and (v_dia + 365)`. Passar de um ano tirava a dívida da
régua **por inteiro**, independente de degrau.

Quem achou foi o teste. Escrevi `regua_repete.sql` com uma dívida de **379
dias** justamente por ser a mais velha de verdade em produção — e ele reprovou
o meu conserto: o degrau que repete casava, mas a dívida nem chegava ao laço.

Se eu tivesse escrito o teste com "uns 200 dias", teria consertado metade e
dito que estava resolvido.

O limite **para frente** ficou. Lançamento com data muito adiante é erro de
digitação, e cobrar por causa dele seria pior que não cobrar.

---

## Intervalo, não múltiplo

A primeira ideia foi repetir quando `(dias − degrau) % 30 = 0`. **Medi antes de
escrever:** hoje isso alcançaria **zero** das 7 famílias caladas — nenhuma está
num múltiplo exato. E pior, múltiplo depende de a rotina rodar *naquele dia*:
um dia perdido, e a família espera mais um mês. Seria consertar um erro de
silêncio com outro.

O que uma pessoa quer dizer com *"cobra de novo depois de um mês"* não é um
múltiplo — é **um intervalo desde a última vez que se falou**. É isso que o
degrau que repete faz agora.

---

## O que muda na prática

Na régua padrão, só o **último degrau (+30)** passou a repetir, **a cada 30
dias**. Os cinco anteriores (−5, −1, +3, +10, +20) continuam exatamente como
eram, no dia exato.

**O texto não foi reescrito.** O do +30 diz:

> *"Sobre a mensalidade em aberto: me avise como prefere seguir. Se não for
> possível continuar agora, tudo bem — é só me dizer para eu suspender as
> visitas sem constrangimento."*

Isso repete bem: pergunta, não ameaça, e oferece uma saída. São palavras que a
Sureya já aprovou, e não cabe a uma migração trocar o que a casa diz às
famílias. Para mudar, o lugar é **Configurações → Régua**, onde agora há também
o campo *"depois deste dia, repetir a cada ___ dias sem cobrança"*. Vazio = não
repete. O piso é 7 dias, no banco e na tela — quem digita "3" achando que são
meses precisa descobrir na tela, não pela família.

### Quantas mensagens isso põe na fila

Ensaiei em produção, dentro de um bloco desfeito. Se a rotina rodasse agora:

```
enfileirados 3 · limitados 27 · sem_degrau 23 · ja_pagos 13 · repetidos 0
```

**Três**, não trinta. As outras 27 são segundas dívidas de famílias que já têm
uma mensagem na fila hoje — a guarda de *uma cobrança por família por dia*
continua na frente.

E continua valendo o de sempre: **a régua enfileira, nunca envia.** Não existe
caminho dela para o WhatsApp, e esta migração não abriu nenhum. O disparo segue
manual pela fila do Conversas.

---

## O terceiro contador

O relatório da rotina ganhou `repetidos`: a repetição que **não** saiu porque
ainda não fez o intervalo.

Sem ele, a repetição contida cairia no mesmo silêncio que esta migração
conserta — e foi exatamente assim que o defeito original passou meses sem ser
visto, escondido atrás de um `sem_degrau: 65` que parecia diagnóstico.

---

## As guardas que continuam de pé

Onze verificações em `testes/regua_repete.sql`, cada uma para um jeito de o
conserto sair errado:

- a repetição **não** engole os degraus normais — exato ganha de repetição;
- **não** repete todo dia (isso deixaria de ser cobrança e viraria perseguição);
- **não** fura o adiamento da 0124 — quem combinou uma data não é alcançado;
- **não** cobra quem já pagou, por mais velha que seja a dívida;
- o banco **recusa** repetir a cada 3 dias.

## Dois erros meus, no caminho

**A consulta que se enganava sozinha.** O primeiro teste chamava a função e
lia a fila na mesma expressão. A ordem de avaliação é do planejador: ele podia
ler a fila *antes* de a função escrever nela. O teste reprovou código correto,
e eu quase fui procurar defeito na função. Agora são dois passos.

**Comparei carimbo com meia-noite.** A guarda do intervalo usava
`criado_em >= (v_dia - v_cada)::timestamptz`. Uma mensagem das 12h de trinta
dias atrás é maior que a meia-noite de hoje, então "faz exatamente 30 dias"
continuava bloqueando. A guarda do limite diário, três linhas abaixo, já
comparava `criado_em::date` — a forma certa estava ali do lado. Quem achou foi
o teste dos 30 dias.
