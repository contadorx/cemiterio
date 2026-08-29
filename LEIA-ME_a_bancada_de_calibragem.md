# A bancada de calibração — a mesma pergunta, com dois ajustes, lado a lado

**Sem migration. Nenhum dado de produção tocado.**

Esta é a terceira peça do motor de calibração. As duas primeiras deram à IA o
que faltava (o catálogo, os pedidos, os comprovantes) e fizeram a promessa
virar linha. Esta é a que te deixa **ver o efeito de um ajuste antes de
salvá-lo**.

---

## Primeiro, uma correção

Eu tinha te dito que `/api/simulador` existia e estava **sem uso**. Estava
errado: ele era usado, pelo "Simulador de treino" dentro de *Conversas › Ensinar
a IA*. Fui ler e o problema era outro, e pior.

---

## Por que o simulador não conseguia responder a pergunta que importa

Três coisas, e nenhuma dava para ver de fora:

**1. A família era fictícia.** O contexto era montado à mão dentro da própria
rota: `"Maria (teste)"`, `"Família Exemplo"`, saldo `"em dia"`. Ele **não
passava por `montarContexto`** — então nenhum dos blocos que causaram as
promessas (a tabela de extras da casa, os pedidos em aberto, os comprovantes a
conferir) existia ali. Justamente o que a peça 1 acabou de consertar era
invisível no lugar onde você ia testar se tinha consertado.

**2. O prompt era outro.** A produção manda **dois blocos**, e o primeiro é
cacheado (o conhecimento do negócio — 3.822 caracteres, igual para todas as
famílias, cobrado uma vez e reaproveitado). O simulador mandava **um bloco só**,
com o conhecimento embutido. Afinar o tom ali era afinar contra um prompt que
nunca rodou.

**3. Ele dizia "✓ sairia automático".** Medido em 29/08: das 334 famílias com
IA ligada, **ZERO** estão em modo automático — nenhuma mensagem sai sozinha, por
decisão sua. O rótulo estava treinando você a confiar num caminho que não
existe.

É a mesma família de defeito de sempre: **duas implementações da mesma regra,
que divergem em silêncio** — como em 0092, 0105, 0106, 0115, 0137, 0140 e 0142.

---

## O que a bancada faz

Você escolhe **uma conversa de verdade**. Em 29/08 existem 174 conversas, mas só
**17** têm mensagem de família (43 mensagens no total) — as outras 157 são só
coisa que saiu daqui, e não há o que calibrar contra uma conversa em que
ninguém perguntou nada. A lista mostra só as 17.

A IA responde a última mensagem daquela família **duas vezes**:

- **"Como está hoje"** — com o tom e o conhecimento salvos.
- **"Com o seu ajuste"** — com o que você acabou de escrever nos campos acima,
  **ainda não salvo**.

Pelo **mesmo caminho da produção**: `montarContexto` para o contexto,
`montarSystemDeProducao` para o prompt. Uma montagem só, agora exportada e
compartilhada — não há mais uma segunda.

Tem também um campo **"E se ela perguntasse isto agora?"**, que entra **depois**
da conversa real, não no lugar dela. É como testar uma pergunta nova sem perder
tudo o que já foi combinado com aquela família.

### O painel "o que a IA recebeu"

É o coração da tela. Antes de mostrar as respostas, ela lista o que chegou até a
IA: quantas mensagens, quantos jazigos, o saldo, **a tabela de extras**, os
pedidos em aberto, os comprovantes a conferir.

Foi exatamente isso que estava faltando quando a IA prometeu conferir o preço
dos vasos que já estava cadastrado. Se o catálogo estiver vazio, a tela diz com
todas as letras: *"nenhum extra cadastrado — se ela perguntar preço de vaso, a
IA não tem o que responder"*.

### A promessa aparece antes de sair

Cada coluna diz se aquela resposta **prometeu voltar** e sobre o quê, ou se
**resolveu na hora**. É o sinal mais útil da tela: se o seu ajuste derrubou a
promessa, você vê na hora, sem esperar a próxima família escrever.

---

## Duas decisões que mudam o que a tela significa

### A variação do modelo fica desligada nos dois lados

