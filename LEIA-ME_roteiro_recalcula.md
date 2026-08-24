# O roteiro passa a se refazer, e a rua aprende sozinha

## 1. Refazer o roteiro — o recálculo que faltava

Na agenda, quando há o que redistribuir, aparece uma caixa:

> **34 lavagens entraram depois da última distribuição**
> Quando um contrato entra, as lavagens novas são encaixadas nos dias com vaga —
> o roteiro que já existia não é repensado. Refazer devolve **112** lavagens
> para a fila e distribui tudo de novo, a partir de amanhã.
> **[ Refazer o roteiro de amanhã em diante ]**

**O que ele mexe e o que não mexe:**

| solta e redistribui | não toca |
|---|---|
| agendada, de amanhã em diante, não fixada, não iniciada, sem foto | **hoje**, o passado, o que você remarcou à mão, o que já começou, o que já tem foto |

**Hoje não se mexe** — a Nina já abriu a lista no celular, e a rota não pode
mudar debaixo dela. É o "o roteiro deve ser os próximos", virado regra.

### Por que não recalcula sozinho

A tentação era redistribuir a cada contrato salvo. Seria errado: você está
cadastrando duzentos contratos hoje, e a agenda inteira se remexendo a cada
"Salvar" é uma tela que pisca sem ninguém pedir — e duzentas rodadas de alocação
para chegar ao mesmo lugar de uma.

Então o sistema **mede e oferece**. Um clique, quando você decidir que terminou.
O número que ele mostra é real: lavagens futuras nascidas depois do último
recálculo completo, contadas contra um marco gravado no banco.

## 2. A rua aprende a ordem com a caminhada

**201 dos 266 túmulos não têm `ordem_na_rua`** — 75%. É o dado que decide a
última perna do roteiro, e sem ele a serpentina ordena as ruas para depois
embaralhar dentro de cada uma.

Digitar 201 ordens à mão é trabalho que ninguém faz — e, se fizesse, seria a
ordem do mapa, não a do chão.

**Agora ela entra sozinha:** a primeira vez que uma lápide é lavada, ela recebe
a próxima posição livre da rua dela. Depois de uma volta completa, a rua sabe a
sequência em que foi andada — que é a sequência certa por construção, porque foi
a que a pessoa escolheu estando lá, com o portão, o barranco e a torneira na
frente dela.

Duas garantias:

- **só preenche o vazio.** Ordem já gravada — digitada por você ou aprendida
  antes — nunca é sobrescrita. Desfazer a correção de quem manda no sistema é a
  pior forma de discordar dela.
- **é gatilho, não código de rota.** Três caminhos concluem lavagem (campo,
  admin, "registrar feito"). Uma quarta que apareça amanhã aprende junto.

## 3. A próxima lavagem na linha da agenda

A linha já dizia há quantos dias o jazigo não é lavado. Agora diz também quando
vem a seguinte:

> Última lavagem 12/08 · 12 dias antes desta · registrada no campo
> **· próxima em 07/09 (14 dias depois)**

Com os dois números na frente, **pular ou excluir** deixa de ser chute:

- *não lavo há 40 dias e a próxima é só em setembro* → não pule
- *lavei anteontem e tem outra na quinta* → pode pular

E quando não há próxima, ela diz isso em amarelo: **"não há próxima marcada —
pular esta deixa o jazigo sem"**. Pular a última é ficar sem, e isso precisa
estar na tela na hora da decisão.

## 4. Remarcar leva as seguintes junto

Os botões de **← 1 dia** e **1 dia →** por linha estavam movendo só aquela
lavagem. Agora levam as próximas daquele jazigo, mantendo o intervalo combinado
— e a data escolhida fica fixada, então o alocador não desfaz.

Mover só uma encurtaria o vão até a próxima, e a família paga por intervalo, não
por data solta.

**A exceção continua sendo o dia inteiro:** puxar um dia com ← / → no cabeçalho
**não** arrasta o ciclo. Mover uma lavagem quer dizer "essa aqui muda"; mover um
dia quer dizer "choveu" — e arrastar o ciclo de quinze jazigos por causa de uma
chuva mudaria meses de agenda sem ninguém pedir.

---

## Provas

`testes/roteiro_recalculo.sql`, 12 verificações. As que importam:

- a rua aprende **na ordem da caminhada**, continuando de onde a numeração
  digitada parou (não do 1)
- a ordem digitada à mão **sobrevive** à lavagem
- o refazer solta **só** a de amanhã: hoje, remarcada à mão, já começada e com
  foto ficam onde estão
- pedir para soltar a partir de ontem vira amanhã

`npm run ci` verde, 217 testes, placar batendo nos quatro números.

## Um erro meu, no caminho

Ao criar o teste, salvei em `testes/roteiro.sql` — **que já existia**, com treze
verificações sobre as ruas costuradas da 0084. Sobrescrevi. Recuperei do git na
mesma hora e renomeei o meu para `roteiro_recalculo.sql`; os dois rodam agora, e
conferi os treze checks originais passando. Não houve perda — mas foi por pouco,
e a lição é escolher nome de arquivo olhando o que já está lá.
