# A régua de prioridade

Você pediu uma sugestão de régua, publicada como configuração. Aqui está — e
uma coisa importante antes dos números.

## O que eu medi antes de escolher os pesos

Fui ver quais sinais existem de verdade na produção hoje:

| motivo | alcança hoje |
|---|---|
| Nunca foi lavado | **80** |
| Atrasado | 1 |
| Ficou para depois | 0 |
| A família pediu | 0 |
| Data de memória chegando | **0** — nenhum dos 62 falecidos tem data |

**Cinco dos seis dariam zero agora.** Isso não os torna errados — mas torna a
tela obrigada a dizer isso, senão você mexe num peso, não vê efeito, e conclui
que está quebrada.

Por isso a tela mostra **quantas lavagens cada motivo alcança hoje**, ao lado do
peso. Motivo com zero não está quebrado: é um caso que ainda não aconteceu.

## A régua que eu sugiro

Os pontos **somam**. Um jazigo nunca lavado (25) e atrasado duas semanas
(2 × 10) fica com 45 — na frente de um que ficou para depois uma vez (15).

| motivo | peso | por quê |
|---|---|---|
| **Data de memória chegando** | 40 | O único com **prazo fatal**. A família visita no dia, e o dia não se remarca. |
| **A família pediu** | 30 | Alguém pediu e está esperando. Normalmente aceita dois dias — por isso abaixo da memória. |
| **Nunca foi lavado** | 25 | Contrato novo. É quando a família forma opinião sobre o serviço. |
| **Ficou para depois** (por vez) | 15 | Promessa que a operação fez a si mesma e não cumpriu. Era o único que existia antes. |
| **Atrasado** (por semana) | 10 | Acumula. Um dia de atraso não é uma semana. |
| **Faz tempo desde a última** (por mês além do ciclo) | 5 | Sujeira que se vê. |

Onde ajustar: **Configurações › O dinheiro › Régua de prioridade**. Fica ao lado
da régua de cobrança de propósito — são as duas réguas do sistema, e quem
procura uma procura a outra.

**Peso negativo empurra para o fim da fila** em vez de desligar o motivo. Serve
para o caso que deve ser feito por último, mas continuar sendo considerado.

A mudança vale na próxima vez que a agenda for gerada ou reorganizada. O que já
está marcado não se mexe sozinho.

## Duas decisões que valem explicar

**A régua soma, não substitui.** `servicos.prioridade` continua existindo e
continua valendo — é o número que o "não deu para fazer" escreve, e ele guarda
*história*. A régua responde ao *mundo de hoje*. Trocar uma pela outra perderia
metade da verdade.

**A prioridade passou a se explicar.** Antes era um número mudo: "este veio na
frente", sem dizer por quê. Agora vem com os motivos — *"nunca foi lavado (25) +
atrasado 2 semanas (20)"*.

## O defeito que o teste achou

Eu escrevi o teste, ele criou uma org própria como fixture, e reprovou:

> `PRIORIDADE FALHOU — a regua nasce com os seis criterios: vieram 0`

Era para ser só um fixture. O que ele achou é real: **uma org criada depois da
migração nasceria com a tabela vazia** — e a régua não faria nada, em silêncio.
Sem erro, sem log, com a agenda saindo ordenada só por quadra e rua, como antes.

Virou um gatilho: toda org que nascer daqui para frente já vem com a régua.

## Provas

**14 checagens em SQL** no banco limpo: que cada critério soma o que diz que
soma; que "nunca lavado" não conta para quem já teve uma lavagem; que mexer no
peso **muda a ordem**; que desligar um critério tira só ele; que peso negativo
empurra para o fim; e que `anon` não executa as funções da régua.

**11 guardas estáticas**, entre elas que peso em branco não vira zero (isso
desligaria o critério em silêncio), que contagem falhada vira "?" e não zero, e
que mexer na régua fica na auditoria — a ordem da rota da Nina mudou por decisão
de alguém.

`npm run ci` verde: 253 testes, 126 migrações, placar igual à produção nos
quatro números (tabelas 67, funções 134, gatilhos 26, policies 156).

## O que eu faria com ela agora

Com 80 jazigos entrando de contrato, **"nunca foi lavado" é o único motivo que
está pegando alguma coisa** — e é o certo para este momento: a primeira lavagem
de cada família nova sobe na fila.

Se quiser que a primeira leva saia por quadra em vez de espalhada, baixe esse
peso para 5 ou 10. Se quiser o contrário — cada família nova atendida o quanto
antes, mesmo custando caminhada — suba para 40.

E os dois zeros que mais valem a pena virar número: **as datas dos 62
falecidos** ligam o motivo mais forte da régua, e ele é o único que evita o pior
cenário do negócio — a família chegar no dia e achar o túmulo sujo.
