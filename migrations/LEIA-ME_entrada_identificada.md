# Entrada do banco já identificada

## O que mudou
Antes: lançar a entrada → depois clicar em "De quem é?" → depois identificar.
Três passos, quando na maioria das vezes você já sabe de quem é ao olhar o
extrato.

**Agora a família entra no próprio formulário.** Digite o nome, escolha, e a
entrada já nasce creditada.

## E as lavagens
Ao escolher a família, aparecem **as lavagens dela que estão em aberto** — com o
jazigo e a data de cada uma. Todas vêm marcadas (é o normal: o Pix paga o que
está devendo), e você desmarca o que não for.

Isso importa nos avulsos que só pagam contra a foto: dá para dizer *"este R$ 90
é da lavagem de outubro"*, e não só *"a família pagou R$ 90"*.

O sistema faz as contas na hora:
- **Valor maior que o marcado** → *"Entrou R$ 20 a mais — vira crédito da família."*
- **Valor menor** → *"Falta R$ 30 para quitar tudo que está marcado."*

E ao escolher a família, o valor já vem **sugerido** com o total em aberto dela.

## Não sabe de quem é?
Deixe a família em branco. A entrada fica na fila de identificação, como antes,
com os palpites por nome e por valor. Os dois caminhos continuam existindo.

## Por baixo
Uma tabela nova (`quitacoes`) liga cada crédito aos débitos que ele pagou. Isso
permite:
- pagamento **parcial** de uma lavagem
- um Pix pagando **várias** lavagens
- saber, de cada lavagem, **quanto já foi pago**

Testado no banco: quitar só a lavagem escolhida deixando a outra em aberto,
sobra virando crédito, e a mesma transação lançada duas vezes não duplicando.
