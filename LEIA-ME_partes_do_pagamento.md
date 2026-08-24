# O pagamento tem partes

Veio dos R$ 10,00 da Josiane. Ela pagou R$ 100,00 por R$ 90,00 de competências
e a sobra virou saldo credor. O número ficava certo — **e a ficha não contava o
que tinha acontecido**. Daqui a três meses ninguém lembra se foi arredondamento,
gorjeta, uma flor avulsa ou erro de digitação.

E o caso inverso era pior: quando a família atrasa e você cobra juros, ou quando
você perdoa parte, não havia onde escrever. Ou o valor entrava inteiro e a dívida
sumia sem explicação, ou entrava pela metade e a família ficava devendo o que já
tinha sido perdoado.

## Como fica

Em **Conta corrente → Pagamento**, embaixo do valor, um link discreto:
*"teve desconto, juros, multa ou outros?"*. Ele abre quatro campos.

No dia a dia você não vê nada disso — recebe o valor cheio e lança. Quando
precisa, abre.

## A conta, antes de lançar

```
o que abate da dívida = recebido + desconto − juros − multa − outros
```

A tela mostra esse número enquanto você digita. Se der diferente do que você
esperava, o erro está ali e não no razão da família — que é o lugar caro de
descobrir.

**Por que juros e multa diminuem:** porque saem de *dentro* do que entrou. A
família atrasou, você cobrou R$ 5 de juros e ela pagou R$ 65. Dos 65 que caíram,
5 são juros e 60 abatem a mensalidade. Somar os juros ao recebido faria a dívida
cair 70 — e você estaria perdoando R$ 10 sem querer.

**Por que o desconto soma:** é valor que você abre mão de receber. Ela pagou 50,
você perdoou 10, e os 60 de dívida somem inteiros.

## Cada parte vira uma linha, com seu próprio lado

| campo | vira | por quê |
|---|---|---|
| valor recebido | **crédito** · `pagamento` | o dinheiro que caiu na conta |
| desconto | **crédito** · `desconto` | abate a dívida sem dinheiro nenhum |
| juros | **débito** · `juros` | cobrança de atraso, que o dinheiro paga |
| multa | **débito** · `multa` | idem |
| outros | **débito** · `outros` | o que entrou e não é mensalidade |

Os três casos, resolvidos pelo mesmo desenho:

| situação | você digita | efeito |
|---|---|---|
| **arredondamento** (a Josi) | recebido 100, outros 10 | abate 90 · fecha em zero |
| **atraso** | recebido 65, juros 5 | abate 60 · os 5 viram receita |
| **perdão** | recebido 50, desconto 10 | abate 60 · a receita do mês cai 10 |

## Tudo ou nada

Cinco escritas separadas podem falhar no meio: o crédito entra, o débito de juros
não, e a família fica com saldo a favor que nunca existiu. As cinco linhas nascem
na mesma transação, ou nenhuma nasce.

Três travas: nenhuma parte pode ser negativa (o lado do dinheiro mora no tipo, e
um desconto de −10 seria cobrança silenciosa); juros + multa + outros não podem
passar do recebido (a família sairia devendo *mais* depois de pagar — isso é
sempre erro de digitação); e receber zero só vale quando houve desconto, porque
"não entrou dinheiro e não perdoei nada" não é pagamento, é clique errado.

A competência continua sendo carimbada pelo gatilho que já existia. Uma regra,
um lugar.

## O painel passou a enxergar

Juros e multa são **receita** e não apareciam em lugar nenhum. Desconto é receita
que você abriu mão — **sai** do total, e não vira "recebi menos".

Sem essa parte, a receita do mês ficaria menor que a verdade toda vez que você
cobrasse juros, e maior toda vez que perdoasse. Duas telas com contas diferentes
sobre os mesmos fatos é o defeito que este projeto mais repete — agenda (0092),
painel (0105), lista de famílias (0106), prévia (0115).

O rodapé do cartão de receita mostra a composição, e some quando é zero.

## Os R$ 10,00 da Josi

**Não mexi.** Continuam como saldo credor a favor dela.

Se foi arredondamento e você não quer que vire desconto em outubro, eu lanço um
`outros` de R$ 10,00 na data do Pix e a conta dela fecha em zero. Se for para
ficar como crédito, está certo do jeito que está. Me diz.

## Provas

`testes/pagamento_composto.sql`, 23 verificações, incluindo:

- os três casos acima, conferidos pelo saldo final da família
- receber zero com desconto vale; zero em tudo é recusado
- partes maiores que o recebido são recusadas — **e a recusa não deixa meia
  linha para trás**
- o painel enxerga juros, multa, outros e descontos
- e `resultado.receita` usa **o mesmo número** do bloco de receita

`npm run ci` verde. O placar do banco reconstruído bate com produção nos quatro
números.