O modelo é amostrado: a **mesma** pergunta com o **mesmo** prompt dá textos
diferentes a cada rodada. Numa tela de "antes e depois" isso é veneno — a
diferença que você veria seria em parte o seu ajuste e em parte o acaso, sem
jeito de separar, e você acabaria mudando o tom por causa de ruído.

Com a variação desligada (`temperature: 0`) nos dois lados, **o que sobrar de
diferença é o seu ajuste**. Isso é uma escolha da bancada, não da produção — e a
tela diz isso, para você não esperar que a resposta real saia idêntica.

### Igual não se compara consigo mesmo

Se você não mudou nada, ela roda **uma vez só** e diz por quê, em vez de gastar
o dobro para mostrar duas vezes a mesma coisa. Duas amostras do mesmo prompt
lado a lado convidam a ler diferença onde não houve mudança.

---

## O que ela não faz

**Não salva e não envia.** Salvar continua sendo o botão "Salvar treino";
mandar mensagem continua sendo manual, pela fila das conversas. Guarda estática
garante que a rota não chama função de envio nem grava rascunho.

**Não passa na frente das famílias.** A bancada respeita o teto de IA do dia e é
a última da fila: se o teto está a uma chamada de estourar, ela recusa e explica
— testar o tom não pode consumir a cota que faz a IA responder alguém de
verdade.

**Não esconde o custo.** Cada rodada são até duas chamadas ao modelo, e elas
entram em `chamadas_ia` com propósito **`calibragem`**. Se entrassem como
"atendimento", o custo do atendimento subiria e ninguém saberia por quê.

---

## Uma coisa que eu encontrei lendo o seu `tom`

O ajuste de tom salvo tem **786 caracteres** — quinze linhas de instrução
espremidas num campo de **uma linha só**, onde não dava para ler o que estava
escrito nem achar a frase que se queria mudar. Virou caixa de texto.

E ali, na última frase, está isto, escrito por você:

> *Quando não puder resolver na hora: "deixa eu conferir aqui e já te falo".*

Ou seja: **os 44% de promessas não eram um defeito da IA. Era ela obedecendo.**
E a regra está certa — ela é condicionada a *"quando não puder resolver"*. O
problema era que ela quase nunca **podia**, porque o preço não chegava até ela.

Por isso a ordem das três peças foi essa: dar o dado primeiro (peça 1), anotar o
que sobrar (peça 2), e só então uma tela para você ver a diferença (peça 3).
Mexer no tom antes disso teria sido tratar o sintoma.

---

## O que está provado

**5 asserções novas no simulador** (seção 12e), sobre a montagem do prompt, que
agora é função pura e testável:

- são dois blocos e só o primeiro é cacheado;
- o conhecimento vai **uma vez só** — repetir seria pagar duas vezes pelo mesmo
  texto em toda chamada, e o cache perderia a razão de existir;
- o tom vai no bloco do cliente;
- o catálogo da casa chega pelo mesmo caminho;
- sem conhecimento salvo, o bloco não escreve a palavra `null` dentro do prompt.

**8 guardas estáticas**, todas negativas de propósito — o defeito não era falta
de tela, era a existência de uma segunda montagem, e basta alguém recriar uma
para ele voltar inteiro:

- o simulador de família fictícia não existe mais;
- a bancada monta o contexto pelo caminho da produção, e **não inventa uma
  família dentro dela**;
- os dois lados rodam sem a variação do modelo;
- a bancada não envia nem grava resposta;
- o custo dela aparece separado do atendimento;
- a tela de ensinar a IA mostra a bancada, e o tom cabe numa caixa que se lê.

**CI inteira verde: 281 testes, 0 falhas.** Placar do banco reconstruído igual a
produção (tabelas 70, funções 143, gatilhos 27, policies 171).

---

## O que fazer quando abrir

1. *Conversas › Ensinar a IA*, role até a bancada.
2. Escolha a conversa do **Oscar Ferreira** — é a que perguntou *"Qual o valor
   dos 2 vasos que foram colocados?"* e recebeu uma promessa.
3. Rode sem mudar nada. Olhe o painel **"o que a IA recebeu"**: o preço da troca
   de vaso agora está lá.
4. Se ela ainda prometer voltar, aí sim mexa no tom — e veja o outro lado.
