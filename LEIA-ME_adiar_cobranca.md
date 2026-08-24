# Adiar a cobrança até a data combinada

A família responde *"pode ser dia 15?"* e você não tinha o que fazer com essa
frase. As duas saídas eram ruins:

- **descartar** — e a régua criava outra amanhã, cobrando dois dias depois de
  você ter dito "combinado, dia 15"
- **deixar na fila** — e você olhando para a mesma linha todo dia, tendo de
  lembrar de cabeça que aquela já estava acertada

## Como fica

Em **Conversas → Liberação**, ao lado de *Enviar* e *Não enviar*, agora tem
**Adiar**. Você escolhe a data e, se quiser, anota o que foi combinado.

A mensagem sai da lista e o cartão passa a dizer:

> 🗓 Guardada até **15/09** — ela pediu para chamar dia 15 · até lá, nenhuma
> outra cobrança sai para esta família.

Um botão novo na barra de filtros — **guardadas para depois (3)** — mostra os
combinados quando você quiser conferir. Adiar não pode virar sumir.

E tem caminho de volta: **Trazer de volta** desfaz, e a mensagem reaparece na
fila hoje. Botão sem volta é armadilha.

## O silêncio é a promessa

Enquanto a data não chega, **nada de cobrança sai para aquela família** — nem a
régua do banco, nem a rotina da manhã. Uma segunda cobrança saindo antes da data
combinada desfaz na hora a confiança que a primeira construiu, e essa é a
conversa mais cara que esta casa pode ter.

Passada a data, a família volta a ser cobrável normalmente. Adiar é adiar, não é
cancelar para sempre — para isso existe a régua **"não cobrar"** na ficha.

## Onde a trava mora

Na **própria mensagem adiada**, e não num campo novo na família.

Dois lugares guardando o mesmo fato é o defeito que este projeto mais repete —
a agenda (0092), o painel (0105), a lista de famílias (0106), a prévia (0115).
Aqui ele daria *"adiei na tela e ela cobrou mesmo assim"*, que é a forma mais
cara de descobrir.

Uma consequência assumida: **descartar a mensagem adiada solta a trava.** Está
certo — descartar quer dizer "essa não vale mais", e aí a régua volta a decidir.

## Os dois lados fazem a mesma pergunta

Quem produz cobrança são duas coisas: a régua (no banco) e a rotina gentil da
manhã (no código). As duas chamam **a mesma função** para saber se a família
está segurada. Duas contas sobre o mesmo fato terminariam com uma respeitando o
combinado e a outra não.

## O que foi segurado aparece

A régua passou a contar **`adiados`**, e a rotina da manhã registra quantas
famílias pulou.

Sem isso, *"a régua não enfileirou nada hoje"* teria duas causas
indistinguíveis: ninguém devia, ou estava tudo adiado. Silêncio que não se
explica já custou dezenove dias de WhatsApp nesta casa.

## Três recusas

- **adiar para hoje** — não adia nada
- **mais de um ano** — isso não é adiar, é desistir; para isso existe a régua
  "não cobrar"
- **mensagem que já saiu** — adiar o que já foi enviado não desfaz nada, e a
  tela passaria a mostrar uma promessa que não existe

Adiar uma **foto** guarda só a foto: a trava é da cobrança.

## Provas

`testes/adiar_cobranca.sql`, 19 verificações. As que importam:

- a família que combinou **não recebe nada de novo** no dia seguinte, com uma
  nova competência vencida e um degrau disparando — enquanto a vizinha, que não
  combinou, recebe
- passada a data, a régua volta a olhar para ela
- desadiar derruba a trava junto
- adiar uma foto não cala a cobrança da mesma casa

Duas coisas que o próprio teste me ensinou, e que ficaram escritas nele:

1. **Colidi com os ids do meu teste anterior.** `on conflict do nothing` engoliu
   o insert em silêncio e o cenário nasceu torto — o erro só apareceu três
   passos depois, como "família não encontrada". Agora a primeira verificação do
   arquivo é *"o cenário foi criado mesmo"*.
2. **O total de enfileirados não servia como prova.** A trava "uma por família
   por dia" compara com a data real, não com o dia simulado, então some quando o
   teste roda a régua num dia futuro. Isso é artefato do teste, não defeito do
   sistema — mas medir pelo total faria a asserção medir o artefato. Agora a
   conta é por família.

`npm run ci` verde. O placar do banco reconstruído bate com produção nos quatro
números.
