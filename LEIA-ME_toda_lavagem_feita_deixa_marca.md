# Toda lavagem feita deixa marca

*Migration 0137 · 27 de agosto*

## O que o backlog dizia, e por que o nome estava errado

O item chamava-se **"lavagem executada que não virou dinheiro"**. Fui medir
antes de escrever, e o nome não se sustenta.

Desde a migration 0104 **a lavagem não gera dívida nenhuma** — quem cobra a
família é a competência do mês. É de propósito: se a lavagem também lançasse
valor, uma família com contrato de R$ 100 e quatro limpezas seria cobrada duas
vezes pelo mesmo serviço. Uma lavagem sem lançamento no extrato **não é um
defeito**. É o projeto.

O que está realmente faltando é outra coisa, e é interna.

## O que se mediu

Cinco lavagens executadas em produção. Delas:

| o que falta | quantas |
|---|---|
| sem `valor` — a limpeza foi feita e não tem preço nenhum | **2 de 5** |
| sem `custo_estimado` — o material não saiu do estoque | **2 de 5** |
| sem `valor_executora` — ninguém sabe quanto a Nina ganhou | **5 de 5** |
| com foto e sem linha na fila — a família nunca recebeu | 1 de 5 |

As duas sem preço são as duas do jazigo Q1-R5-007, registradas pelo painel em
03/08 e 10/08.

## As duas causas

Elas se parecem o suficiente para terem passado juntas, mas são diferentes — e
o conserto de uma não é o conserto da outra.

### 1. A porta de trás

Havia **quatro** portas que marcam uma limpeza como feita. Três chamam
`sureya_concluir_lavagem`, que é uma transação só. A quarta —
`POST /api/servico` com `dataExecutada` — escrevia à mão.

Uma limpeza que entra por ali nasce sem quatro coisas que a transação faz: a
cascata do preço (serviço → jazigo → referência da casa), a baixa do estoque, o
pagamento da equipe e a fila da foto. Com o campo de valor em branco no
formulário, ela nasce **sem preço nenhum**.

É o defeito de forma que este projeto mais repete — duas implementações da mesma
regra que começam iguais e terminam discordando. Já aconteceu na agenda (0092),
no painel (0105), na lista de famílias (0106) e na conferência (0115).

**Agora as quatro portas chamam a mesma transação.** Uma regra, uma
implementação.

### 2. A regra que não existe

`remuneracao_regras` está **vazia** — zero linhas. A transação faz `if found` e
segue calada, e ela está certa: não dá para inventar quanto alguém ganha.

O defeito não é ela calar. É **ninguém ficar sabendo**: o trabalho fica feito, o
pagamento fica em aberto, e nenhuma tela diz isso. Foram cinco limpezas.

## O que foi construído

**A lista.** `sureya_lavagens_incompletas(p_org)` devolve as limpezas que não
deixaram alguma das quatro marcas, com o motivo em português. Só lê — não
escreve em lugar nenhum. `p_org` explícito porque `current_org_id()` é nulo fora
de uma sessão de usuário (lição da 0103).

**A tela.** Configurações → O sistema → **Manutenção**. Ela mora em "O sistema" e
não em "O dinheiro" porque o que ela conserta é *registro*, não cobrança.

**O conserto.** Um toque. Ele chama a própria `sureya_concluir_lavagem` — que
desde a 0066 foi escrita para ser chamada duas vezes: ao ver um serviço já
`executado` ela não refaz a transição, ela **confere os efeitos** e devolve, em
`reparos`, o que carimbou agora. Escrever aqui um segundo cálculo de valor seria
a quinta implementação da mesma regra.

**O aviso na tela inicial.** O bloco *Precisa de você* passa a mostrar as
limpezas pela metade — mas embaixo, junto do "quando der". O trabalho já foi
entregue: não há ninguém do outro lado esperando.

## Três coisas que ele de propósito **não** chama de defeito

**Lavagem sem lançamento.** Explicado acima. É o projeto.

**Lavagem sem foto.** Registrar à mão uma limpeza antiga é legítimo, e não há
foto para mandar. Só vira falta quando a foto **existe** e a família nunca a
recebeu. Cobrar uma fila de quem nunca teve foto seria inventar uma ausência —
é o mesmo "vazio não é zero", agora do lado do alarme.

**Pagamento não calculado, enquanto não houver regra nenhuma.** Se a casa não
tem regra, acusar cinco (ou duzentas) limpezas por causa de uma configuração
que falta transforma um recado em duzentos alarmes. Alarme que sempre grita
ensina a ignorar alarme — e aí o dia em que ele estiver certo passa batido
também. Enquanto não houver regra, o aviso é **um só**, e aponta para
Financeiro → Pagamento da equipe. Assim que houver, ele se cala e o alarme por
limpeza acende. Um só aparece quando o outro se cala, e o teste verifica os dois
lados.

## O que o conserto não faz

**Não põe foto antiga na fila.** `p_foto_depois` vai nulo de propósito, mesmo
quando a lavagem tem foto. Nada sai sozinho de qualquer jeito — a fila espera o
seu toque —, mas botão de consertar número não decide o que vai ser dito à
família. Uma foto de 3 de agosto aparecendo na fila hoje é escolha sua, pela
tela de Conversas.

**Não diz que consertou o que não consertou.** Depois de rodar, ele relê a lista
no banco e informa quantas continuam nela. Enquanto não houver regra de
pagamento, "2 completadas" com 2 ainda na lista é o resultado honesto — e é o
que a tela mostra.

## O que fica na sua mão

Definir a regra de pagamento em **Financeiro → Pagamento da equipe**. É a única
coisa aqui que o sistema não pode decidir sozinho: quanto a Nina ganha por
jazigo é combinado entre vocês dois. Enquanto isso não existir, o valor da
equipe fica em aberto em toda limpeza — as cinco de agosto e as que vierem.
