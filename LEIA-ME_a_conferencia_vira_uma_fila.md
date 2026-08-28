# A conferência vira uma fila de decisões

*Migration 0141 · 28 de agosto*

**Nenhum dado seu foi tocado.** Este build muda o que a conferência *chama* de
pendência e o que a tela oferece. As 363 famílias continuam exatamente como
estavam — inclusive os 78 jazigos e o resto que você vai rever com a Sureya.

## O que se mediu

363 famílias, 63 conferidas, 293 com pendência obrigatória. E a lista do que
falta tinha **o número 122 quatro vezes**:

| pendência | famílias |
|---|---|
| contrato ou avulso | **290** |
| jazigo cadastrado | 122 |
| jazigo com quadra e identificação | 122 |
| ritmo da limpeza | 122 |
| valor combinado | 122 |
| telefone de quem responde | 33 |
| responsável financeiro | 27 |

## Dois problemas, e os dois eram de leitura

### 1. O mesmo buraco contado quatro vezes

As quatro linhas de 122 são **as mesmas 122 famílias**: as que não têm jazigo
nenhum. Três daqueles itens diziam, literalmente, *"nenhum jazigo para
conferir"* — eles não encontraram um problema, eles **não tiveram o que
olhar**.

A soma das pendências era 838 para 293 famílias. E o efeito é pior que o
número: quem cadastra o jazigo de **uma** família vê **quatro** pendências
sumirem sem ter feito mais nada — e depois disso "293 com pendência" não quer
dizer coisa nenhuma.

O conserto é o que a própria função já fazia noutro lugar: `ritmo da limpeza`
devolve *"não se aplica"* quando a família é avulsa, porque avulso não tem
ritmo e **não ter não é faltar**. Sem jazigo, os três estão na mesma situação.

**Medido depois: 838 → 472**, e a lista passa a ter quatro linhas em vez de
sete. O número de famílias com pendência **não muda** (293) — está certo, elas
continuam com o mesmo cadastro pela metade. O que sumiu foi a contagem
quadruplicada.

### 2. 290 aberturas para 290 escolhas binárias

O cartão da tela dizia: *"290 famílias sem regime definido. Abra a ficha e
escolha uma das duas."* A rota já sabia responder isso desde sempre — o que
faltava era a **lista oferecer**.

Agora **Contrato** e **Avulso** ficam na própria linha. Só enquanto ninguém
decidiu: depois de decidido o regime é informação, e trocar de ideia continua
sendo na ficha, de propósito — mudar o regime de quem já tem contrato muda como
a família é cobrada, e isso não é decisão de passar o dedo.

## E o filtro pelo que falta

Uma fila de cada vez: as **290** do regime numa passada, as **122** sem jazigo
em outra, as **33** sem telefone depois. Cada tipo é um botão com o número
dentro.

Varrer 290 é trabalho de uma tarde. Varrer 363 procurando quais são as 290 é
trabalho de duas.

O resumo do topo continua sendo **do todo**, não do filtro: com um filtro ligado,
contar o filtrado faria "363 famílias" virar "290" e o número mudaria de
significado sem avisar. A tela diz separadamente quantas está mostrando.

## O que isto destrava

Das 293 famílias com pendência, **290 estão a um toque** de resolver a delas —
e 122 das restantes têm uma pendência só, que é cadastrar o jazigo. A
conferência deixa de ser 363 fichas para abrir e vira uma fila de decisões que
você percorre.

Quando as 290 estiverem respondidas, o número de "prontas e com contrato" — que
o piloto pede que seja 5 — passa a refletir a operação de verdade.
